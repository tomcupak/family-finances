/**
 * Month helpers. In the API a month is a `YYYY-MM` string, in the DB a `date` on the first day
 * of the month (`YYYY-MM-01`).
 */
export const PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValid(month: string): boolean {
	return PATTERN.test(month)
}

/** `2026-09` → `2026-09-01` */
export function firstDay(month: string): string {
	return `${month}-01`
}

/** `2026-09` → `2026-09-30` */
export function lastDay(month: string): string {
	const [year, monthIndex] = parse(month)
	const date = new Date(Date.UTC(year, monthIndex + 1, 0))
	return date.toISOString().slice(0, 10)
}

/** `2026-12`, 1 → `2027-01` */
export function add(month: string, count: number): string {
	const [year, monthIndex] = parse(month)
	const date = new Date(Date.UTC(year, monthIndex + count, 1))
	return date.toISOString().slice(0, 7)
}

/** Number of months from `from` to `to` (`2026-11`, `2027-02` → 3; negative when `to` is earlier). */
export function diff(from: string, to: string): number {
	const [fromYear, fromIndex] = parse(from)
	const [toYear, toIndex] = parse(to)
	return (toYear - fromYear) * 12 + (toIndex - fromIndex)
}

/** `2026-09-15` (or a `YYYY-MM-01` DB date) → `2026-09` */
export function fromDate(date: string): string {
	return date.slice(0, 7)
}

/** Local (server time zone) date `YYYY-MM-DD` of `date` (default now). */
export function today(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local (server time zone) month `YYYY-MM` of `date` (default now). */
export function current(date: Date = new Date()): string {
	return fromDate(today(date))
}

function parse(month: string): [number, number] {
	if (!isValid(month)) throw new Error(`Invalid month "${month}", expected YYYY-MM`)
	return [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
}
