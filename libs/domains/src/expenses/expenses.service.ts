import { coreSchema, DbProvider, ExpenseCategory, ExpenseRecurrence, UtilityType } from '@family-finances/database'
import { BankAccount, Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'

import { AccountsService } from '../accounts/accounts.service'
import { ElectricityPricesService } from '../electricity-prices/electricity-prices.service'
import { ElectricityPricesTypes } from '../electricity-prices/electricity-prices.types'
import { MetersService } from '../meters/meters.service'
import { PayeesService } from '../payees/payees.service'
import { PayeesTypes } from '../payees/payees.types'
import { TaxesService } from '../taxes/taxes.service'
import { ExpensesTypes } from './expenses.types'

type ExpenseRow = typeof coreSchema.expense.$inferSelect
type SheetRow = typeof coreSchema.meterSheet.$inferSelect
type PriceRow = typeof coreSchema.expenseUtilityPrice.$inferSelect
type CorrectionRow = typeof coreSchema.expenseCorrection.$inferSelect
type PaymentRow = typeof coreSchema.payeePayment.$inferSelect

/** The price a meter-linked expense uses in a month - its own monthly price or its electricity supplier's. */
interface UsedPrice {
	values: ExpensesTypes.PriceValues | null
	priceMonth: string | null
	confirmed: boolean
	supplier: ElectricityPricesTypes.Supplier | null
	/** Supplier prices only. */
	withVat: boolean | null
	segments: ElectricityPricesTypes.PriceSegment[]
}

@Injectable()
export class ExpensesService {
	constructor(
		private db: DbProvider,
		private accountsService: AccountsService,
		private metersService: MetersService,
		private taxesService: TaxesService,
		private payeesService: PayeesService,
		private electricityPricesService: ElectricityPricesService,
	) {}

	/** All expense definitions of the account (incl. ended ones), ordered by category and name. */
	async list(accountGuid: string): Promise<ExpensesTypes.Expense[]> {
		await this.accountsService.get(accountGuid)
		const rows = await this.db.core.select()
			.from(coreSchema.expense)
			.where(eq(coreSchema.expense.accountGuid, accountGuid))
			.orderBy(asc(coreSchema.expense.name))
		return this.sortByCategory(rows.map((row) => this.toExpense(row)))
	}

	async get(accountGuid: string, guid: string): Promise<ExpensesTypes.Expense> {
		const [row] = await this.db.core.select()
			.from(coreSchema.expense)
			.where(this.byGuid(accountGuid, guid))
		if (!row) throw new ExpensesTypes.ExpenseNotFoundError()
		return this.toExpense(row)
	}

	async create(accountGuid: string, input: ExpensesTypes.ExpenseInput): Promise<ExpensesTypes.Expense> {
		const values = this.toValues(input)
		await this.accountsService.get(accountGuid)
		await this.assertLinksExist(values)
		await this.assertPayeeExists(accountGuid, values.payeeGuid)
		const [row] = await this.db.core.insert(coreSchema.expense)
			.values({ ...values, accountGuid })
			.returning()
		if (!row) throw new Error('Insert returned no row')
		return this.toExpense(row)
	}

	async update(accountGuid: string, guid: string, input: ExpensesTypes.ExpenseInput): Promise<ExpensesTypes.Expense> {
		const values = this.toValues(input)
		await this.assertLinksExist(values)
		await this.assertPayeeExists(accountGuid, values.payeeGuid)
		const [row] = await this.db.core.update(coreSchema.expense)
			.set(values)
			.where(this.byGuid(accountGuid, guid))
			.returning()
		if (!row) throw new ExpensesTypes.ExpenseNotFoundError()
		return this.toExpense(row)
	}

	async remove(accountGuid: string, guid: string) {
		const [row] = await this.db.core.delete(coreSchema.expense)
			.where(this.byGuid(accountGuid, guid))
			.returning()
		if (!row) throw new ExpensesTypes.ExpenseNotFoundError()
	}

	/**
	 * Expenses paid in `month` (`YYYY-MM`) with per-category totals. A meter-linked expense's amount
	 * is the sheet's month consumption × the month's price (or the latest earlier one) + fixed fee.
	 * Corrections whose `applyMonth` is this month are separate rows counted in the totals; each item
	 * also lists the corrections made for its own month (`forMonth`). `payments` group the items and
	 * applied corrections by payee.
	 */
	async getMonth(accountGuid: string, month: string): Promise<ExpensesTypes.MonthExpenses> {
		await this.accountsService.get(accountGuid)
		const monthDate = Months.firstDay(month)
		// SQL narrows to expenses active in the month; the recurrence step is checked in code.
		const rows = await this.db.core.select({ expense: coreSchema.expense, sheet: coreSchema.meterSheet })
			.from(coreSchema.expense)
			.leftJoin(coreSchema.meterSheet, eq(coreSchema.expense.meterSheetGuid, coreSchema.meterSheet.guid))
			.where(and(
				eq(coreSchema.expense.accountGuid, accountGuid),
				lte(coreSchema.expense.startMonth, monthDate),
				or(isNull(coreSchema.expense.endMonth), gte(coreSchema.expense.endMonth, monthDate)),
			))
			.orderBy(asc(coreSchema.expense.name))
		const occurring = rows
			.map((row) => ({ expense: this.toExpense(row.expense), sheet: row.sheet }))
			.filter(({ expense }) => this.occursIn(expense, month))

		const guids = occurring.map((r) => r.expense.guid)
		const [prices, ownCorrections, corrections, taxAdvances, payees, paidMarks] = await Promise.all([
			this.latestPrices(occurring.filter((r) => r.sheet).map((r) => r.expense.guid), monthDate),
			this.correctionsFor(guids, monthDate),
			this.appliedCorrections(accountGuid, monthDate),
			this.taxesService.getMonthAdvances(accountGuid, month),
			this.payeesService.list(accountGuid),
			this.paidMarks(accountGuid, monthDate),
		])
		const items = this.sortByCategory(await Promise.all(occurring.map(async ({ expense, sheet }) => {
			const own = ownCorrections.filter((c) => c.expenseGuid === expense.guid)
			if (!sheet) return { ...expense, utility: null, corrections: own }
			const [consumption, price] = await Promise.all([
				this.metersService.getMonthlyConsumption(sheet.guid, month),
				this.priceOf(expense, sheet, prices.get(expense.guid), month),
			])
			return { ...this.withUtilityCost(expense, sheet, consumption, price), corrections: own }
		})))
		// Tax return advances are paid like any other expense - counted in the `taxes` category.
		const advances = { category: ExpenseCategory.taxes, amount: taxAdvances.total }
		const payments = this.paymentsOf(payees, items, corrections, paidMarks, month)
		return { month, items, corrections, payments, taxAdvances, ...this.sumByCategory([...items, ...corrections, advances]) }
	}

	// ── Payments (expenses grouped by payee) ──────────────────────────────────

	/** Marks the payee's payment of `month` as paid with its current amount (again = refreshes the amount). */
	async markPaid(accountGuid: string, payeeGuid: string, month: string): Promise<ExpensesTypes.PaidMark> {
		await this.payeesService.get(accountGuid, payeeGuid)
		const { payments } = await this.getMonth(accountGuid, month)
		const payment = payments.find((p) => p.payee.guid === payeeGuid)
		if (!payment) throw new ExpensesTypes.PaymentNotInMonthError()
		const values = { amount: payment.amount, paidAt: new Date() }
		const [row] = await this.db.core.insert(coreSchema.payeePayment)
			.values({ payeeGuid, month: Months.firstDay(month), ...values })
			.onConflictDoUpdate({
				target: [coreSchema.payeePayment.payeeGuid, coreSchema.payeePayment.month],
				set: values,
			})
			.returning()
		if (!row) throw new Error('Upsert into payee_payment returned no row')
		return this.toPaidMark(row)
	}

	async unmarkPaid(accountGuid: string, payeeGuid: string, month: string) {
		await this.payeesService.get(accountGuid, payeeGuid)
		const [row] = await this.db.core.delete(coreSchema.payeePayment)
			.where(and(
				eq(coreSchema.payeePayment.payeeGuid, payeeGuid),
				eq(coreSchema.payeePayment.month, Months.firstDay(month)),
			))
			.returning()
		if (!row) throw new ExpensesTypes.PaymentNotFoundError()
	}

	// ── Utility prices (meter-linked expenses) ────────────────────────────────

	/** Prices set for the expense, newest month first. */
	async listPrices(accountGuid: string, guid: string): Promise<ExpensesTypes.UtilityPrice[]> {
		await this.get(accountGuid, guid)
		const rows = await this.db.core.select()
			.from(coreSchema.expenseUtilityPrice)
			.where(eq(coreSchema.expenseUtilityPrice.expenseGuid, guid))
			.orderBy(desc(coreSchema.expenseUtilityPrice.month))
		return rows.map((row) => this.toPrice(row))
	}

	/** Sets (confirms) the price of a meter-linked expense for `month` - insert or overwrite. Not for a supplier-priced one. */
	async setPrice(accountGuid: string, guid: string, month: string, input: ExpensesTypes.UtilityPriceInput): Promise<ExpensesTypes.UtilityPrice> {
		const expense = await this.get(accountGuid, guid)
		if (!expense.meterSheetGuid) throw new ExpensesTypes.ExpenseNotLinkedError()
		const sheet = await this.metersService.getSheet(expense.meterSheetGuid)
		if (this.isSupplierPriced(expense, sheet)) throw new ExpensesTypes.ExpensePricedBySupplierError()
		const values = {
			unitPriceHigh: input.unitPriceHigh,
			// Only electricity has a second (NT) tariff.
			unitPriceLow: sheet.utility === UtilityType.electricity ? (input.unitPriceLow ?? null) : null,
			fixedFee: input.fixedFee ?? 0,
		}
		const [row] = await this.db.core.insert(coreSchema.expenseUtilityPrice)
			.values({ expenseGuid: guid, month: Months.firstDay(month), ...values })
			.onConflictDoUpdate({
				target: [coreSchema.expenseUtilityPrice.expenseGuid, coreSchema.expenseUtilityPrice.month],
				set: values,
			})
			.returning()
		if (!row) throw new Error('Upsert into expense_utility_price returned no row')
		return this.toPrice(row)
	}

	/** Removes the month's own price - the month then inherits the latest earlier one again. */
	async removePrice(accountGuid: string, guid: string, month: string) {
		await this.get(accountGuid, guid)
		const [row] = await this.db.core.delete(coreSchema.expenseUtilityPrice)
			.where(and(
				eq(coreSchema.expenseUtilityPrice.expenseGuid, guid),
				eq(coreSchema.expenseUtilityPrice.month, Months.firstDay(month)),
			))
			.returning()
		if (!row) throw new ExpensesTypes.UtilityPriceNotFoundError()
	}

	// ── Corrections (overpayment / underpayment) ──────────────────────────────

	/** Corrections of the expense, newest corrected month first. */
	async listCorrections(accountGuid: string, guid: string): Promise<ExpensesTypes.Correction[]> {
		await this.get(accountGuid, guid)
		const rows = await this.db.core.select()
			.from(coreSchema.expenseCorrection)
			.where(eq(coreSchema.expenseCorrection.expenseGuid, guid))
			.orderBy(desc(coreSchema.expenseCorrection.forMonth), desc(coreSchema.expenseCorrection.createdAt))
		return rows.map((row) => this.toCorrection(row))
	}

	async createCorrection(accountGuid: string, guid: string, input: ExpensesTypes.CorrectionInput): Promise<ExpensesTypes.Correction> {
		const expense = await this.get(accountGuid, guid)
		const values = await this.toCorrectionValues(expense, input)
		const [row] = await this.db.core.insert(coreSchema.expenseCorrection)
			.values({ ...values, expenseGuid: guid })
			.returning()
		if (!row) throw new Error('Insert into expense_correction returned no row')
		return this.toCorrection(row)
	}

	async updateCorrection(accountGuid: string, guid: string, correctionGuid: string, input: ExpensesTypes.CorrectionInput): Promise<ExpensesTypes.Correction> {
		const expense = await this.get(accountGuid, guid)
		const values = await this.toCorrectionValues(expense, input)
		const [row] = await this.db.core.update(coreSchema.expenseCorrection)
			.set(values)
			.where(this.correctionByGuid(guid, correctionGuid))
			.returning()
		if (!row) throw new ExpensesTypes.CorrectionNotFoundError()
		return this.toCorrection(row)
	}

	async removeCorrection(accountGuid: string, guid: string, correctionGuid: string) {
		await this.get(accountGuid, guid)
		const [row] = await this.db.core.delete(coreSchema.expenseCorrection)
			.where(this.correctionByGuid(guid, correctionGuid))
			.returning()
		if (!row) throw new ExpensesTypes.CorrectionNotFoundError()
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * Groups the month's items and applied corrections by payee (in the payees' name order; payees with
	 * nothing in the month are left out) and attaches the paid mark and the QR payment string.
	 */
	private paymentsOf(
		payees: PayeesTypes.Payee[],
		items: Pick<ExpensesTypes.MonthExpense, 'guid' | 'name' | 'amount' | 'payeeGuid'>[],
		corrections: Pick<ExpensesTypes.MonthCorrection, 'guid' | 'amount' | 'payeeGuid'>[],
		paidMarks: Pick<PaymentRow, 'payeeGuid' | 'amount' | 'paidAt'>[],
		month: string,
	): ExpensesTypes.MonthPayment[] {
		return payees.flatMap((payee) => {
			const payeeItems = items.filter((i) => i.payeeGuid === payee.guid)
			const payeeCorrections = corrections.filter((c) => c.payeeGuid === payee.guid)
			if (payeeItems.length === 0 && payeeCorrections.length === 0) return []
			const amount = this.roundMoney([...payeeItems, ...payeeCorrections].reduce((sum, i) => sum + i.amount, 0))
			const paid = paidMarks.find((m) => m.payeeGuid === payee.guid)
			const message = `${month.slice(5, 7)}/${month.slice(0, 4)} ${payeeItems.map((i) => i.name).join(', ')}`
			return [{
				payee,
				expenseGuids: payeeItems.map((i) => i.guid),
				correctionGuids: payeeCorrections.map((c) => c.guid),
				amount,
				paidAmount: paid?.amount ?? null,
				paidAt: paid?.paidAt ?? null,
				spayd: payee.iban && amount > 0
					? BankAccount.spayd({ iban: payee.iban, amount, variableSymbol: payee.variableSymbol, message })
					: null,
			}]
		})
	}

	/** Paid marks of the account's payees for `monthDate`. */
	private async paidMarks(accountGuid: string, monthDate: string): Promise<PaymentRow[]> {
		const rows = await this.db.core.select({ payment: coreSchema.payeePayment })
			.from(coreSchema.payeePayment)
			.innerJoin(coreSchema.payee, eq(coreSchema.payeePayment.payeeGuid, coreSchema.payee.guid))
			.where(and(
				eq(coreSchema.payee.accountGuid, accountGuid),
				eq(coreSchema.payeePayment.month, monthDate),
			))
		return rows.map((row) => row.payment)
	}

	private toPaidMark(row: PaymentRow): ExpensesTypes.PaidMark {
		return { payeeGuid: row.payeeGuid, month: Months.fromDate(row.month), amount: row.amount, paidAt: row.paidAt }
	}

	/** Corrections made for `monthDate` (`forMonth`) of the given expenses. */
	private async correctionsFor(expenseGuids: string[], monthDate: string): Promise<ExpensesTypes.Correction[]> {
		if (expenseGuids.length === 0) return []
		const rows = await this.db.core.select()
			.from(coreSchema.expenseCorrection)
			.where(and(
				inArray(coreSchema.expenseCorrection.expenseGuid, expenseGuids),
				eq(coreSchema.expenseCorrection.forMonth, monthDate),
			))
			.orderBy(asc(coreSchema.expenseCorrection.createdAt))
		return rows.map((row) => this.toCorrection(row))
	}

	/** Corrections of the account's expenses counted in `monthDate` (`applyMonth`), ordered by category and name. */
	private async appliedCorrections(accountGuid: string, monthDate: string): Promise<ExpensesTypes.MonthCorrection[]> {
		const rows = await this.db.core.select({
			correction: coreSchema.expenseCorrection,
			expenseName: coreSchema.expense.name,
			category: coreSchema.expense.category,
			payeeGuid: coreSchema.expense.payeeGuid,
		})
			.from(coreSchema.expenseCorrection)
			.innerJoin(coreSchema.expense, eq(coreSchema.expenseCorrection.expenseGuid, coreSchema.expense.guid))
			.where(and(
				eq(coreSchema.expense.accountGuid, accountGuid),
				eq(coreSchema.expenseCorrection.applyMonth, monthDate),
			))
			.orderBy(asc(coreSchema.expense.name), asc(coreSchema.expenseCorrection.forMonth), asc(coreSchema.expenseCorrection.createdAt))
		return this.sortByCategory(rows.map((row) => ({
			...this.toCorrection(row.correction),
			expenseName: row.expenseName,
			category: row.category,
			payeeGuid: row.payeeGuid,
		})))
	}

	/**
	 * Validates a correction and resolves its stored difference: `amount` as is, or `paidAmount` minus
	 * the expense's computed amount for `forMonth`. `applyMonth` defaults to `forMonth` + 1.
	 */
	private async toCorrectionValues(expense: ExpensesTypes.Expense, input: ExpensesTypes.CorrectionInput) {
		const paidAmount = input.paidAmount ?? null
		const amountGiven = (input.amount ?? null) !== null
		// Exactly one of the two.
		if (amountGiven === (paidAmount !== null)) throw new ExpensesTypes.InvalidCorrectionAmountError()
		const applyMonth = input.applyMonth || Months.add(input.forMonth, 1)
		if (Months.diff(input.forMonth, applyMonth) < 0) throw new ExpensesTypes.InvalidCorrectionRangeError()
		if (!this.occursIn(expense, input.forMonth)) throw new ExpensesTypes.ExpenseNotInMonthError()

		const amount = this.roundMoney(paidAmount === null
			? (input.amount ?? 0)
			: paidAmount - await this.computeMonthAmount(expense, input.forMonth))
		if (amount === 0) throw new ExpensesTypes.InvalidCorrectionAmountError()
		return {
			forMonth: Months.firstDay(input.forMonth),
			applyMonth: Months.firstDay(applyMonth),
			amount,
			note: input.note?.trim() || null,
		}
	}

	/** The expense's amount in `month` as the month view computes it (consumption × price for a linked one). */
	private async computeMonthAmount(expense: ExpensesTypes.Expense, month: string): Promise<number> {
		if (!expense.meterSheetGuid) return expense.amount
		const sheet = await this.metersService.getSheet(expense.meterSheetGuid)
		const consumption = await this.metersService.getMonthlyConsumption(sheet.guid, month)
		const prices = await this.latestPrices([expense.guid], Months.firstDay(month))
		const price = await this.priceOf(expense, sheet, prices.get(expense.guid), month)
		return this.withUtilityCost(expense, sheet, consumption, price).amount
	}

	private correctionByGuid(expenseGuid: string, correctionGuid: string) {
		return and(eq(coreSchema.expenseCorrection.guid, correctionGuid), eq(coreSchema.expenseCorrection.expenseGuid, expenseGuid))
	}

	private toCorrection(row: CorrectionRow): ExpensesTypes.Correction {
		return { ...row, forMonth: Months.fromDate(row.forMonth), applyMonth: Months.fromDate(row.applyMonth) }
	}

	/** The latest price on or before `monthDate` per expense. */
	private async latestPrices(expenseGuids: string[], monthDate: string): Promise<Map<string, PriceRow>> {
		if (expenseGuids.length === 0) return new Map()
		const rows = await this.db.core.selectDistinctOn([coreSchema.expenseUtilityPrice.expenseGuid])
			.from(coreSchema.expenseUtilityPrice)
			.where(and(
				inArray(coreSchema.expenseUtilityPrice.expenseGuid, expenseGuids),
				lte(coreSchema.expenseUtilityPrice.month, monthDate),
			))
			.orderBy(coreSchema.expenseUtilityPrice.expenseGuid, desc(coreSchema.expenseUtilityPrice.month))
		return new Map(rows.map((row) => [row.expenseGuid, row]))
	}

	/**
	 * The price of a meter-linked expense in `month`: an electricity expense with a supplier takes the
	 * supplier's day-weighted price per kWh (one price for VT and NT, no fixed fee; confirmed only when
	 * every day of the month is covered by a period), otherwise its own monthly price (`ownPrice` = the
	 * latest on or before the month; confirmed when set for the month itself).
	 */
	private async priceOf(
		expense: ExpensesTypes.Expense,
		sheet: Pick<SheetRow, 'utility'>,
		ownPrice: PriceRow | undefined,
		month: string,
	): Promise<UsedPrice> {
		if (expense.electricitySupplierGuid && this.isSupplierPriced(expense, sheet)) {
			const supplierPrice = await this.electricityPricesService.getMonthPrice(expense.electricitySupplierGuid, month, expense.electricityPriceWithVat)
			return {
				values: supplierPrice.unitPrice === null ? null : { unitPriceHigh: supplierPrice.unitPrice, unitPriceLow: null, fixedFee: 0 },
				priceMonth: supplierPrice.unitPrice === null ? null : month,
				confirmed: supplierPrice.confirmed,
				supplier: supplierPrice.supplier,
				withVat: supplierPrice.withVat,
				segments: supplierPrice.segments,
			}
		}
		const priceMonth = ownPrice ? Months.fromDate(ownPrice.month) : null
		return { values: ownPrice ?? null, priceMonth, confirmed: priceMonth === month, supplier: null, withVat: null, segments: [] }
	}

	/** Supplier prices apply only to electricity - a supplier on another sheet (e.g. after an edit) is ignored. */
	private isSupplierPriced(expense: Pick<ExpensesTypes.Expense, 'electricitySupplierGuid'>, sheet: Pick<SheetRow, 'utility'>): boolean {
		return expense.electricitySupplierGuid !== null && sheet.utility === UtilityType.electricity
	}

	private withUtilityCost(
		expense: ExpensesTypes.Expense,
		sheet: Pick<SheetRow, 'guid' | 'name' | 'utility'>,
		consumption: { high: number, low: number | null, total: number, readingCount: number },
		price: UsedPrice,
	): Omit<ExpensesTypes.MonthExpense, 'corrections'> {
		return {
			...expense,
			amount: price.values ? this.computeUtilityAmount(sheet.utility, consumption, price.values) : 0,
			utility: {
				sheetGuid: sheet.guid,
				sheetName: sheet.name,
				utility: sheet.utility,
				consumptionHigh: consumption.high,
				consumptionLow: consumption.low,
				consumptionTotal: consumption.total,
				readingCount: consumption.readingCount,
				priceMonth: price.priceMonth,
				priceConfirmed: price.confirmed,
				unitPriceHigh: price.values?.unitPriceHigh ?? null,
				unitPriceLow: price.values?.unitPriceLow ?? null,
				fixedFee: price.values?.fixedFee ?? null,
				supplierGuid: price.supplier?.guid ?? null,
				supplierLabel: price.supplier?.label ?? null,
				supplierPriceWithVat: price.withVat,
				priceSegments: price.segments,
			},
		}
	}

	/**
	 * Month amount of a meter-linked expense: electricity VT × VT price + NT × NT price (VT price when
	 * NT is missing); water litres / 1000 × price per m³; gas m³ × price. Plus the fixed fee.
	 */
	private computeUtilityAmount(utility: UtilityType, consumption: ExpensesTypes.ConsumptionValues, price: ExpensesTypes.PriceValues): number {
		let variable: number
		switch (utility) {
			case UtilityType.electricity:
				variable = consumption.high * price.unitPriceHigh + (consumption.low ?? 0) * (price.unitPriceLow ?? price.unitPriceHigh)
				break
			case UtilityType.water:
				variable = consumption.high / ExpensesTypes.LITRES_PER_CUBIC_METRE * price.unitPriceHigh
				break
			case UtilityType.gas:
				variable = consumption.high * price.unitPriceHigh
				break
		}
		return this.roundMoney(variable + price.fixedFee)
	}

	/** The linked sheet must exist; a supplier needs an electricity sheet and must exist too. */
	private async assertLinksExist(values: { meterSheetGuid: string | null, electricitySupplierGuid: string | null }) {
		const sheet = values.meterSheetGuid ? await this.metersService.getSheet(values.meterSheetGuid) : null
		if (!values.electricitySupplierGuid) return
		if (sheet?.utility !== UtilityType.electricity) throw new ExpensesTypes.SupplierRequiresElectricitySheetError()
		await this.electricityPricesService.get(values.electricitySupplierGuid)
	}

	/** The payee must belong to the expense's account (`PayeeNotFoundError` otherwise). */
	private async assertPayeeExists(accountGuid: string, payeeGuid: string | null) {
		if (payeeGuid) await this.payeesService.get(accountGuid, payeeGuid)
	}

	/**
	 * Whether the expense is paid in `month`: from `startMonth` every 1/3/12 months up to
	 * `endMonth` inclusive (`null` = indefinitely); `once` only in `startMonth`.
	 */
	private occursIn(expense: ExpensesTypes.Occurrence, month: string): boolean {
		const sinceStart = Months.diff(expense.startMonth, month)
		if (sinceStart < 0) return false
		if (expense.endMonth !== null && Months.diff(month, expense.endMonth) < 0) return false
		const step = ExpensesTypes.RECURRENCE_STEP[expense.recurrence]
		if (step === null) return sinceStart === 0
		return sinceStart % step === 0
	}

	private sumByCategory(items: Pick<ExpensesTypes.Expense, 'category' | 'amount'>[]) {
		const categories: ExpensesTypes.CategoryTotal[] = ExpensesTypes.CATEGORY_ORDER.map((category) => ({
			category,
			total: this.roundMoney(items.filter((i) => i.category === category).reduce((sum, i) => sum + i.amount, 0)),
		}))
		const total = this.roundMoney(categories.reduce((sum, c) => sum + c.total, 0))
		return { categories, total }
	}

	/** Stable sort by `CATEGORY_ORDER` - keeps the incoming (name) order within a category. */
	private sortByCategory<T extends Pick<ExpensesTypes.Expense, 'category'>>(expenses: T[]): T[] {
		return [...expenses].sort((a, b) =>
			ExpensesTypes.CATEGORY_ORDER.indexOf(a.category) - ExpensesTypes.CATEGORY_ORDER.indexOf(b.category))
	}

	private toValues(input: ExpensesTypes.ExpenseInput) {
		const name = input.name.trim()
		if (!name) throw new ExpensesTypes.InvalidExpenseNameError()
		// A one-off expense ends in the month it starts - keeps "ended" checks uniform.
		const endMonth = input.recurrence === ExpenseRecurrence.once ? input.startMonth : (input.endMonth || null)
		if (endMonth !== null && Months.diff(input.startMonth, endMonth) < 0) throw new ExpensesTypes.InvalidExpenseRangeError()
		const meterSheetGuid = input.meterSheetGuid || null
		if (meterSheetGuid && input.recurrence !== ExpenseRecurrence.monthly) throw new ExpensesTypes.LinkedExpenseNotMonthlyError()
		return {
			name,
			category: input.category,
			// A meter-linked expense's amount is computed per month - the stored one is ignored.
			amount: meterSheetGuid ? 0 : input.amount,
			meterSheetGuid,
			electricitySupplierGuid: input.electricitySupplierGuid || null,
			electricityPriceWithVat: input.electricityPriceWithVat ?? true,
			payeeGuid: input.payeeGuid || null,
			recurrence: input.recurrence,
			startMonth: Months.firstDay(input.startMonth),
			endMonth: endMonth === null ? null : Months.firstDay(endMonth),
			note: input.note?.trim() || null,
		}
	}

	private toExpense(row: ExpenseRow): ExpensesTypes.Expense {
		return {
			...row,
			startMonth: Months.fromDate(row.startMonth),
			endMonth: row.endMonth === null ? null : Months.fromDate(row.endMonth),
		}
	}

	private toPrice(row: PriceRow): ExpensesTypes.UtilityPrice {
		return { ...row, month: Months.fromDate(row.month) }
	}

	private byGuid(accountGuid: string, guid: string) {
		return and(eq(coreSchema.expense.guid, guid), eq(coreSchema.expense.accountGuid, accountGuid))
	}

	private roundMoney(value: number) {
		return Math.round(value * 100) / 100
	}
}
