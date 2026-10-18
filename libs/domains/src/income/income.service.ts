import { coreSchema, DbProvider, IncomeType } from '@family-finances/database'
import { CzechCalendar, Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { AccountsService } from '../accounts/accounts.service'
import { IncomeTypes } from './income.types'

const UNIQUE_CONSTRAINT_VIOLATION = '23505'

type YearRow = typeof coreSchema.incomeYear.$inferSelect
type MonthRow = typeof coreSchema.incomeMonth.$inferSelect

@Injectable()
export class IncomeService {
	constructor(
		private db: DbProvider,
		private accountsService: AccountsService,
	) {}

	/** Income years of the account (without months), newest first. */
	async listYears(accountGuid: string): Promise<IncomeTypes.IncomeYearSummary[]> {
		await this.accountsService.get(accountGuid)
		return this.db.core.select()
			.from(coreSchema.incomeYear)
			.where(eq(coreSchema.incomeYear.accountGuid, accountGuid))
			.orderBy(desc(coreSchema.incomeYear.year))
	}

	/** The year's plan with its 12 months, totals and the cumulative vacation check. */
	async getYear(accountGuid: string, year: number): Promise<IncomeTypes.IncomeYear> {
		const result = await this.findYear(accountGuid, year)
		if (!result) throw new IncomeTypes.IncomeYearNotFoundError()
		return result
	}

	/** Like `getYear`, but `null` when the account has no income plan for the year (a valid state for readers like the tax return / overview). */
	async findYear(accountGuid: string, year: number): Promise<IncomeTypes.IncomeYear | null> {
		const yearRow = await this.findYearRow(accountGuid, year)
		if (!yearRow) return null
		const monthRows = await this.db.core.select()
			.from(coreSchema.incomeMonth)
			.where(eq(coreSchema.incomeMonth.incomeYearGuid, yearRow.guid))
			.orderBy(asc(coreSchema.incomeMonth.month))
		const months = this.toMonths(monthRows)
		const totals = this.computeTotals(months)
		return {
			...yearRow,
			locked: await this.isYearLocked(accountGuid, year),
			months,
			totals,
			vacationRemaining: this.roundDays(yearRow.vacationAllowance - totals.vacationDays),
		}
	}

	/**
	 * OSVČ vacation check from January up to `month` (`YYYY-MM`) incl.: Σ real earnings − Σ expectedInvoice.
	 * `null` when the account has no income plan for that year or it is an employment (HPP) year.
	 */
	async getVacationBalance(accountGuid: string, month: string): Promise<number | null> {
		const [year, monthNumber] = this.parseMonth(month)
		const result = await this.findYear(accountGuid, year)
		if (!result || result.type !== IncomeType.self_employed) return null
		const found = result.months.find((m) => m.month === monthNumber)
		if (!found) throw new Error(`Income year ${year} has no month ${monthNumber}`)
		return found.vacationBalance
	}

	/**
	 * Whether the year's income is locked against changes = the account's tax return of the year is closed.
	 * Queries `tax_return` directly (not via `TaxesService`, which depends on this service); every mutation
	 * goes through `assertYearEditable`.
	 */
	async isYearLocked(accountGuid: string, year: number): Promise<boolean> {
		const [row] = await this.db.core.select({ guid: coreSchema.taxReturn.guid })
			.from(coreSchema.taxReturn)
			.where(and(
				eq(coreSchema.taxReturn.accountGuid, accountGuid),
				eq(coreSchema.taxReturn.year, year),
				isNotNull(coreSchema.taxReturn.closedAt),
			))
		return row !== undefined
	}

	/** Creates the year with 12 months - working days by the Czech calendar, hourly rate from `defaultHourlyRate`. */
	async createYear(accountGuid: string, input: IncomeTypes.YearInput): Promise<IncomeTypes.IncomeYear> {
		this.assertValidYear(input.year)
		await this.accountsService.get(accountGuid)
		await this.assertYearEditable(accountGuid, input.year)
		const defaultHourlyRate = input.defaultHourlyRate ?? null
		try {
			await this.db.core.transaction(async (tx) => {
				const [yearRow] = await tx.insert(coreSchema.incomeYear)
					.values({
						accountGuid,
						year: input.year,
						type: input.type,
						defaultHourlyRate,
						vacationAllowance: input.vacationAllowance ?? IncomeTypes.DEFAULT_VACATION_ALLOWANCE,
					})
					.returning()
				if (!yearRow) throw new Error('Insert into income_year returned no row')
				await tx.insert(coreSchema.incomeMonth)
					.values(this.buildDefaultMonths(input.year, defaultHourlyRate).map((m) => ({ ...m, incomeYearGuid: yearRow.guid })))
			})
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		return this.getYear(accountGuid, input.year)
	}

	/**
	 * Changes the year's type / default hourly rate / vacation allowance. Months whose hourly rate still equals the previous
	 * default (i.e. were not edited individually) get the new default.
	 */
	async updateYear(accountGuid: string, year: number, input: IncomeTypes.YearSettingsInput): Promise<IncomeTypes.IncomeYear> {
		const yearRow = await this.findYearRow(accountGuid, year)
		if (!yearRow) throw new IncomeTypes.IncomeYearNotFoundError()
		await this.assertYearEditable(accountGuid, year)
		const defaultHourlyRate = input.defaultHourlyRate ?? null
		await this.db.core.transaction(async (tx) => {
			await tx.update(coreSchema.incomeYear)
				.set({ type: input.type, defaultHourlyRate, vacationAllowance: input.vacationAllowance ?? yearRow.vacationAllowance })
				.where(eq(coreSchema.incomeYear.guid, yearRow.guid))
			if (defaultHourlyRate !== yearRow.defaultHourlyRate) {
				await tx.update(coreSchema.incomeMonth)
					.set({ hourlyRate: defaultHourlyRate ?? 0 })
					.where(and(
						eq(coreSchema.incomeMonth.incomeYearGuid, yearRow.guid),
						eq(coreSchema.incomeMonth.hourlyRate, yearRow.defaultHourlyRate ?? 0),
					))
			}
		})
		return this.getYear(accountGuid, year)
	}

	async removeYear(accountGuid: string, year: number) {
		const yearRow = await this.findYearRow(accountGuid, year)
		if (!yearRow) throw new IncomeTypes.IncomeYearNotFoundError()
		await this.assertYearEditable(accountGuid, year)
		await this.db.core.delete(coreSchema.incomeYear)
			.where(eq(coreSchema.incomeYear.guid, yearRow.guid))
	}

	/** Overwrites one month (1-12) of the year; returns the whole year (totals and vacation check change). */
	async updateMonth(accountGuid: string, year: number, monthNumber: number, input: IncomeTypes.MonthInput): Promise<IncomeTypes.IncomeYear> {
		const values = this.toMonthValues(monthNumber, input)
		const yearRow = await this.findYearRow(accountGuid, year)
		if (!yearRow) throw new IncomeTypes.IncomeYearNotFoundError()
		await this.assertYearEditable(accountGuid, year)
		await this.db.core.update(coreSchema.incomeMonth)
			.set(values)
			.where(and(
				eq(coreSchema.incomeMonth.incomeYearGuid, yearRow.guid),
				eq(coreSchema.incomeMonth.month, monthNumber),
			))
		return this.getYear(accountGuid, year)
	}

	private async findYearRow(accountGuid: string, year: number): Promise<YearRow | undefined> {
		await this.accountsService.get(accountGuid)
		const [row] = await this.db.core.select()
			.from(coreSchema.incomeYear)
			.where(and(eq(coreSchema.incomeYear.accountGuid, accountGuid), eq(coreSchema.incomeYear.year, year)))
		return row
	}

	private async assertYearEditable(accountGuid: string, year: number) {
		if (await this.isYearLocked(accountGuid, year)) throw new IncomeTypes.IncomeYearLockedError()
	}

	private assertValidYear(year: number) {
		if (!Number.isInteger(year) || year < IncomeTypes.MIN_YEAR || year > IncomeTypes.MAX_YEAR)
			throw new IncomeTypes.InvalidIncomeYearError()
	}

	private buildDefaultMonths(year: number, defaultHourlyRate: number | null) {
		return Array.from({ length: 12 }, (_, i) => ({
			month: i + 1,
			workingDays: CzechCalendar.workingDays(year, i + 1),
			hourlyRate: defaultHourlyRate ?? 0,
		}))
	}

	private toMonthValues(monthNumber: number, input: IncomeTypes.MonthInput) {
		if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)
			throw new IncomeTypes.InvalidIncomeMonthError()
		if (input.vacationDays > input.workingDays) throw new IncomeTypes.InvalidIncomeMonthError()
		return {
			grossSalary: input.grossSalary,
			netSalary: input.netSalary ?? null,
			hourlyRate: input.hourlyRate,
			workingDays: input.workingDays,
			vacationDays: input.vacationDays,
			expectedInvoice: input.expectedInvoice,
		}
	}

	/** Adds the computed real earnings and the cumulative vacation check to each month. */
	private toMonths(rows: MonthRow[]): IncomeTypes.IncomeMonth[] {
		let balance = 0
		return rows.map((row) => {
			const earned = this.computeEarned(row)
			const vacationSaving = this.roundMoney(earned - row.expectedInvoice)
			balance += vacationSaving
			return {
				guid: row.guid,
				month: row.month,
				grossSalary: row.grossSalary,
				netSalary: row.netSalary,
				hourlyRate: row.hourlyRate,
				workingDays: row.workingDays,
				vacationDays: row.vacationDays,
				expectedInvoice: row.expectedInvoice,
				earned,
				vacationSaving,
				vacationBalance: this.roundMoney(balance),
			}
		})
	}

	/** OSVČ real earnings of a month: hourlyRate × 8 × (workingDays − vacationDays). */
	private computeEarned(values: IncomeTypes.VacationValues): number {
		return this.roundMoney(values.hourlyRate * IncomeTypes.HOURS_PER_DAY * (values.workingDays - values.vacationDays))
	}

	private computeTotals(months: IncomeTypes.IncomeMonth[]): IncomeTypes.IncomeTotals {
		const sum = (pick: (m: IncomeTypes.IncomeMonth) => number) => this.roundMoney(months.reduce((acc, m) => acc + pick(m), 0))
		return {
			grossSalary: sum((m) => m.grossSalary),
			netSalary: sum((m) => m.netSalary ?? m.grossSalary),
			earned: sum((m) => m.earned),
			expectedInvoice: sum((m) => m.expectedInvoice),
			workingDays: sum((m) => m.workingDays),
			vacationDays: sum((m) => m.vacationDays),
		}
	}

	/** `2026-09` → `[2026, 9]` */
	private parseMonth(month: string): [number, number] {
		if (!Months.isValid(month)) throw new IncomeTypes.InvalidIncomeMonthError()
		return [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
	}

	private rethrowDuplicate(err: unknown): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
			throw new IncomeTypes.DuplicateIncomeYearError()
		}
		throw err
	}

	private roundDays(value: number) {
		return Math.round(value * 10) / 10
	}

	private roundMoney(value: number) {
		return Math.round(value * 100) / 100
	}
}
