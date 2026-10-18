import type { Expense, UtilityType } from '../api/schema/models'
import { ExpenseCategory, ExpenseRecurrence } from '../api/schema/models'

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
	taxes: 'Daně',
	services: 'Služby',
	car: 'Auto',
	kids: 'Děti',
	other: 'Ostatní',
}

export const RECURRENCE_LABEL: Record<ExpenseRecurrence, string> = {
	once: 'Jednorázově',
	monthly: 'Měsíčně',
	quarterly: 'Čtvrtletně',
	yearly: 'Ročně',
}

export const CATEGORIES = Object.values(ExpenseCategory)
export const RECURRENCES = Object.values(ExpenseRecurrence)

/** Current month as `YYYY-MM` (local time). */
export function currentMonth(today: Date = new Date()): string {
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

/** `2026-12`, 1 → `2027-01` */
export function addMonths(month: string, count: number): string {
	const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + count, 1)
	return currentMonth(date)
}

/** `2026-09` → `září 2026` */
export function formatMonth(month: string | null | undefined): string {
	if (!month) return '–'
	const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
	return date.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
}

const moneyFormat = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 })

export function formatMoney(value: number): string {
	return moneyFormat.format(value)
}

/** Explicit sign for differences: `+312 Kč`, `−120 Kč`. */
export function formatSignedMoney(value: number): string {
	return value > 0 ? `+${moneyFormat.format(value)}` : moneyFormat.format(value)
}

/** + underpayment (pay extra), − overpayment (refund). */
export function correctionLabel(amount: number): string {
	return amount > 0 ? 'nedoplatek' : 'přeplatek'
}

/** Expense no longer paid: its (inclusive) end month is already behind `month`. */
export function isEnded(expense: Expense, month: string = currentMonth()): boolean {
	return expense.endMonth !== null && expense.endMonth < month
}

/** Unit the price of a meter-linked expense is entered in (water readings are litres, priced per m³). */
export const PRICE_UNIT: Record<UtilityType, string> = {
	electricity: 'Kč/kWh',
	water: 'Kč/m³',
	gas: 'Kč/m³',
}

const unitPriceFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 })

export function formatUnitPrice(value: number | null | undefined, utility: UtilityType): string {
	return value === null || value === undefined ? '–' : `${unitPriceFormat.format(value)} ${PRICE_UNIT[utility]}`
}
