import { ExpenseCategory, ExpenseRecurrence, UtilityType } from '@family-finances/database'

import { ElectricityPricesTypes } from '../electricity-prices/electricity-prices.types'
import { PayeesTypes } from '../payees/payees.types'
import { TaxesTypes } from '../taxes/taxes.types'

export namespace ExpensesTypes {
	export class ExpenseNotFoundError extends Error { public code = 'expense_not_found' }
	export class InvalidExpenseNameError extends Error { public code = 'invalid_expense_name' }
	/** `endMonth` before `startMonth`. */
	export class InvalidExpenseRangeError extends Error { public code = 'invalid_expense_range' }
	/** A meter-linked expense must repeat monthly - its amount is the consumption of each month. */
	export class LinkedExpenseNotMonthlyError extends Error { public code = 'linked_expense_not_monthly' }
	/** Prices can only be set for an expense linked to a meter sheet. */
	export class ExpenseNotLinkedError extends Error { public code = 'expense_not_linked' }
	/** An electricity supplier can only price an expense linked to an electricity meter sheet. */
	export class SupplierRequiresElectricitySheetError extends Error { public code = 'supplier_requires_electricity_sheet' }
	/** The expense's price comes from its electricity supplier - it can't be set by hand. */
	export class ExpensePricedBySupplierError extends Error { public code = 'expense_priced_by_supplier' }
	export class UtilityPriceNotFoundError extends Error { public code = 'utility_price_not_found' }
	export class CorrectionNotFoundError extends Error { public code = 'correction_not_found' }
	/** `applyMonth` before `forMonth`. */
	export class InvalidCorrectionRangeError extends Error { public code = 'invalid_correction_range' }
	/** Neither / both of `amount` and `paidAmount`, or a zero difference. */
	export class InvalidCorrectionAmountError extends Error { public code = 'invalid_correction_amount' }
	/** The corrected month (`forMonth`) is not a month the expense is paid in. */
	export class ExpenseNotInMonthError extends Error { public code = 'expense_not_in_month' }
	/** Nothing is paid to the payee in the month - there is no payment to mark as paid. */
	export class PaymentNotInMonthError extends Error { public code = 'payment_not_in_month' }
	export class PaymentNotFoundError extends Error { public code = 'payment_not_found' }

	/** Water readings are in litres, its price is per m³. */
	export const LITRES_PER_CUBIC_METRE = 1000

	/** Months between two occurrences; `once` occurs only in its `startMonth`. */
	export const RECURRENCE_STEP: Record<ExpenseRecurrence, number | null> = {
		[ExpenseRecurrence.once]: null,
		[ExpenseRecurrence.monthly]: 1,
		[ExpenseRecurrence.quarterly]: 3,
		[ExpenseRecurrence.yearly]: 12,
	}

	/** Display order of categories (month view items and totals). */
	export const CATEGORY_ORDER: ExpenseCategory[] = [
		ExpenseCategory.taxes,
		ExpenseCategory.services,
		ExpenseCategory.car,
		ExpenseCategory.kids,
		ExpenseCategory.other,
	]

	export interface ExpenseInput {
		name: string
		category: ExpenseCategory
		amount: number
		recurrence: ExpenseRecurrence
		/** `YYYY-MM` */
		startMonth: string
		/** `YYYY-MM`, inclusive; `null` = indefinitely. Ignored for `once`. */
		endMonth?: string | null
		note?: string | null
		/** Links the expense to a meter sheet - forces `amount = 0`, requires `monthly`. */
		meterSheetGuid?: string | null
		/** Prices an electricity meter-linked expense by the supplier's price periods instead of monthly prices. */
		electricitySupplierGuid?: string | null
		/** Bill the supplier's price with VAT (default) or without. */
		electricityPriceWithVat?: boolean
		/** Who the expense is paid to (a payee of the same account); null = nobody in particular. */
		payeeGuid?: string | null
	}

	export interface UtilityPriceInput {
		unitPriceHigh: number
		/** NT - electricity only (ignored otherwise); null = use VT. */
		unitPriceLow?: number | null
		fixedFee?: number | null
	}

	/** API shape - `month` as `YYYY-MM`. */
	export interface UtilityPrice {
		guid: string
		expenseGuid: string
		month: string
		unitPriceHigh: number
		unitPriceLow: number | null
		fixedFee: number
		createdAt: Date
	}

	/** The part of a price that enters the amount calculation. */
	export interface PriceValues {
		unitPriceHigh: number
		unitPriceLow: number | null
		fixedFee: number
	}

	/** Month consumption by tariff (`low` = NT, electricity only). */
	export interface ConsumptionValues {
		high: number
		low: number | null
	}

