import { TaxAdvanceKind } from '@family-finances/database'

export namespace TaxesTypes {
	export class TaxReturnNotFoundError extends Error { public code = 'tax_return_not_found' }
	export class DuplicateTaxReturnError extends Error { public code = 'duplicate_tax_return' }
	/** Year outside `MIN_YEAR`..`MAX_YEAR`. */
	export class InvalidTaxYearError extends Error { public code = 'invalid_tax_year' }
	/** Advance month number outside 1-12. */
	export class InvalidTaxAdvanceMonthError extends Error { public code = 'invalid_tax_advance_month' }
	/** The tax return is closed - neither it, its advances nor the year's income can be changed. */
	export class TaxReturnClosedError extends Error { public code = 'tax_return_closed' }
	/** Only a year entirely in the past (today > 31 Dec) can be closed. */
	export class TaxYearNotFinishedError extends Error { public code = 'tax_year_not_finished' }

	export const MIN_YEAR = 2000
	export const MAX_YEAR = 2100

	/** Order of the advance kinds in responses. */
	export const ADVANCE_KINDS: TaxAdvanceKind[] = [TaxAdvanceKind.social, TaxAdvanceKind.health, TaxAdvanceKind.tax]

	/** The year's constants - rates in % (60 = 60 %), amounts in CZK per year. */
	export interface Constants {
		expenseRatePct: number
		taxRatePct: number
		assessmentBasePct: number
		socialRatePct: number
		healthRatePct: number
		socialMin: number
		healthMin: number
		basicDiscount: number
		spouseDiscount: number
		/** Σ for all children. */
		childDiscount: number
	}

	/** Used for a new tax return when the account has no earlier one to copy the constants from. */
	export const DEFAULT_CONSTANTS: Constants = {
		expenseRatePct: 60,
		taxRatePct: 15,
		assessmentBasePct: 55,
		socialRatePct: 29.2,
		healthRatePct: 13.5,
		socialMin: 57108,
		healthMin: 37716,
		basicDiscount: 30840,
		spouseDiscount: 24840,
		childDiscount: 35664,
	}

	export interface SettingsInput extends Constants {
		/** null = income from the income plan (Σ expectedInvoice). */
		incomeOverride?: number | null
	}

	export interface AdvanceInput {
		amount: number
		/** "Nastavit od měsíce": also copy the amount to all following months of the year. */
		applyToFollowingMonths?: boolean
	}

	export interface Calculation {
		/** incomeOverride ?? Σ expectedInvoice of the year's income plan. */
		income: number
		/** income × (1 − expenseRatePct) */
		taxBase: number
		/** taxBase × taxRatePct */
		tax: number
		/** taxBase × assessmentBasePct */
		assessmentBase: number
		/** max(assessmentBase × socialRatePct, socialMin) */
		social: number
		/** max(assessmentBase × healthRatePct, healthMin) */
		health: number
		/** max(tax − basic − spouse, 0) − child; negative = tax bonus. */
		taxAfterDiscounts: number
		/** income / 12 */
		grossMonthly: number
		/** income − social − health − taxAfterDiscounts */
		net: number
		/** net / 12 */
		netMonthly: number
	}

	export interface AdvanceMonth {
		/** 1-12 */
		month: number
		social: number
		health: number
		tax: number
	}

	export interface AdvanceSums {
		social: number
		health: number
		tax: number
	}

	export interface Settlement {
		kind: TaxAdvanceKind
		/** From the calculation (social / health / taxAfterDiscounts). */
		computed: number
		/** Σ advances of the year. */
		paid: number
		/** computed − paid: + = underpayment (doplatek), − = overpayment (přeplatek). */
		difference: number
	}

	export interface TaxReturnSummary {
		guid: string
		accountGuid: string
		year: number
		closedAt: Date | null
	}

	export interface TaxReturn extends TaxReturnSummary, Constants {
		incomeOverride: number | null
		/** Σ expectedInvoice of the year's income plan; null = the account has no income plan for the year. */
		plannedIncome: number | null
		/** Whether the year is entirely in the past, i.e. the return can be closed. */
		canClose: boolean
		calculation: Calculation
		/** Always 12 months, January first; a missing advance is 0. */
		advances: AdvanceMonth[]
		advanceTotals: AdvanceSums
		/** social, health, tax */
		settlement: Settlement[]
		createdAt: Date
	}

	export interface MonthAdvances extends AdvanceSums {
		total: number
	}
}
