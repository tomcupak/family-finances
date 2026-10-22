import type { PriceSegment } from '../api/schema/models'
import { ElectricityPriceMode } from '../api/schema/models'

/** Same as the API's `ElectricityPricesTypes.VAT_RATE_PCT` - only for the live preview in the period form. */
export const VAT_RATE_PCT = 21

export const PRICE_MODE_LABEL: Record<ElectricityPriceMode, string> = {
	fixed: 'Fixní cena smlouvy',
	spot: 'SPOT – vyúčtování',
}

export const PRICE_MODES = Object.values(ElectricityPriceMode)

const kwhPriceFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 })

export function formatKwhPrice(value: number | null | undefined): string {
	return value === null || value === undefined ? '–' : `${kwhPriceFormat.format(value)} Kč/kWh`
}

/** `2026-09-01`, `2026-09-14` → `1. 9. – 14. 9.`; a single day just once. */
export function formatDayRange(from: string, to: string): string {
	const day = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`
	return from === to ? day(from) : `${day(from)} – ${day(to)}`
}

/** `1. 9. – 14. 9.: 4,84 Kč/kWh · 15. 9. – 30. 9.: 5 Kč/kWh (odhad)` */
export function formatSegments(segments: PriceSegment[]): string {
	return segments
		.map((s) => `${formatDayRange(s.dateFrom, s.dateTo)}: ${formatKwhPrice(s.unitPrice)}${s.estimated ? ' (odhad)' : ''}`)
		.join(' · ')
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Day after `iso` (`YYYY-MM-DD`). */
export function nextDay(iso: string): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}

/** Days from `from` to `to` (`YYYY-MM-DD`), both included. */
export function daysInclusive(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}
