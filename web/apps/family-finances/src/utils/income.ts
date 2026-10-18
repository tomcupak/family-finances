import { IncomeType } from '../api/schema/models'
import { parseNumberInput } from './meters'

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
	employee: 'Zaměstnanec (HPP)',
	self_employed: 'OSVČ',
}

export const INCOME_TYPES = Object.values(IncomeType)

/** Hours of a working day - must match the API's `IncomeTypes.HOURS_PER_DAY`. */
export const HOURS_PER_DAY = 8

/** Vacation days of a new OSVČ year - must match the API's `IncomeTypes.DEFAULT_VACATION_ALLOWANCE`. */
export const DEFAULT_VACATION_ALLOWANCE = 27

export const VACATION_ALLOWANCE_ERROR = 'Dovolená na rok musí být 0–366 dní po půldnech.'

/** Yearly vacation days from an input (half days allowed); `null` when empty or invalid. */
export function parseVacationAllowance(value: string): number | null {
	const parsed = parseNumberInput(value)
	if (parsed === undefined || parsed < 0 || parsed > 366 || !Number.isInteger(parsed * 2)) return null
	return parsed
}

/** Month number 1-12 → `leden` … `prosinec`. */
export function monthName(monthNumber: number): string {
	return new Date(2000, monthNumber - 1, 1).toLocaleDateString('cs-CZ', { month: 'long' })
}

/**
 * Default month of the vacation check for a year: the current month in the current year,
 * December for past years, January for future ones.
 */
export function defaultCheckMonth(year: number, today: Date = new Date()): number {
	if (year < today.getFullYear()) return 12
	if (year > today.getFullYear()) return 1
	return today.getMonth() + 1
}

const daysFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 })

export function formatDays(value: number): string {
	return daysFormat.format(value)
}
