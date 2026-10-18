import { coreSchema, DbProvider, IncomeType } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'
import { eq } from 'drizzle-orm'

import { AccountsService } from '../accounts/accounts.service'
import { AccountsTypes } from '../accounts/accounts.types'
import { IncomeService } from './income.service'
import { IncomeTypes } from './income.types'

const mockAccountsService = { get: jest.fn() }

function makeMonthRow(month: number, values: Partial<typeof coreSchema.incomeMonth.$inferSelect> = {}) {
	return {
		guid: `m${month}`,
		incomeYearGuid: 'y',
		month,
		grossSalary: 0,
		netSalary: null,
		hourlyRate: 0,
		workingDays: 20,
		vacationDays: 0,
		expectedInvoice: 0,
		...values,
	}
}

function makeMonthInput(values: Partial<IncomeTypes.MonthInput> = {}): IncomeTypes.MonthInput {
	return { grossSalary: 0, netSalary: null, hourlyRate: 0, workingDays: 20, vacationDays: 0, expectedInvoice: 0, ...values }
}

describe('IncomeService', () => {
	let service: IncomeService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new IncomeService({} as never, mockAccountsService as never)
	})

	describe('computeEarned', () => {
		it('is hourlyRate × 8 × (workingDays − vacationDays)', () => {
			expect(service['computeEarned']({ hourlyRate: 800, workingDays: 21, vacationDays: 0, expectedInvoice: 0 })).toBe(134400)
			expect(service['computeEarned']({ hourlyRate: 800, workingDays: 21, vacationDays: 5, expectedInvoice: 0 })).toBe(102400)
			expect(service['computeEarned']({ hourlyRate: 812.5, workingDays: 20, vacationDays: 0.5, expectedInvoice: 0 })).toBe(126750)
		})
	})

	describe('toMonths', () => {
		it('accumulates the vacation check Σ earned − Σ expectedInvoice month by month', () => {
			const months = service['toMonths']([
				// invoice 140 000, earned 800 × 8 × 21 = 134 400 → −5 600
				makeMonthRow(1, { hourlyRate: 800, workingDays: 21, expectedInvoice: 140000 }),
				// invoice 140 000, earned 800 × 8 × 10 = 64 000 → −76 000 (vacation half the month)
				makeMonthRow(2, { hourlyRate: 800, workingDays: 20, vacationDays: 10, expectedInvoice: 140000 }),
				// invoice 0 (not paid yet), earned 800 × 8 × 20 = 128 000 → +128 000
				makeMonthRow(3, { hourlyRate: 800, workingDays: 20, expectedInvoice: 0 }),
			])

			expect(months.map((m) => m.earned)).toEqual([134400, 64000, 128000])
			expect(months.map((m) => m.vacationSaving)).toEqual([-5600, -76000, 128000])
			expect(months.map((m) => m.vacationBalance)).toEqual([-5600, -81600, 46400])
		})

		it('rounds the balance to haléře', () => {
			const months = service['toMonths']([
				makeMonthRow(1, { hourlyRate: 0.01, workingDays: 1, expectedInvoice: 0.1 }),
				makeMonthRow(2, { hourlyRate: 0.01, workingDays: 1, expectedInvoice: 0.2 }),
			])

			expect(months[1]?.vacationBalance).toBe(-0.14)
		})
	})

	describe('computeTotals', () => {
		it('sums the months, net salary falling back to gross', () => {
			const months = service['toMonths']([
				makeMonthRow(1, { grossSalary: 50000, netSalary: 38000, hourlyRate: 500, workingDays: 20, vacationDays: 1, expectedInvoice: 80000 }),
				makeMonthRow(2, { grossSalary: 52000, netSalary: null, hourlyRate: 500, workingDays: 21, vacationDays: 0.5, expectedInvoice: 80000 }),
			])

			expect(service['computeTotals'](months)).toEqual({
				grossSalary: 102000,
				netSalary: 90000,
				earned: 76000 + 82000,
				expectedInvoice: 160000,
				workingDays: 41,
				vacationDays: 1.5,
			})
		})
	})

	describe('buildDefaultMonths', () => {
		it('prefills working days by the Czech calendar and the default hourly rate', () => {
			const months = service['buildDefaultMonths'](2026, 750)

			expect(months).toHaveLength(12)
			expect(months[3]).toEqual({ month: 4, workingDays: 20, hourlyRate: 750 })
			expect(months.reduce((sum, m) => sum + m.workingDays, 0)).toBe(250)
		})

		it('uses 0 without a default hourly rate', () => {
			expect(service['buildDefaultMonths'](2026, null).every((m) => m.hourlyRate === 0)).toBe(true)
		})
	})

	describe('updateMonth validation', () => {
		it('rejects a month number outside 1-12', async () => {
			await expect(service.updateMonth('a', 2026, 13, makeMonthInput())).rejects.toThrow(IncomeTypes.InvalidIncomeMonthError)
			await expect(service.updateMonth('a', 2026, 0, makeMonthInput())).rejects.toThrow(IncomeTypes.InvalidIncomeMonthError)
		})

		it('rejects more vacation days than working days', async () => {
			await expect(service.updateMonth('a', 2026, 1, makeMonthInput({ workingDays: 5, vacationDays: 5.5 })))
				.rejects.toThrow(IncomeTypes.InvalidIncomeMonthError)
		})
	})

	describe('createYear validation', () => {
		it('rejects a year out of range before touching the DB', async () => {
			await expect(service.createYear('a', { year: 1999, type: IncomeType.employee })).rejects.toThrow(IncomeTypes.InvalidIncomeYearError)
			expect(mockAccountsService.get).not.toHaveBeenCalled()
		})
	})

	describe('DB', () => {
		let db: DbProvider
		let accountGuid: string

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			const accountsService = new AccountsService(db)
			service = new IncomeService(db, accountsService)
			accountGuid = (await accountsService.create('Rodina')).guid
		})

		it('creates a year with 12 months prefilled from the calendar and default rate', async () => {
			const year = await service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed, defaultHourlyRate: 800 })

			expect(year).toEqual(expect.objectContaining({ year: 2026, type: IncomeType.self_employed, defaultHourlyRate: 800, locked: false, vacationAllowance: 27, vacationRemaining: 27 }))
			expect(year.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
			expect(year.months.map((m) => m.workingDays)).toEqual([21, 20, 22, 20, 19, 22, 22, 21, 21, 21, 20, 21])
			expect(year.months.every((m) => m.hourlyRate === 800 && m.expectedInvoice === 0 && m.netSalary === null)).toBe(true)
			expect(year.totals.workingDays).toBe(250)
		})

		it('rejects a duplicate year of the same account, allows it for another account', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.employee })

			await expect(service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed }))
				.rejects.toThrow(IncomeTypes.DuplicateIncomeYearError)

			const other = await new AccountsService(db).create('Firma')
			await expect(service.createYear(other.guid, { year: 2026, type: IncomeType.employee })).resolves.toEqual(expect.objectContaining({ year: 2026 }))
		})

		it('throws AccountNotFoundError for an unknown account', async () => {
			await expect(service.createYear('00000000-0000-0000-0000-000000000000', { year: 2026, type: IncomeType.employee }))
				.rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})

		it('lists years newest first; getYear / findYear on a missing year', async () => {
			await service.createYear(accountGuid, { year: 2025, type: IncomeType.employee })
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed })

			expect((await service.listYears(accountGuid)).map((y) => y.year)).toEqual([2026, 2025])
			await expect(service.getYear(accountGuid, 2024)).rejects.toThrow(IncomeTypes.IncomeYearNotFoundError)
			await expect(service.findYear(accountGuid, 2024)).resolves.toBeNull()
		})

		it('updates a month and recomputes earnings, totals and the vacation balance', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed, defaultHourlyRate: 800 })

			await service.updateMonth(accountGuid, 2026, 1, makeMonthInput({ hourlyRate: 800, workingDays: 21, expectedInvoice: 140000 }))
			const year = await service.updateMonth(accountGuid, 2026, 2, makeMonthInput({ hourlyRate: 800, workingDays: 20, vacationDays: 2.5, expectedInvoice: 140000 }))

			expect(year.months[1]).toEqual(expect.objectContaining({ month: 2, vacationDays: 2.5, earned: 112000, vacationSaving: -28000, vacationBalance: -5600 - 28000 }))
			expect(year.totals.expectedInvoice).toBe(280000)
			expect(year.vacationRemaining).toBe(27 - 2.5)
			expect(await service.getVacationBalance(accountGuid, '2026-02')).toBe(-33600)
			// March untouched: invoice 0, earned 800 × 8 × 22
			expect(await service.getVacationBalance(accountGuid, '2026-03')).toBe(-33600 + 140800)
		})

		it('returns null vacation balance for an HPP year or a year without a plan', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.employee })

			expect(await service.getVacationBalance(accountGuid, '2026-05')).toBeNull()
			expect(await service.getVacationBalance(accountGuid, '2027-05')).toBeNull()
		})

		it('moves months still on the previous default hourly rate to the new default', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed, defaultHourlyRate: 800 })
			await service.updateMonth(accountGuid, 2026, 3, makeMonthInput({ hourlyRate: 900 }))

			const year = await service.updateYear(accountGuid, 2026, { type: IncomeType.self_employed, defaultHourlyRate: 850 })

			expect(year.defaultHourlyRate).toBe(850)
			expect(year.months.map((m) => m.hourlyRate)).toEqual([850, 850, 900, 850, 850, 850, 850, 850, 850, 850, 850, 850])
		})

		it('sets the vacation allowance on create, changes it on update, keeps it when omitted', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed, vacationAllowance: 25.5 })
			await service.updateMonth(accountGuid, 2026, 7, makeMonthInput({ workingDays: 22, vacationDays: 10 }))

			expect(await service.getYear(accountGuid, 2026)).toEqual(expect.objectContaining({ vacationAllowance: 25.5, vacationRemaining: 15.5 }))
			expect(await service.updateYear(accountGuid, 2026, { type: IncomeType.self_employed, vacationAllowance: 5 }))
				.toEqual(expect.objectContaining({ vacationAllowance: 5, vacationRemaining: -5 }))
			expect((await service.updateYear(accountGuid, 2026, { type: IncomeType.self_employed })).vacationAllowance).toBe(5)
		})

		it('removing a year cascades to its months; removing the account cascades to its years', async () => {
			await service.createYear(accountGuid, { year: 2025, type: IncomeType.employee })
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.employee })

			await service.removeYear(accountGuid, 2025)
			expect(await db.core.select().from(coreSchema.incomeMonth)).toHaveLength(12)

			await new AccountsService(db).remove(accountGuid)
			expect(await db.core.select().from(coreSchema.incomeYear)).toHaveLength(0)
			expect(await db.core.select().from(coreSchema.incomeMonth)).toHaveLength(0)
		})

		it('rejects a month number outside 1-12 at the DB level too', async () => {
			const [yearRow] = await db.core.insert(coreSchema.incomeYear).values({ accountGuid, year: 2026, type: IncomeType.employee }).returning()
			if (!yearRow) throw new Error('no row')

			await expect(db.core.insert(coreSchema.incomeMonth).values({ incomeYearGuid: yearRow.guid, month: 13, workingDays: 0 })).rejects.toThrow()
			expect(await db.core.select().from(coreSchema.incomeMonth).where(eq(coreSchema.incomeMonth.incomeYearGuid, yearRow.guid))).toHaveLength(0)
		})

		it('refuses changes of a locked year', async () => {
			await service.createYear(accountGuid, { year: 2026, type: IncomeType.employee })
			jest.spyOn(service, 'isYearLocked').mockResolvedValue(true)

			await expect(service.updateMonth(accountGuid, 2026, 1, makeMonthInput())).rejects.toThrow(IncomeTypes.IncomeYearLockedError)
			await expect(service.updateYear(accountGuid, 2026, { type: IncomeType.self_employed })).rejects.toThrow(IncomeTypes.IncomeYearLockedError)
			await expect(service.removeYear(accountGuid, 2026)).rejects.toThrow(IncomeTypes.IncomeYearLockedError)
			expect((await service.getYear(accountGuid, 2026)).locked).toBe(true)
		})
	})
})
