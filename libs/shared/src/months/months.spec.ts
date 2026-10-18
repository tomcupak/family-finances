import { Months } from '..'

describe('Months', () => {
	it('validates the YYYY-MM format', () => {
		expect(Months.isValid('2026-09')).toBe(true)
		expect(Months.isValid('2026-13')).toBe(false)
		expect(Months.isValid('2026-9')).toBe(false)
		expect(Months.isValid('2026-09-01')).toBe(false)
	})

	it('computes first and last day of a month', () => {
		expect(Months.firstDay('2026-02')).toBe('2026-02-01')
		expect(Months.lastDay('2026-02')).toBe('2026-02-28')
		expect(Months.lastDay('2024-02')).toBe('2024-02-29')
		expect(Months.lastDay('2026-12')).toBe('2026-12-31')
	})

	it('adds months across year boundaries', () => {
		expect(Months.add('2026-12', 1)).toBe('2027-01')
		expect(Months.add('2026-01', -1)).toBe('2025-12')
		expect(Months.add('2026-05', 12)).toBe('2027-05')
	})

	it('counts months between two months', () => {
		expect(Months.diff('2026-11', '2027-02')).toBe(3)
		expect(Months.diff('2026-05', '2026-05')).toBe(0)
		expect(Months.diff('2027-01', '2026-12')).toBe(-1)
	})

	it('converts a date to its month', () => {
		expect(Months.fromDate('2026-09-15')).toBe('2026-09')
	})

	it('formats the local date and month of a Date', () => {
		const date = new Date(2026, 0, 5, 23, 30)
		expect(Months.today(date)).toBe('2026-01-05')
		expect(Months.current(date)).toBe('2026-01')
	})
})
