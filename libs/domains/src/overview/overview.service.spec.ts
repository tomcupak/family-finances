import { DbProvider, ExpenseCategory, ExpenseRecurrence, IncomeType, TaxAdvanceKind, UtilityType } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'

import { AccountsService } from '../accounts/accounts.service'
import { AccountsTypes } from '../accounts/accounts.types'
import { ExpensesService } from '../expenses/expenses.service'
import { ExpensesTypes } from '../expenses/expenses.types'
import { IncomeService } from '../income/income.service'
import { IncomeTypes } from '../income/income.types'
import { MetersService } from '../meters/meters.service'
import { PayeesService } from '../payees/payees.service'
import { SavingsService } from '../savings/savings.service'
import { SavingsTypes } from '../savings/savings.types'
import { TaxesService } from '../taxes/taxes.service'
import { TaxesTypes } from '../taxes/taxes.types'
import { OverviewService } from './overview.service'

const mockExpensesService = { getMonth: jest.fn() }
const mockIncomeService = { findYear: jest.fn() }
const mockSavingsService = { getMonth: jest.fn() }

const TODAY = '2026-09-15'

function makeCategories(totals: Partial<Record<ExpenseCategory, number>> = {}): ExpensesTypes.CategoryTotal[] {
	return ExpensesTypes.CATEGORY_ORDER.map((category) => ({ category, total: totals[category] ?? 0 }))
}

function makeExpenses(values: Partial<ExpensesTypes.MonthExpenses> = {}): ExpensesTypes.MonthExpenses {
	return { month: '2026-09', items: [], corrections: [], payments: [], taxAdvances: makeAdvances(), categories: makeCategories(), total: 0, ...values }
}

function makeAdvances(values: Partial<TaxesTypes.MonthAdvances> = {}): TaxesTypes.MonthAdvances {
	return { social: 0, health: 0, tax: 0, total: 0, ...values }
}

function makeSavings(values: Partial<SavingsTypes.MonthSavings> = {}): SavingsTypes.MonthSavings {
	return { month: '2026-09', totalContribution: 0, totalExpectedBalance: 0, goals: [], ...values }
}

function makeIncomeMonth(month: number, values: Partial<IncomeTypes.IncomeMonth> = {}): IncomeTypes.IncomeMonth {
	return {
		guid: `m${month}`, month, grossSalary: 0, netSalary: null, hourlyRate: 0, workingDays: 20, vacationDays: 0,
		expectedInvoice: 0, earned: 0, vacationSaving: 0, vacationBalance: 0, ...values,
	}
}

function makeIncomeYear(type: IncomeType, september: Partial<IncomeTypes.IncomeMonth>): IncomeTypes.IncomeYear {
	return {
		guid: 'y', accountGuid: 'a', year: 2026, type, defaultHourlyRate: null, vacationAllowance: 27, createdAt: new Date(), locked: false, vacationRemaining: 27,
		months: Array.from({ length: 12 }, (_, i) => makeIncomeMonth(i + 1, i === 8 ? september : {})),
		totals: { grossSalary: 0, netSalary: 0, earned: 0, expectedInvoice: 0, workingDays: 0, vacationDays: 0 },
	}
}

function makeMonthInput(values: Partial<IncomeTypes.MonthInput> = {}): IncomeTypes.MonthInput {
	return { grossSalary: 0, netSalary: null, hourlyRate: 0, workingDays: 20, vacationDays: 0, expectedInvoice: 0, ...values }
}

