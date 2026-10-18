import { coreSchema, DbProvider, TaxAdvanceKind } from '@family-finances/database'
import { Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { AccountsService } from '../accounts/accounts.service'
import { IncomeService } from '../income/income.service'
import { TaxesTypes } from './taxes.types'

const UNIQUE_CONSTRAINT_VIOLATION = '23505'

type ReturnRow = typeof coreSchema.taxReturn.$inferSelect
type AdvanceRow = typeof coreSchema.taxAdvance.$inferSelect

@Injectable()
export class TaxesService {
	constructor(
		private db: DbProvider,
		private accountsService: AccountsService,
		private incomeService: IncomeService,
	) {}

	/** Tax returns of the account (without the calculation), newest first. */
	async list(accountGuid: string): Promise<TaxesTypes.TaxReturnSummary[]> {
		await this.accountsService.get(accountGuid)
		return this.db.core.select({
			guid: coreSchema.taxReturn.guid,
			accountGuid: coreSchema.taxReturn.accountGuid,
			year: coreSchema.taxReturn.year,
			closedAt: coreSchema.taxReturn.closedAt,
		})
			.from(coreSchema.taxReturn)
			.where(eq(coreSchema.taxReturn.accountGuid, accountGuid))
			.orderBy(desc(coreSchema.taxReturn.year))
	}

	/** The year's return with the calculation, 12 months of advances and the settlement. `today` = `YYYY-MM-DD`. */
	async get(accountGuid: string, year: number, today: string = Months.today()): Promise<TaxesTypes.TaxReturn> {
		const row = await this.findRow(accountGuid, year)
		if (!row) throw new TaxesTypes.TaxReturnNotFoundError()
		return this.toTaxReturn(row, today)
	}

	/** Creates the year's return; constants are copied from the nearest earlier return of the account, else the defaults. */
	async create(accountGuid: string, year: number, today: string = Months.today()): Promise<TaxesTypes.TaxReturn> {
		this.assertValidYear(year)
		await this.accountsService.get(accountGuid)
		const [previous] = await this.db.core.select()
			.from(coreSchema.taxReturn)
			.where(and(eq(coreSchema.taxReturn.accountGuid, accountGuid), lt(coreSchema.taxReturn.year, year)))
			.orderBy(desc(coreSchema.taxReturn.year))
			.limit(1)
		const constants = previous ? this.pickConstants(previous) : TaxesTypes.DEFAULT_CONSTANTS
		try {
			await this.db.core.insert(coreSchema.taxReturn).values({ accountGuid, year, ...constants })
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		return this.get(accountGuid, year, today)
	}

	/** Overwrites the year's constants and income override. */
	async update(accountGuid: string, year: number, input: TaxesTypes.SettingsInput, today: string = Months.today()): Promise<TaxesTypes.TaxReturn> {
		const row = await this.getEditableRow(accountGuid, year)
		await this.db.core.update(coreSchema.taxReturn)
			.set({ ...this.pickConstants(input), incomeOverride: input.incomeOverride ?? null })
			.where(eq(coreSchema.taxReturn.guid, row.guid))
		return this.get(accountGuid, year, today)
	}

	async remove(accountGuid: string, year: number) {
		const row = await this.getEditableRow(accountGuid, year)
		await this.db.core.delete(coreSchema.taxReturn)
			.where(eq(coreSchema.taxReturn.guid, row.guid))
	}

	/**
	 * Sets the advance of `kind` in month (1-12); with `applyToFollowingMonths` ("nastavit od měsíce") also in every
	 * following month of the year. Months can then be edited one by one.
	 */
	async setAdvance(
		accountGuid: string,
		year: number,
		monthNumber: number,
		kind: TaxAdvanceKind,
		input: TaxesTypes.AdvanceInput,
		today: string = Months.today(),
	): Promise<TaxesTypes.TaxReturn> {
		if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)
			throw new TaxesTypes.InvalidTaxAdvanceMonthError()
		const row = await this.getEditableRow(accountGuid, year)
		const lastMonth = input.applyToFollowingMonths ? 12 : monthNumber
		const values = Array.from({ length: lastMonth - monthNumber + 1 }, (_, i) => ({
			taxReturnGuid: row.guid,
			month: monthNumber + i,
			kind,
			amount: input.amount,
		}))
		await this.db.core.insert(coreSchema.taxAdvance)
			.values(values)
			.onConflictDoUpdate({
				target: [coreSchema.taxAdvance.taxReturnGuid, coreSchema.taxAdvance.month, coreSchema.taxAdvance.kind],
				set: { amount: sql`excluded.amount` },
			})
		return this.get(accountGuid, year, today)
	}

	/** Closes the return - allowed only once the whole year is in the past (today > 31 Dec). Closing a closed return keeps its `closedAt`. */
	async close(accountGuid: string, year: number, today: string = Months.today()): Promise<TaxesTypes.TaxReturn> {
		const row = await this.findRow(accountGuid, year)
		if (!row) throw new TaxesTypes.TaxReturnNotFoundError()
		if (!this.canClose(year, today)) throw new TaxesTypes.TaxYearNotFinishedError()
		if (!row.closedAt) {
			await this.db.core.update(coreSchema.taxReturn)
				.set({ closedAt: new Date() })
				.where(eq(coreSchema.taxReturn.guid, row.guid))
		}
		return this.get(accountGuid, year, today)
	}

	/** Reopens a closed return (no-op on an open one). */
	async reopen(accountGuid: string, year: number, today: string = Months.today()): Promise<TaxesTypes.TaxReturn> {
		const row = await this.findRow(accountGuid, year)
		if (!row) throw new TaxesTypes.TaxReturnNotFoundError()
		await this.db.core.update(coreSchema.taxReturn)
			.set({ closedAt: null })
			.where(eq(coreSchema.taxReturn.guid, row.guid))
		return this.get(accountGuid, year, today)
	}

	/** Advances (social, health, tax) of the account paid in `month` (`YYYY-MM`); zeros without a tax return for the year. */
	async getMonthAdvances(accountGuid: string, month: string): Promise<TaxesTypes.MonthAdvances> {
		if (!Months.isValid(month)) throw new Error(`Invalid month "${month}", expected YYYY-MM`)
		const row = await this.findRow(accountGuid, Number(month.slice(0, 4)))
		const rows = row ? await this.findAdvanceRows(row.guid) : []
		const found = this.buildAdvances(rows).find((m) => m.month === Number(month.slice(5, 7)))
		if (!found) throw new Error(`No advances month for ${month}`)
		return {
			social: found.social,
			health: found.health,
			tax: found.tax,
			total: this.roundMoney(found.social + found.health + found.tax),
		}
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private async findRow(accountGuid: string, year: number): Promise<ReturnRow | undefined> {
		await this.accountsService.get(accountGuid)
		const [row] = await this.db.core.select()
			.from(coreSchema.taxReturn)
			.where(and(eq(coreSchema.taxReturn.accountGuid, accountGuid), eq(coreSchema.taxReturn.year, year)))
		return row
	}

	private async getEditableRow(accountGuid: string, year: number): Promise<ReturnRow> {
		const row = await this.findRow(accountGuid, year)
		if (!row) throw new TaxesTypes.TaxReturnNotFoundError()
		if (row.closedAt) throw new TaxesTypes.TaxReturnClosedError()
		return row
	}

	private findAdvanceRows(taxReturnGuid: string): Promise<AdvanceRow[]> {
		return this.db.core.select()
			.from(coreSchema.taxAdvance)
			.where(eq(coreSchema.taxAdvance.taxReturnGuid, taxReturnGuid))
			.orderBy(asc(coreSchema.taxAdvance.month))
	}

	private async toTaxReturn(row: ReturnRow, today: string): Promise<TaxesTypes.TaxReturn> {
		const incomeYear = await this.incomeService.findYear(row.accountGuid, row.year)
		const plannedIncome = incomeYear ? incomeYear.totals.expectedInvoice : null
		const constants = this.pickConstants(row)
		const calculation = this.calculate(constants, row.incomeOverride ?? plannedIncome ?? 0)
		const advances = this.buildAdvances(await this.findAdvanceRows(row.guid))
		const advanceTotals = this.sumAdvances(advances)
		return {
			guid: row.guid,
			accountGuid: row.accountGuid,
			year: row.year,
			closedAt: row.closedAt,
			...constants,
			incomeOverride: row.incomeOverride,
			plannedIncome,
			canClose: this.canClose(row.year, today),
			calculation,
			advances,
			advanceTotals,
			settlement: this.settle(calculation, advanceTotals),
			createdAt: row.createdAt,
		}
	}

	/** The OSVČ tax / insurance calculation of a year, every step rounded to haléře. */
	private calculate(c: TaxesTypes.Constants, income: number): TaxesTypes.Calculation {
		const round = (value: number) => this.roundMoney(value)
		const taxBase = round(income * (100 - c.expenseRatePct) / 100)
		const tax = round(taxBase * c.taxRatePct / 100)
		const assessmentBase = round(taxBase * c.assessmentBasePct / 100)
		const social = Math.max(round(assessmentBase * c.socialRatePct / 100), c.socialMin)
		const health = Math.max(round(assessmentBase * c.healthRatePct / 100), c.healthMin)
		const taxAfterDiscounts = round(Math.max(tax - c.basicDiscount - c.spouseDiscount, 0) - c.childDiscount)
		const net = round(income - social - health - taxAfterDiscounts)
		return {
			income,
			taxBase,
			tax,
			assessmentBase,
			social,
			health,
			taxAfterDiscounts,
			grossMonthly: round(income / 12),
			net,
			netMonthly: round(net / 12),
		}
	}

	/** 12 months (January first) with all three advance kinds; a missing row is 0. */
	private buildAdvances(rows: Pick<AdvanceRow, 'month' | 'kind' | 'amount'>[]): TaxesTypes.AdvanceMonth[] {
		const months = Array.from({ length: 12 }, (_, i): TaxesTypes.AdvanceMonth => ({ month: i + 1, social: 0, health: 0, tax: 0 }))
		for (const row of rows) {
			const month = months[row.month - 1]
			if (!month) throw new Error(`Tax advance with month ${row.month} out of 1-12`)
			month[row.kind] = row.amount
		}
		return months
	}

	private sumAdvances(months: TaxesTypes.AdvanceMonth[]): TaxesTypes.AdvanceSums {
		const sum = (kind: TaxAdvanceKind) => this.roundMoney(months.reduce((acc, m) => acc + m[kind], 0))
		return { social: sum(TaxAdvanceKind.social), health: sum(TaxAdvanceKind.health), tax: sum(TaxAdvanceKind.tax) }
	}

	/** Computed vs. paid per kind: difference + = underpayment (doplatek), − = overpayment (přeplatek). */
	private settle(calculation: TaxesTypes.Calculation, paid: TaxesTypes.AdvanceSums): TaxesTypes.Settlement[] {
		const computed: Record<TaxAdvanceKind, number> = {
			[TaxAdvanceKind.social]: calculation.social,
			[TaxAdvanceKind.health]: calculation.health,
			[TaxAdvanceKind.tax]: calculation.taxAfterDiscounts,
		}
		return TaxesTypes.ADVANCE_KINDS.map((kind) => ({
			kind,
			computed: computed[kind],
			paid: paid[kind],
			difference: this.roundMoney(computed[kind] - paid[kind]),
		}))
	}

	/** A year can be closed only when it is entirely in the past: today (`YYYY-MM-DD`) > 31 Dec of the year. */
	private canClose(year: number, today: string): boolean {
		return today > `${year}-12-31`
	}

	private pickConstants(source: TaxesTypes.Constants): TaxesTypes.Constants {
		return {
			expenseRatePct: source.expenseRatePct,
			taxRatePct: source.taxRatePct,
			assessmentBasePct: source.assessmentBasePct,
			socialRatePct: source.socialRatePct,
			healthRatePct: source.healthRatePct,
			socialMin: source.socialMin,
			healthMin: source.healthMin,
			basicDiscount: source.basicDiscount,
			spouseDiscount: source.spouseDiscount,
			childDiscount: source.childDiscount,
		}
	}

	private assertValidYear(year: number) {
		if (!Number.isInteger(year) || year < TaxesTypes.MIN_YEAR || year > TaxesTypes.MAX_YEAR)
			throw new TaxesTypes.InvalidTaxYearError()
	}

	private rethrowDuplicate(err: unknown): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
			throw new TaxesTypes.DuplicateTaxReturnError()
		}
		throw err
	}

	private roundMoney(value: number) {
		return Math.round(value * 100) / 100
	}
}
