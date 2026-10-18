import { IncomeType } from '@family-finances/database'

export namespace IncomeTypes {
	export class IncomeYearNotFoundError extends Error { public code = 'income_year_not_found' }
	export class DuplicateIncomeYearError extends Error { public code = 'duplicate_income_year' }
	/** Year outside `MIN_YEAR`..`MAX_YEAR`. */
	export class InvalidIncomeYearError extends Error { public code = 'invalid_income_year' }
	/** Month number outside 1-12, or more vacation days than working days. */
	export class InvalidIncomeMonthError extends Error { public code = 'invalid_income_month' }
	/** The year is locked (closed tax return) - its income can't be changed. */
	export class IncomeYearLockedError extends Error { public code = 'income_year_locked' }

	export const MIN_YEAR = 2000
	export const MAX_YEAR = 2100

	/** Hours of a working day - OSVČ real earnings = hourlyRate × HOURS_PER_DAY × (workingDays − vacationDays). */
	export const HOURS_PER_DAY = 8

	/** Vacation days of a new year when none are given. */
	export const DEFAULT_VACATION_ALLOWANCE = 27

	export interface YearInput {
		year: number
		type: IncomeType
		defaultHourlyRate?: number | null
		/** Default `DEFAULT_VACATION_ALLOWANCE`. */
		vacationAllowance?: number
	}

	export interface YearSettingsInput {
		type: IncomeType
		defaultHourlyRate?: number | null
		/** Omitted = unchanged. */
		vacationAllowance?: number
	}

	export interface MonthInput {
		grossSalary: number
		netSalary?: number | null
		hourlyRate: number
		workingDays: number
		vacationDays: number
		expectedInvoice: number
	}

	/** The OSVČ part of a month that enters the vacation check. */
	export interface VacationValues {
		hourlyRate: number
		workingDays: number
		vacationDays: number
		expectedInvoice: number
	}

	export interface IncomeYearSummary {
		guid: string
		accountGuid: string
		year: number
		type: IncomeType
		defaultHourlyRate: number | null
		/** OSVČ vacation days for the year. */
		vacationAllowance: number
		createdAt: Date
	}

	export interface IncomeMonth {
		guid: string
		/** 1-12 */
		month: number
		grossSalary: number
		/** null = same as gross (`netOrGross`). */
		netSalary: number | null
		hourlyRate: number
		workingDays: number
		vacationDays: number
		expectedInvoice: number
		/** OSVČ real earnings of the month: hourlyRate × 8 × (workingDays − vacationDays). */
		earned: number
		/** OSVČ transfer to the vacation savings account in this month: earned − expectedInvoice (− = withdrawal). */
		vacationSaving: number
		/** OSVČ vacation check from January up to this month incl.: Σ earned − Σ expectedInvoice. */
		vacationBalance: number
	}

	export interface IncomeTotals {
		grossSalary: number
		/** Σ (netSalary ?? grossSalary). */
		netSalary: number
		earned: number
		expectedInvoice: number
		workingDays: number
		vacationDays: number
	}

	export interface IncomeYear extends IncomeYearSummary {
		/** Closed tax return of the year - income can't be changed. */
		locked: boolean
		/** Always 12 months, January first. */
		months: IncomeMonth[]
		totals: IncomeTotals
		/** Vacation days still to assign to months: vacationAllowance − Σ vacationDays (− = more assigned than the allowance). */
		vacationRemaining: number
	}
}
