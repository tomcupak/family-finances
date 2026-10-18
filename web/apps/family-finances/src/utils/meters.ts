import type { MeterSheet, UtilityType } from '../api/schema/models'
import { MeterEntryMode } from '../api/schema/models'

export const UTILITY_META: Record<UtilityType, { label: string; unit: string; color: string }> = {
	electricity: { label: 'Elektřina', unit: 'kWh', color: 'var(--electricity)' },
	water: { label: 'Voda', unit: 'l', color: 'var(--water)' },
	gas: { label: 'Plyn', unit: 'm³', color: 'var(--gas)' },
}

/** Electricity meters have two tariffs (VT = valueHigh, NT = valueLow); water and gas a single state. */
export function hasLowTariff(utility: UtilityType): boolean {
	return utility === 'electricity'
}

export const ENTRY_MODE_LABEL: Record<MeterEntryMode, string> = {
	state: 'Stav měřidla',
	increment: 'Spotřeba za období (přírůstek)',
}

/** An `increment` sheet stores the consumption itself (e.g. a car charger's kWh for the month), not meter states. */
export function isIncrement(sheet: Pick<MeterSheet, 'entryMode'>): boolean {
	return sheet.entryMode === MeterEntryMode.increment
}

function toIsoDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Default date for a new reading: the last day of the current month - or of the previous month
 * during the 1st-10th (readings are taken around the turn of the month).
 */
export function defaultReadingDate(today: Date = new Date()): string {
	const monthOffset = today.getDate() <= 10 ? 0 : 1
	return toIsoDate(new Date(today.getFullYear(), today.getMonth() + monthOffset, 0))
}

export function todayIso(): string {
	return toIsoDate(new Date())
}

export function monthsAgoIso(months: number): string {
	const date = new Date()
	date.setMonth(date.getMonth() - months)
	return toIsoDate(date)
}

const numberFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 3 })

export function formatValue(value: number | null | undefined): string {
	return value === null || value === undefined ? '–' : numberFormat.format(value)
}

export function formatDiff(value: number | null | undefined): string {
	if (value === null || value === undefined) return '–'
	return `${value > 0 ? '+' : ''}${numberFormat.format(value)}`
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return '–'
	return new Date(`${iso}T00:00:00`).toLocaleDateString('cs-CZ')
}

/** Parses a number input value (accepts a decimal comma); `undefined` for an empty field. */
export function parseNumberInput(value: string): number | undefined {
	const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
	if (!normalized) return undefined
	const parsed = Number(normalized)
	return Number.isNaN(parsed) ? undefined : parsed
}
