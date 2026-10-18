/**
 * Czech public calendar: public holidays (státní svátky + ostatní svátky incl. Good Friday and Easter
 * Monday) and working days (Mon-Fri that are not a public holiday). Dates are ISO `YYYY-MM-DD` strings.
 */

/** Fixed-date holidays as `MM-DD`. */
export const FIXED_HOLIDAYS = [
	'01-01', // Den obnovy samostatného českého státu, Nový rok
	'05-01', // Svátek práce
	'05-08', // Den vítězství
	'07-05', // Den slovanských věrozvěstů Cyrila a Metoděje
	'07-06', // Den upálení mistra Jana Husa
	'09-28', // Den české státnosti
	'10-28', // Den vzniku samostatného československého státu
	'11-17', // Den boje za svobodu a demokracii
	'12-24', // Štědrý den
	'12-25', // 1. svátek vánoční
	'12-26', // 2. svátek vánoční
]

/** Easter Sunday (Gregorian, anonymous algorithm / Meeus-Jones-Butcher) as `YYYY-MM-DD`. */
export function easterSunday(year: number): string {
	const a = year % 19
	const b = Math.floor(year / 100)
	const c = year % 100
	const d = Math.floor(b / 4)
	const e = b % 4
	const f = Math.floor((b + 8) / 25)
	const g = Math.floor((b - f + 1) / 3)
	const h = (19 * a + b - d - g + 15) % 30
	const i = Math.floor(c / 4)
	const k = c % 4
	const l = (32 + 2 * e + 2 * i - h - k) % 7
	const m = Math.floor((a + 11 * h + 22 * l) / 451)
	const month = Math.floor((h + l - 7 * m + 114) / 31)
	const day = ((h + l - 7 * m + 114) % 31) + 1
	return toIso(new Date(Date.UTC(year, month - 1, day)))
}

/** All public holidays of the year (fixed ones + Good Friday + Easter Monday), sorted. */
export function publicHolidays(year: number): string[] {
	const easter = new Date(`${easterSunday(year)}T00:00:00.000Z`)
	const goodFriday = toIso(addDays(easter, -2))
	const easterMonday = toIso(addDays(easter, 1))
	return [...FIXED_HOLIDAYS.map((md) => `${year}-${md}`), goodFriday, easterMonday].sort()
}

/** Number of working days in a month (`monthNumber` 1-12): Mon-Fri minus public holidays. */
export function workingDays(year: number, monthNumber: number): number {
	const holidays = new Set(publicHolidays(year))
	const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
	let count = 0
	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(Date.UTC(year, monthNumber - 1, day))
		const weekDay = date.getUTCDay()
		if (weekDay !== 0 && weekDay !== 6 && !holidays.has(toIso(date))) count++
	}
	return count
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function toIso(date: Date): string {
	return date.toISOString().slice(0, 10)
}
