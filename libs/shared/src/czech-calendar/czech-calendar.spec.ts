import { CzechCalendar } from '..'

describe('CzechCalendar', () => {
	it('computes Easter Sunday', () => {
		expect(CzechCalendar.easterSunday(2024)).toBe('2024-03-31')
		expect(CzechCalendar.easterSunday(2025)).toBe('2025-04-20')
		expect(CzechCalendar.easterSunday(2026)).toBe('2026-04-05')
		expect(CzechCalendar.easterSunday(2019)).toBe('2019-04-21')
	})

	it('lists public holidays incl. Good Friday and Easter Monday', () => {
		const holidays = CzechCalendar.publicHolidays(2026)

		expect(holidays).toHaveLength(13)
		expect(holidays).toEqual(expect.arrayContaining(['2026-04-03', '2026-04-06', '2026-01-01', '2026-12-26']))
	})

	it('counts working days of 2026 months (weekends + holidays)', () => {
		const days = Array.from({ length: 12 }, (_, i) => CzechCalendar.workingDays(2026, i + 1))

		// Jan: 1.1. Thu; Apr: Good Friday 3.4. + Easter Monday 6.4.; May: 1.5. + 8.5. both Fri;
		// Jul: 6.7. Mon (5.7. Sun); Sep: 28.9. Mon; Oct: 28.10. Wed; Nov: 17.11. Tue; Dec: 24.-26. Thu-Sat.
		expect(days).toEqual([21, 20, 22, 20, 19, 22, 22, 21, 21, 21, 20, 21])
		expect(days.reduce((a, b) => a + b, 0)).toBe(250)
	})

	it('counts working days of February in a leap year', () => {
		expect(CzechCalendar.workingDays(2024, 2)).toBe(21)
	})

	it('does not subtract a holiday falling on a weekend twice', () => {
		// 2025-11-17 is Monday, 2025-12-24..26 Wed-Fri; 2027-05-01 and 05-08 are Saturdays.
		expect(CzechCalendar.workingDays(2027, 5)).toBe(21)
	})
})