describe('OverviewService', () => {
	let service: OverviewService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new OverviewService(mockExpensesService as never, mockIncomeService as never, mockSavingsService as never)
		mockExpensesService.getMonth.mockResolvedValue(makeExpenses())
		mockIncomeService.findYear.mockResolvedValue(null)
		mockSavingsService.getMonth.mockResolvedValue(makeSavings())
	})

	describe('getMonth', () => {
		it('defaults to the month of today and passes today to savings', async () => {
			const result = await service.getMonth('a', undefined, TODAY)

			expect(result.month).toBe('2026-09')
			expect(mockExpensesService.getMonth).toHaveBeenCalledWith('a', '2026-09')
			expect(mockIncomeService.findYear).toHaveBeenCalledWith('a', 2026)
			expect(mockSavingsService.getMonth).toHaveBeenCalledWith('a', '2026-09', TODAY)
		})

		it('uses the given month; January takes the income for December of the previous year', async () => {
			const result = await service.getMonth('a', '2027-01', TODAY)

			expect(result.month).toBe('2027-01')
			expect(result.income.forMonth).toBe('2026-12')
			expect(mockExpensesService.getMonth).toHaveBeenCalledWith('a', '2027-01')
			expect(mockIncomeService.findYear).toHaveBeenCalledWith('a', 2026)
			expect(mockSavingsService.getMonth).toHaveBeenCalledWith('a', '2027-01', TODAY)
		})

		it('takes the income and vacation saving of the previous month', async () => {
			mockIncomeService.findYear.mockResolvedValue(makeIncomeYear(IncomeType.self_employed, { earned: 84000, vacationSaving: 4000, vacationBalance: 7000 }))

			const october = await service.getMonth('a', '2026-10', TODAY)
			expect(october).toEqual(expect.objectContaining({ income: { type: IncomeType.self_employed, forMonth: '2026-09', amount: 84000 }, vacationSaving: 4000, vacationBalance: 7000 }))

			const september = await service.getMonth('a', '2026-09', TODAY)
			expect(september).toEqual(expect.objectContaining({ income: { type: IncomeType.self_employed, forMonth: '2026-08', amount: 0 }, vacationSaving: 0, vacationBalance: 0 }))
		})

		it('remaining = income − vacation saving − expenses (incl. advances) − savings contributions', async () => {
			mockExpensesService.getMonth.mockResolvedValue(makeExpenses({
				categories: makeCategories({ taxes: 8000, services: 1000.1, kids: 500.2 }),
				total: 9500.3,
				taxAdvances: makeAdvances({ social: 5000, health: 3000, total: 8000 }),
			}))
			mockIncomeService.findYear.mockResolvedValue(makeIncomeYear(IncomeType.self_employed, { earned: 84000, expectedInvoice: 80000, vacationSaving: 4000 }))
			mockSavingsService.getMonth.mockResolvedValue(makeSavings({ totalContribution: 1000.1, totalExpectedBalance: 5000 }))

			const result = await service.getMonth('a', '2026-10', TODAY)

			expect(result).toEqual(expect.objectContaining({
				income: { type: IncomeType.self_employed, forMonth: '2026-09', amount: 84000 },
				vacationSaving: 4000,
				advances: expect.objectContaining({ total: 8000 }),
				savings: expect.objectContaining({ totalContribution: 1000.1, totalExpectedBalance: 5000 }),
				remaining: 69499.6,
			}))
			expect(result.expenses).toEqual(expect.objectContaining({ total: 9500.3, categories: makeCategories({ taxes: 8000, services: 1000.1, kids: 500.2 }) }))
		})

		it('can go negative', async () => {
			mockExpensesService.getMonth.mockResolvedValue(makeExpenses({ total: 2500 }))

			expect((await service.getMonth('a', '2026-09', TODAY)).remaining).toBe(-2500)
		})

		it('OSVČ: income = the real invoice, a vacation withdrawal raises what is left', async () => {
			mockIncomeService.findYear.mockResolvedValue(makeIncomeYear(IncomeType.self_employed, { earned: 60000, expectedInvoice: 90000, grossSalary: 1, vacationSaving: -30000, vacationBalance: -4000 }))

			const result = await service.getMonth('a', '2026-10', TODAY)

			expect(result.income).toEqual({ type: IncomeType.self_employed, forMonth: '2026-09', amount: 60000 })
			expect(result.vacationSaving).toBe(-30000)
			expect(result.vacationBalance).toBe(-4000)
			expect(result.remaining).toBe(90000)
		})

		it('HPP: income = net salary, gross when net is missing; no vacation balance', async () => {
			mockIncomeService.findYear.mockResolvedValue(makeIncomeYear(IncomeType.employee, { grossSalary: 60000, netSalary: 45000, expectedInvoice: 1, earned: 2, vacationSaving: 1, vacationBalance: 5 }))
			const net = await service.getMonth('a', '2026-10', TODAY)
			expect(net.income).toEqual({ type: IncomeType.employee, forMonth: '2026-09', amount: 45000 })
			expect(net.vacationSaving).toBeNull()
			expect(net.vacationBalance).toBeNull()
			expect(net.remaining).toBe(45000)

			mockIncomeService.findYear.mockResolvedValue(makeIncomeYear(IncomeType.employee, { grossSalary: 60000, netSalary: null }))
			expect((await service.getMonth('a', '2026-10', TODAY)).income.amount).toBe(60000)
		})

		it('no income plan: income 0, type and vacation balance null', async () => {
			const result = await service.getMonth('a', '2026-09', TODAY)

			expect(result.income).toEqual({ type: null, forMonth: '2026-08', amount: 0 })
			expect(result.vacationSaving).toBeNull()
			expect(result.vacationBalance).toBeNull()
		})

		it('sums applied corrections and counts unconfirmed meter-linked prices', async () => {
			const utility = (priceConfirmed: boolean) => ({ priceConfirmed } as ExpensesTypes.UtilityCost)
			mockExpensesService.getMonth.mockResolvedValue(makeExpenses({
				items: [
					{ utility: null } as ExpensesTypes.MonthExpense,
					{ utility: utility(true) } as ExpensesTypes.MonthExpense,
					{ utility: utility(false) } as ExpensesTypes.MonthExpense,
				],
				corrections: [{ amount: 150.1 }, { amount: -50 }] as ExpensesTypes.MonthCorrection[],
			}))

			const result = await service.getMonth('a', '2026-09', TODAY)

			expect(result.expenses).toEqual(expect.objectContaining({ correctionsTotal: 100.1, unconfirmedPrices: 1 }))
		})

		it('propagates a missing account', async () => {
			mockExpensesService.getMonth.mockRejectedValue(new AccountsTypes.AccountNotFoundError())

			await expect(service.getMonth('a', '2026-09', TODAY)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})
	})

	describe('DB', () => {
		let db: DbProvider
		let accounts: AccountsService
		let meters: MetersService
		let expenses: ExpensesService
		let income: IncomeService
		let savings: SavingsService
		let taxes: TaxesService

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			accounts = new AccountsService(db)
			meters = new MetersService(db)
			income = new IncomeService(db, accounts)
			savings = new SavingsService(db, accounts)
			taxes = new TaxesService(db, accounts, income)
			expenses = new ExpensesService(db, accounts, meters, taxes, new PayeesService(db, accounts))
			service = new OverviewService(expenses, income, savings)
		})

		it('composes the month from all domains', async () => {
			const { guid: accountGuid } = await accounts.create('Rodina')
			// Water: 4 000 l in September × 100 Kč/m³ + 50 Kč fee = 450 Kč.
			const sheet = await meters.createSheet('Voda', UtilityType.water)
			await meters.createReading(sheet.guid, { readingDate: '2026-08-31', valueHigh: 10000 })
			await meters.createReading(sheet.guid, { readingDate: '2026-09-30', valueHigh: 14000 })
			const water = await expenses.create(accountGuid, { name: 'Voda', category: ExpenseCategory.services, amount: 0, recurrence: ExpenseRecurrence.monthly, startMonth: '2026-08', meterSheetGuid: sheet.guid })
			await expenses.setPrice(accountGuid, water.guid, '2026-09', { unitPriceHigh: 100, fixedFee: 50 })
			// Kroužky 1 000 Kč + August underpayment 150 Kč counted in September.
			const kids = await expenses.create(accountGuid, { name: 'Kroužky', category: ExpenseCategory.kids, amount: 1000, recurrence: ExpenseRecurrence.monthly, startMonth: '2026-08' })
			await expenses.createCorrection(accountGuid, kids.guid, { forMonth: '2026-08', amount: 150 })
			// OSVČ for August (paid in September): expected 80 000, earned 500 × 8 × 19 = 76 000 → 4 000 withdrawn from the vacation savings.
			await income.createYear(accountGuid, { year: 2026, type: IncomeType.self_employed })
			await income.updateMonth(accountGuid, 2026, 8, makeMonthInput({ hourlyRate: 500, workingDays: 21, vacationDays: 2, expectedInvoice: 80000 }))
			// 12 000 Kč by 2027-08 from September → 1 000 Kč/month.
			await savings.create(accountGuid, { name: 'Dovolená', currentBalance: 0, balanceDate: '2026-09-01', targetAmount: 12000, targetMonth: '2027-08' }, TODAY)
			await taxes.create(accountGuid, 2026, TODAY)
			await taxes.setAdvance(accountGuid, 2026, 9, TaxAdvanceKind.social, { amount: 5000 }, TODAY)
			await taxes.setAdvance(accountGuid, 2026, 9, TaxAdvanceKind.health, { amount: 3000 }, TODAY)

			const result = await service.getMonth(accountGuid, '2026-09', TODAY)

			expect(result.expenses).toEqual({
				categories: makeCategories({ taxes: 8000, services: 450, kids: 1150 }),
				total: 9600,
				correctionsTotal: 150,
				unconfirmedPrices: 0,
			})
			expect(result.advances).toEqual({ social: 5000, health: 3000, tax: 0, total: 8000 })
			expect(result.income).toEqual({ type: IncomeType.self_employed, forMonth: '2026-08', amount: 76000 })
			expect(result.savings).toEqual(expect.objectContaining({ totalContribution: 1000, totalExpectedBalance: 1000 }))
			expect(result.vacationSaving).toBe(-4000)
			// Jan-Jul untouched (rate 0, invoice 0) → the balance is August's only.
			expect(result.vacationBalance).toBe(-4000)
			expect(result.remaining).toBe(69400)
		})

		it('rejects a missing account', async () => {
			await expect(service.getMonth('00000000-0000-0000-0000-000000000000', '2026-09', TODAY)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})
	})
})