	/** How a meter-linked expense's month amount was computed. */
	export interface UtilityCost {
		sheetGuid: string
		sheetName: string
		utility: UtilityType
		consumptionHigh: number
		consumptionLow: number | null
		consumptionTotal: number
		/** Readings dated within the month that had a previous one - 0 = no consumption known yet. */
		readingCount: number
		/** Month the used price was set for (`YYYY-MM`); null = no price at all yet. */
		priceMonth: string | null
		/** The price was set for this very month (otherwise inherited from `priceMonth`). */
		priceConfirmed: boolean
		unitPriceHigh: number | null
		unitPriceLow: number | null
		fixedFee: number | null
		/** The price comes from this electricity supplier (`priceConfirmed` = all days of the month are covered by its periods). */
		supplierGuid: string | null
		supplierLabel: string | null
		/** Whether the supplier's price includes VAT; null for monthly prices. */
		supplierPriceWithVat: boolean | null
		/** How the supplier's periods price the month's days; empty for monthly prices. */
		priceSegments: ElectricityPricesTypes.PriceSegment[]
	}

	export interface MonthExpense extends Expense {
		/** Only for meter-linked expenses; `amount` is then the computed month amount. */
		utility: UtilityCost | null
		/** Corrections of this month's amount (`forMonth` = the month) - counted in their `applyMonth`. */
		corrections: Correction[]
	}

	/**
	 * A correction is entered either as the difference itself (`amount`: + underpayment, − overpayment)
	 * or as the really paid amount (`paidAmount`) - the difference to the computed month amount is stored.
	 */
	export interface CorrectionInput {
		/** `YYYY-MM` - the month the correction is for; the expense must be paid in it. */
		forMonth: string
		/** `YYYY-MM` - the month it is counted in; empty = `forMonth` + 1. */
		applyMonth?: string | null
		amount?: number | null
		paidAmount?: number | null
		note?: string | null
	}

	/** API shape - months as `YYYY-MM`. */
	export interface Correction {
		guid: string
		expenseGuid: string
		forMonth: string
		applyMonth: string
		/** + underpayment, − overpayment (CZK). */
		amount: number
		note: string | null
		createdAt: Date
	}

	/** A correction counted in the month view of its `applyMonth` - a separate row in its expense's category. */
	export interface MonthCorrection extends Correction {
		expenseName: string
		category: ExpenseCategory
		/** The expense's payee - the correction is part of that payee's payment. */
		payeeGuid: string | null
	}

	/**
	 * Everything paid to one payee in a month: its expenses occurring in the month and the corrections
	 * of its expenses applied in the month. Paid = marked by hand (`payee_payment`).
	 */
	export interface MonthPayment {
		payee: PayeesTypes.Payee
		expenseGuids: string[]
		correctionGuids: string[]
		amount: number
		/** The amount when it was marked as paid; null = not paid. Differs from `amount` when the month changed since. */
		paidAmount: number | null
		paidAt: Date | null
		/** QR payment string (SPAYD) - only with the payee's bank account and a positive amount. */
		spayd: string | null
	}

	/** API shape - `month` as `YYYY-MM`. */
	export interface PaidMark {
		payeeGuid: string
		month: string
		amount: number
		paidAt: Date
	}

	/** API shape - months as `YYYY-MM`. */
	export interface Expense {
		guid: string
		accountGuid: string
		name: string
		category: ExpenseCategory
		amount: number
		recurrence: ExpenseRecurrence
		startMonth: string
		endMonth: string | null
		note: string | null
		meterSheetGuid: string | null
		electricitySupplierGuid: string | null
		electricityPriceWithVat: boolean
		payeeGuid: string | null
		createdAt: Date
	}

	/** The part of an expense that decides whether it occurs in a month. */
	export interface Occurrence {
		recurrence: ExpenseRecurrence
		startMonth: string
		endMonth: string | null
	}

	export interface CategoryTotal {
		category: ExpenseCategory
		total: number
	}

	export interface MonthExpenses {
		month: string
		items: MonthExpense[]
		/** Corrections applied in the month (`applyMonth`), included in `categories` and `total`. */
		corrections: MonthCorrection[]
		/** Payments to payees in the month, ordered by payee name (expenses without a payee are in none). */
		payments: MonthPayment[]
		/** Tax return advances paid in the month (`TaxesService.getMonthAdvances`), included in the `taxes` category and `total`. */
		taxAdvances: TaxesTypes.MonthAdvances
		/** All categories in `CATEGORY_ORDER`, zero when nothing is paid in the month. */
		categories: CategoryTotal[]
		total: number
	}
}
