import { coreSchema, DbProvider, ExpenseCategory, ExpenseRecurrence, TaxAdvanceKind, UtilityType } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'
import { eq } from 'drizzle-orm'

import { AccountsService } from '../accounts/accounts.service'
import { AccountsTypes } from '../accounts/accounts.types'
import { IncomeService } from '../income/income.service'
import { MetersService } from '../meters/meters.service'
import { MetersTypes } from '../meters/meters.types'
import { PayeesService } from '../payees/payees.service'
import { PayeesTypes } from '../payees/payees.types'
import { TaxesService } from '../taxes/taxes.service'
import { ExpensesService } from './expenses.service'
import { ExpensesTypes } from './expenses.types'

const mockDb = {
	core: {
		insert: jest.fn(),
		update: jest.fn(),
	},
}

const mockAccountsService = {
	get: jest.fn(),
}

const mockMetersService = {
	getSheet: jest.fn(),
	getMonthlyConsumption: jest.fn(),
}

const mockTaxesService = {
	getMonthAdvances: jest.fn(),
}

const mockPayeesService = {
	get: jest.fn(),
}

const SHEET = { guid: 'sheet', name: 'Dům – elektřina', utility: UtilityType.electricity }

function makePrice(overrides: Partial<ExpensesTypes.PriceValues & { month: string }> = {}) {
	return { guid: 'p', expenseGuid: 'e', month: '2026-08-01', unitPriceHigh: 6, unitPriceLow: 3, fixedFee: 200, createdAt: new Date(), ...overrides }
}

function makeConsumption(high: number, low: number | null, readingCount = 1) {
	return { high, low, total: high + (low ?? 0), readingCount }
}

function makeInput(overrides: Partial<ExpensesTypes.ExpenseInput> = {}): ExpensesTypes.ExpenseInput {
	return {
		name: 'Internet',
		category: ExpenseCategory.services,
		amount: 500,
		recurrence: ExpenseRecurrence.monthly,
		startMonth: '2026-01',
		endMonth: null,
		note: null,
		...overrides,
	}
}

function makeOccurrence(recurrence: ExpenseRecurrence, startMonth: string, endMonth: string | null = null): ExpensesTypes.Occurrence {
	return { recurrence, startMonth, endMonth }
}

describe('ExpensesService', () => {
	let service: ExpensesService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new ExpensesService(mockDb as never, mockAccountsService as never, mockMetersService as never, mockTaxesService as never, mockPayeesService as never)
	})

	describe('occursIn', () => {
		const occursIn = (occurrence: ExpensesTypes.Occurrence, month: string) => service['occursIn'](occurrence, month)

		it('once: only in the start month', () => {
			const expense = makeOccurrence(ExpenseRecurrence.once, '2026-03', '2026-03')
			expect(occursIn(expense, '2026-03')).toBe(true)
			expect(occursIn(expense, '2026-02')).toBe(false)
			expect(occursIn(expense, '2026-04')).toBe(false)
		})

		it('monthly: every month from start, indefinitely without an end', () => {
			const expense = makeOccurrence(ExpenseRecurrence.monthly, '2026-03')
			expect(occursIn(expense, '2026-02')).toBe(false)
			expect(occursIn(expense, '2026-03')).toBe(true)
			expect(occursIn(expense, '2026-04')).toBe(true)
			expect(occursIn(expense, '2035-12')).toBe(true)
		})

		it('quarterly: every 3 months from start, across year boundaries', () => {
			const expense = makeOccurrence(ExpenseRecurrence.quarterly, '2026-11')
			expect(occursIn(expense, '2026-11')).toBe(true)
			expect(occursIn(expense, '2026-12')).toBe(false)
			expect(occursIn(expense, '2027-01')).toBe(false)
			expect(occursIn(expense, '2027-02')).toBe(true)
			expect(occursIn(expense, '2027-05')).toBe(true)
		})

		it('yearly: same month every year', () => {
			const expense = makeOccurrence(ExpenseRecurrence.yearly, '2026-06')
			expect(occursIn(expense, '2026-06')).toBe(true)
			expect(occursIn(expense, '2027-06')).toBe(true)
			expect(occursIn(expense, '2027-07')).toBe(false)
			expect(occursIn(expense, '2025-06')).toBe(false)
		})

		it('ends after the end month (inclusive)', () => {
			const expense = makeOccurrence(ExpenseRecurrence.quarterly, '2026-01', '2026-07')
			expect(occursIn(expense, '2026-07')).toBe(true)
			expect(occursIn(expense, '2026-10')).toBe(false)
		})

		it('end month off the step stops after the last occurrence before it', () => {
			const expense = makeOccurrence(ExpenseRecurrence.yearly, '2026-06', '2028-05')
			expect(occursIn(expense, '2027-06')).toBe(true)
			expect(occursIn(expense, '2028-06')).toBe(false)
		})
	})

	describe('sumByCategory', () => {
		it('sums per category in display order, zeros included', () => {
			const items = [
				{ category: ExpenseCategory.car, amount: 1000.1 },
				{ category: ExpenseCategory.services, amount: 500 },
				{ category: ExpenseCategory.car, amount: 0.2 },
			] as ExpensesTypes.Expense[]

			const result = service['sumByCategory'](items)

			expect(result.categories).toEqual([
				{ category: ExpenseCategory.taxes, total: 0 },
				{ category: ExpenseCategory.services, total: 500 },
				{ category: ExpenseCategory.car, total: 1000.3 },
				{ category: ExpenseCategory.kids, total: 0 },
				{ category: ExpenseCategory.other, total: 0 },
			])
			expect(result.total).toBe(1500.3)
		})
	})

	describe('create / update validation', () => {
		it('rejects a blank name', async () => {
			await expect(service.create('acc', makeInput({ name: '  ' }))).rejects.toThrow(ExpensesTypes.InvalidExpenseNameError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
		})

		it('rejects an end month before the start month', async () => {
			await expect(service.update('acc', 'g', makeInput({ startMonth: '2026-05', endMonth: '2026-04' })))
				.rejects.toThrow(ExpensesTypes.InvalidExpenseRangeError)
			expect(mockDb.core.update).not.toHaveBeenCalled()
		})

		it('stores months as first days; a one-off expense ends in its start month', () => {
			const values = service['toValues'](makeInput({ recurrence: ExpenseRecurrence.once, startMonth: '2026-05', endMonth: '2027-01', note: '  ' }))

			expect(values).toEqual(expect.objectContaining({ startMonth: '2026-05-01', endMonth: '2026-05-01', note: null }))
		})

		it('treats an empty end month as indefinite', () => {
			const values = service['toValues'](makeInput({ endMonth: '' }))

			expect(values.endMonth).toBeNull()
		})
	})

	describe('computeUtilityAmount', () => {
		const compute = (utility: UtilityType, consumption: ExpensesTypes.ConsumptionValues, price: ExpensesTypes.PriceValues) =>
			service['computeUtilityAmount'](utility, consumption, price)

		it('electricity: VT × VT price + NT × NT price + fixed fee', () => {
			expect(compute(UtilityType.electricity, { high: 100, low: 200 }, { unitPriceHigh: 6.1234, unitPriceLow: 3.5, fixedFee: 150 }))
				.toBe(1462.34)
		})

		it('electricity: NT uses the VT price when the NT price is missing', () => {
			expect(compute(UtilityType.electricity, { high: 100, low: 50 }, { unitPriceHigh: 5, unitPriceLow: null, fixedFee: 0 })).toBe(750)
		})

		it('water: litres converted to m³', () => {
			expect(compute(UtilityType.water, { high: 4500, low: null }, { unitPriceHigh: 120.5, unitPriceLow: null, fixedFee: 50 })).toBe(592.25)
		})

		it('gas: m³ × price', () => {
			expect(compute(UtilityType.gas, { high: 12.345, low: null }, { unitPriceHigh: 30, unitPriceLow: null, fixedFee: 0 })).toBe(370.35)
		})

		it('no consumption: only the fixed fee', () => {
			expect(compute(UtilityType.electricity, { high: 0, low: 0 }, { unitPriceHigh: 6, unitPriceLow: 3, fixedFee: 199.99 })).toBe(199.99)
		})
	})

	describe('withUtilityCost', () => {
		const expense = { guid: 'e', name: 'Elektřina', amount: 0 } as ExpensesTypes.Expense

		it('without any price: amount 0, no price', () => {
			const result = service['withUtilityCost'](expense, SHEET, makeConsumption(100, 50), undefined, '2026-09')

			expect(result.amount).toBe(0)
			expect(result.utility).toEqual(expect.objectContaining({ priceMonth: null, priceConfirmed: false, unitPriceHigh: null, fixedFee: null, consumptionTotal: 150 }))
		})

		it('price from an earlier month is inherited (not confirmed)', () => {
			const result = service['withUtilityCost'](expense, SHEET, makeConsumption(100, 50), makePrice(), '2026-09')

			expect(result.amount).toBe(950)
			expect(result.utility).toEqual(expect.objectContaining({ priceMonth: '2026-08', priceConfirmed: false, unitPriceHigh: 6, unitPriceLow: 3, fixedFee: 200 }))
		})

		it('price of the month itself is confirmed', () => {
			const result = service['withUtilityCost'](expense, SHEET, makeConsumption(100, 50), makePrice({ month: '2026-09-01' }), '2026-09')

			expect(result.utility).toEqual(expect.objectContaining({ priceMonth: '2026-09', priceConfirmed: true }))
		})
	})

	describe('meter-linked expense validation', () => {
		it('stores amount 0 for a linked expense', () => {
			const values = service['toValues'](makeInput({ amount: 1234, meterSheetGuid: 'sheet' }))

			expect(values).toEqual(expect.objectContaining({ amount: 0, meterSheetGuid: 'sheet' }))
		})

		it('rejects a non-monthly linked expense', async () => {
			await expect(service.create('acc', makeInput({ recurrence: ExpenseRecurrence.quarterly, meterSheetGuid: 'sheet' })))
				.rejects.toThrow(ExpensesTypes.LinkedExpenseNotMonthlyError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
		})

		it('rejects an unknown sheet', async () => {
			mockMetersService.getSheet.mockRejectedValue(new MetersTypes.SheetNotFoundError())

			await expect(service.update('acc', 'g', makeInput({ meterSheetGuid: 'missing' }))).rejects.toThrow(MetersTypes.SheetNotFoundError)
			expect(mockDb.core.update).not.toHaveBeenCalled()
		})
	})

	describe('toCorrectionValues', () => {
		const expense = { ...makeInput({ amount: 1000, recurrence: ExpenseRecurrence.quarterly, startMonth: '2026-01' }), guid: 'e', accountGuid: 'a', endMonth: null, note: null, meterSheetGuid: null, payeeGuid: null, createdAt: new Date() }
		const toValues = (input: ExpensesTypes.CorrectionInput) => service['toCorrectionValues'](expense, input)

		it('stores the difference as is and applies it in the next month by default', async () => {
			await expect(toValues({ forMonth: '2026-10', amount: -312.5, note: ' přeplatek ' })).resolves.toEqual({
				forMonth: '2026-10-01',
				applyMonth: '2026-11-01',
				amount: -312.5,
				note: 'přeplatek',
			})
		})

		it('stores the paid amount minus the computed month amount', async () => {
			await expect(toValues({ forMonth: '2026-04', paidAmount: 1312.1 })).resolves.toEqual(expect.objectContaining({ amount: 312.1 }))
			await expect(toValues({ forMonth: '2026-04', paidAmount: 0 })).resolves.toEqual(expect.objectContaining({ amount: -1000 }))
		})

		it('accepts an explicit apply month, the same month included', async () => {
			await expect(toValues({ forMonth: '2026-04', applyMonth: '2026-04', amount: 10 })).resolves.toEqual(expect.objectContaining({ applyMonth: '2026-04-01' }))
			await expect(toValues({ forMonth: '2026-04', applyMonth: '2026-08', amount: 10 })).resolves.toEqual(expect.objectContaining({ applyMonth: '2026-08-01' }))
		})

		it('rejects an apply month before the corrected month', async () => {
			await expect(toValues({ forMonth: '2026-04', applyMonth: '2026-03', amount: 10 })).rejects.toThrow(ExpensesTypes.InvalidCorrectionRangeError)
		})

		it('requires exactly one of amount / paid amount and a non-zero difference', async () => {
			await expect(toValues({ forMonth: '2026-04' })).rejects.toThrow(ExpensesTypes.InvalidCorrectionAmountError)
			await expect(toValues({ forMonth: '2026-04', amount: null, paidAmount: null })).rejects.toThrow(ExpensesTypes.InvalidCorrectionAmountError)
			await expect(toValues({ forMonth: '2026-04', amount: 10, paidAmount: 1010 })).rejects.toThrow(ExpensesTypes.InvalidCorrectionAmountError)
			await expect(toValues({ forMonth: '2026-04', amount: 0 })).rejects.toThrow(ExpensesTypes.InvalidCorrectionAmountError)
			await expect(toValues({ forMonth: '2026-04', paidAmount: 1000 })).rejects.toThrow(ExpensesTypes.InvalidCorrectionAmountError)
		})

		it('rejects a month the expense is not paid in', async () => {
			await expect(toValues({ forMonth: '2026-05', amount: 10 })).rejects.toThrow(ExpensesTypes.ExpenseNotInMonthError)
			await expect(toValues({ forMonth: '2025-10', amount: 10 })).rejects.toThrow(ExpensesTypes.ExpenseNotInMonthError)
		})
	})

	describe('paymentsOf', () => {
		const makePayee = (guid: string, iban: string | null = null): PayeesTypes.Payee => ({
			guid, accountGuid: 'a', name: guid, bankAccount: iban, iban, variableSymbol: '42', createdAt: new Date(),
		})
		const paymentsOf = (...args: Parameters<ExpensesService['paymentsOf']>) => service['paymentsOf'](...args)

		it('groups items and corrections by payee in payee order, skipping payees with nothing in the month', () => {
			const payments = paymentsOf(
				[makePayee('landlord', 'CZ6508000000192000145399'), makePayee('idle'), makePayee('school')],
				[
					{ guid: 'rent', name: 'Nájem', amount: 15000, payeeGuid: 'landlord' },
					{ guid: 'internet', name: 'Internet', amount: 500, payeeGuid: null },
					{ guid: 'lunch', name: 'Obědy', amount: 800.5, payeeGuid: 'school' },
					{ guid: 'energy', name: 'Energie zálohy', amount: 2000, payeeGuid: 'landlord' },
				],
				[{ guid: 'c1', amount: -312.25, payeeGuid: 'landlord' }],
				[{ payeeGuid: 'school', amount: 800.5, paidAt: new Date('2026-09-05T10:00:00Z') }],
				'2026-09',
			)

			expect(payments).toEqual([
				expect.objectContaining({
					payee: expect.objectContaining({ guid: 'landlord' }),
					expenseGuids: ['rent', 'energy'],
					correctionGuids: ['c1'],
					amount: 16687.75,
					paidAmount: null,
					paidAt: null,
					spayd: 'SPD*1.0*ACC:CZ6508000000192000145399*AM:16687.75*CC:CZK*X-VS:42*MSG:09/2026 Najem, Energie zalohy',
				}),
				expect.objectContaining({
					payee: expect.objectContaining({ guid: 'school' }),
					expenseGuids: ['lunch'],
					amount: 800.5,
					paidAmount: 800.5,
					paidAt: new Date('2026-09-05T10:00:00Z'),
					spayd: null,
				}),
			])
		})

		it('has no QR payment for a non-positive amount', () => {
			const [payment] = paymentsOf(
				[makePayee('cez', 'CZ6508000000192000145399')],
				[],
				[{ guid: 'c1', amount: -500, payeeGuid: 'cez' }],
				[],
				'2026-10',
			)

			expect(payment).toEqual(expect.objectContaining({ amount: -500, spayd: null }))
		})
	})

	describe('DB', () => {
		let db: DbProvider
		let accounts: AccountsService
		let meters: MetersService
		let taxes: TaxesService
		let payees: PayeesService

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			accounts = new AccountsService(db)
			meters = new MetersService(db)
			taxes = new TaxesService(db, accounts, new IncomeService(db, accounts))
			payees = new PayeesService(db, accounts)
			service = new ExpensesService(db, accounts, meters, taxes, payees)
		})

		async function createAccount(name = 'Rodina') {
			const account = await accounts.create(name)
			if (!account) throw new Error('Account not created')
			return account.guid
		}

		it('creates and lists expenses ordered by category and name, months as YYYY-MM', async () => {
			const accountGuid = await createAccount()
			await service.create(accountGuid, makeInput({ name: 'Pojištění auta', category: ExpenseCategory.car, recurrence: ExpenseRecurrence.yearly }))
			await service.create(accountGuid, makeInput({ name: 'Internet', endMonth: '2026-12' }))
			await service.create(accountGuid, makeInput({ name: 'Elektřina' }))

			const list = await service.list(accountGuid)

			expect(list.map((e) => e.name)).toEqual(['Elektřina', 'Internet', 'Pojištění auta'])
			expect(list[1]).toEqual(expect.objectContaining({ accountGuid, startMonth: '2026-01', endMonth: '2026-12', amount: 500 }))
		})

		it('returns the expenses paid in a month with category totals', async () => {
			const accountGuid = await createAccount()
			await service.create(accountGuid, makeInput({ name: 'Internet', amount: 499.9 }))
			await service.create(accountGuid, makeInput({ name: 'Záloha daň', category: ExpenseCategory.taxes, amount: 2000, recurrence: ExpenseRecurrence.quarterly, startMonth: '2026-03' }))
			await service.create(accountGuid, makeInput({ name: 'Dálniční známka', category: ExpenseCategory.car, amount: 2440, recurrence: ExpenseRecurrence.yearly, startMonth: '2025-09' }))
			await service.create(accountGuid, makeInput({ name: 'Kroužek', category: ExpenseCategory.kids, amount: 1500, recurrence: ExpenseRecurrence.once, startMonth: '2026-09' }))
			await service.create(accountGuid, makeInput({ name: 'Starý tarif', amount: 300, endMonth: '2026-08' }))
			await service.create(accountGuid, makeInput({ name: 'Budoucí', amount: 100, startMonth: '2026-10' }))

			const september = await service.getMonth(accountGuid, '2026-09')

			expect(september.items.map((e) => e.name)).toEqual(['Záloha daň', 'Internet', 'Dálniční známka', 'Kroužek'])
			expect(september.categories).toEqual(expect.arrayContaining([
				{ category: ExpenseCategory.taxes, total: 2000 },
				{ category: ExpenseCategory.services, total: 499.9 },
				{ category: ExpenseCategory.other, total: 0 },
			]))
			expect(september.total).toBe(6439.9)

			const october = await service.getMonth(accountGuid, '2026-10')
			expect(october.items.map((e) => e.name)).toEqual(['Budoucí', 'Internet'])
		})

		it('counts the tax return advances of the month in the taxes category and total', async () => {
			const accountGuid = await createAccount()
			await service.create(accountGuid, makeInput({ name: 'Internet', amount: 500 }))
			await taxes.create(accountGuid, 2026, '2026-09-15')
			await taxes.setAdvance(accountGuid, 2026, 9, TaxAdvanceKind.social, { amount: 5000 }, '2026-09-15')
			await taxes.setAdvance(accountGuid, 2026, 9, TaxAdvanceKind.health, { amount: 3000.5 }, '2026-09-15')

			const september = await service.getMonth(accountGuid, '2026-09')

			expect(september.taxAdvances).toEqual({ social: 5000, health: 3000.5, tax: 0, total: 8000.5 })
			expect(september.categories).toEqual(expect.arrayContaining([{ category: ExpenseCategory.taxes, total: 8000.5 }]))
			expect(september.total).toBe(8500.5)
			expect((await service.getMonth(accountGuid, '2026-10')).taxAdvances.total).toBe(0)
		})

		it('updates an expense', async () => {
			const accountGuid = await createAccount()
			const created = await service.create(accountGuid, makeInput())

			const updated = await service.update(accountGuid, created.guid, makeInput({ name: 'Internet 2', amount: 600, endMonth: '2027-06', note: 'nový tarif' }))

			expect(updated).toEqual(expect.objectContaining({ guid: created.guid, name: 'Internet 2', amount: 600, endMonth: '2027-06', note: 'nový tarif' }))
			expect(await service.get(accountGuid, created.guid)).toEqual(expect.objectContaining({ amount: 600 }))
		})

		it('scopes expenses to their account', async () => {
			const rodina = await createAccount('Rodina')
			const firma = await createAccount('Firma')
			const created = await service.create(rodina, makeInput())

			await expect(service.get(firma, created.guid)).rejects.toThrow(ExpensesTypes.ExpenseNotFoundError)
			await expect(service.update(firma, created.guid, makeInput())).rejects.toThrow(ExpensesTypes.ExpenseNotFoundError)
			await expect(service.remove(firma, created.guid)).rejects.toThrow(ExpensesTypes.ExpenseNotFoundError)
			expect(await service.list(firma)).toEqual([])
		})

		it('throws AccountNotFoundError for an unknown account', async () => {
			const unknown = '00000000-0000-0000-0000-000000000000'

			await expect(service.list(unknown)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.create(unknown, makeInput())).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.getMonth(unknown, '2026-09')).rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})

		it('removes an expense', async () => {
			const accountGuid = await createAccount()
			const created = await service.create(accountGuid, makeInput())

			await service.remove(accountGuid, created.guid)

			expect(await service.list(accountGuid)).toEqual([])
		})

		it('deletes expenses together with their account (cascade)', async () => {
			const accountGuid = await createAccount()
			const created = await service.create(accountGuid, makeInput())

			await accounts.remove(accountGuid)

			await expect(service.get(accountGuid, created.guid)).rejects.toThrow(ExpensesTypes.ExpenseNotFoundError)
		})
	
		describe('meter-linked expenses', () => {
			async function setup(utility = UtilityType.electricity) {
				const accountGuid = await createAccount()
				const sheet = await meters.createSheet(`List ${utility}`, utility)
				const expense = await service.create(accountGuid, makeInput({ name: 'Energie', amount: 999, startMonth: '2026-07', meterSheetGuid: sheet.guid }))
				return { accountGuid, sheet, expense }
			}

			it('computes the month amount from consumption × inherited / confirmed price', async () => {
				const { accountGuid, sheet, expense } = await setup()
				await meters.createReading(sheet.guid, { readingDate: '2026-08-31', valueHigh: 1000, valueLow: 2000 })
				await meters.createReading(sheet.guid, { readingDate: '2026-09-30', valueHigh: 1100, valueLow: 2200 })
				await service.setPrice(accountGuid, expense.guid, '2026-08', { unitPriceHigh: 6, unitPriceLow: 3, fixedFee: 150 })
				await service.create(accountGuid, makeInput({ name: 'Internet', amount: 500 }))

				const inherited = await service.getMonth(accountGuid, '2026-09')
				const item = inherited.items.find((i) => i.guid === expense.guid)
				expect(item).toEqual(expect.objectContaining({ amount: 1350, meterSheetGuid: sheet.guid }))
				expect(item?.utility).toEqual(expect.objectContaining({ consumptionHigh: 100, consumptionLow: 200, readingCount: 1, priceMonth: '2026-08', priceConfirmed: false }))
				expect(inherited.total).toBe(1850)

				await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 7, unitPriceLow: null })
				const confirmed = await service.getMonth(accountGuid, '2026-09')
				expect(confirmed.items.find((i) => i.guid === expense.guid)).toEqual(expect.objectContaining({
					amount: 2100,
					utility: expect.objectContaining({ priceMonth: '2026-09', priceConfirmed: true, unitPriceLow: null, fixedFee: 0 }),
				}))

				const july = await service.getMonth(accountGuid, '2026-07')
				expect(july.items.find((i) => i.guid === expense.guid)).toEqual(expect.objectContaining({
					amount: 0,
					utility: expect.objectContaining({ priceMonth: null, readingCount: 0 }),
				}))
			})

			it('converts water litres to m³ and drops an NT price', async () => {
				const { accountGuid, sheet, expense } = await setup(UtilityType.water)
				await meters.createReading(sheet.guid, { readingDate: '2026-08-31', valueHigh: 10000 })
				await meters.createReading(sheet.guid, { readingDate: '2026-09-30', valueHigh: 14500 })

				const price = await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 100, unitPriceLow: 50, fixedFee: 10 })

				expect(price).toEqual(expect.objectContaining({ month: '2026-09', unitPriceLow: null }))
				const month = await service.getMonth(accountGuid, '2026-09')
				expect(month.items[0]?.amount).toBe(460)
			})

			it('upserts one price per month (unique expense + month)', async () => {
				const { accountGuid, expense } = await setup()

				await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 6 })
				await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 6.5, fixedFee: 100 })
				await service.setPrice(accountGuid, expense.guid, '2026-10', { unitPriceHigh: 7 })

				const prices = await service.listPrices(accountGuid, expense.guid)
				expect(prices.map((p) => [p.month, p.unitPriceHigh, p.fixedFee])).toEqual([['2026-10', 7, 0], ['2026-09', 6.5, 100]])
			})

			it('removes a month price; a missing one throws', async () => {
				const { accountGuid, expense } = await setup()
				await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 6 })

				await service.removePrice(accountGuid, expense.guid, '2026-09')

				expect(await service.listPrices(accountGuid, expense.guid)).toEqual([])
				await expect(service.removePrice(accountGuid, expense.guid, '2026-09')).rejects.toThrow(ExpensesTypes.UtilityPriceNotFoundError)
			})

			it('rejects prices for an expense not linked to a sheet', async () => {
				const accountGuid = await createAccount()
				const expense = await service.create(accountGuid, makeInput())

				await expect(service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 6 })).rejects.toThrow(ExpensesTypes.ExpenseNotLinkedError)
			})

			it('rejects an unknown sheet', async () => {
				const accountGuid = await createAccount()

				await expect(service.create(accountGuid, makeInput({ meterSheetGuid: '00000000-0000-0000-0000-000000000000' })))
					.rejects.toThrow(MetersTypes.SheetNotFoundError)
			})

			it('deletes prices together with their expense (cascade)', async () => {
				const { accountGuid, expense } = await setup()
				await service.setPrice(accountGuid, expense.guid, '2026-09', { unitPriceHigh: 6 })

				await service.remove(accountGuid, expense.guid)

				const rows = await db.core.select().from(coreSchema.expenseUtilityPrice)
					.where(eq(coreSchema.expenseUtilityPrice.expenseGuid, expense.guid))
				expect(rows).toEqual([])
			})

			it('unlinks the expense when its sheet is deleted (set null)', async () => {
				const { accountGuid, sheet, expense } = await setup()

				await meters.removeSheet(sheet.guid)

				expect(await service.get(accountGuid, expense.guid)).toEqual(expect.objectContaining({ meterSheetGuid: null, amount: 0 }))
				const month = await service.getMonth(accountGuid, '2026-09')
				expect(month.items[0]).toEqual(expect.objectContaining({ utility: null, amount: 0 }))
			})
		})
		describe('payments', () => {
			async function setup() {
				const accountGuid = await createAccount()
				const landlord = await payees.create(accountGuid, { name: 'Pronajímatel', bankAccount: '19-2000145399/0800', variableSymbol: '2026' })
				const rent = await service.create(accountGuid, makeInput({ name: 'Nájem', amount: 15000, payeeGuid: landlord.guid }))
				const services = await service.create(accountGuid, makeInput({ name: 'Služby', amount: 3000, recurrence: ExpenseRecurrence.quarterly, startMonth: '2026-09', payeeGuid: landlord.guid }))
				await service.create(accountGuid, makeInput({ name: 'Internet', amount: 500 }))
				return { accountGuid, landlord, rent, services }
			}

			it('groups the month\'s expenses and applied corrections of a payee into one payment', async () => {
				const { accountGuid, landlord, rent, services } = await setup()
				const correction = await service.createCorrection(accountGuid, rent.guid, { forMonth: '2026-09', amount: 200 })

				const september = await service.getMonth(accountGuid, '2026-09')
				expect(september.items.find((i) => i.guid === rent.guid)).toEqual(expect.objectContaining({ payeeGuid: landlord.guid }))
				expect(september.payments).toEqual([expect.objectContaining({
					payee: expect.objectContaining({ guid: landlord.guid, iban: 'CZ6508000000192000145399' }),
					expenseGuids: [rent.guid, services.guid],
					correctionGuids: [],
					amount: 18000,
					paidAmount: null,
					spayd: expect.stringContaining('*AM:18000.00*CC:CZK*X-VS:2026*'),
				})])

				const october = await service.getMonth(accountGuid, '2026-10')
				expect(october.corrections).toEqual([expect.objectContaining({ guid: correction.guid, payeeGuid: landlord.guid })])
				expect(october.payments).toEqual([expect.objectContaining({ expenseGuids: [rent.guid], correctionGuids: [correction.guid], amount: 15200 })])
			})

			it('marks a payment as paid with its amount, keeps it per month, unmarks it', async () => {
				const { accountGuid, landlord } = await setup()

				const mark = await service.markPaid(accountGuid, landlord.guid, '2026-09')
				expect(mark).toEqual(expect.objectContaining({ payeeGuid: landlord.guid, month: '2026-09', amount: 18000, paidAt: expect.any(Date) }))
				expect((await service.getMonth(accountGuid, '2026-09')).payments[0]).toEqual(expect.objectContaining({ paidAmount: 18000, paidAt: expect.any(Date) }))
				expect((await service.getMonth(accountGuid, '2026-10')).payments[0]).toEqual(expect.objectContaining({ paidAmount: null }))

				// Marking again refreshes the stored amount (upsert).
				await service.create(accountGuid, makeInput({ name: 'Parkování', amount: 700, startMonth: '2026-09', payeeGuid: landlord.guid }))
				expect((await service.getMonth(accountGuid, '2026-09')).payments[0]).toEqual(expect.objectContaining({ amount: 18700, paidAmount: 18000 }))
				await service.markPaid(accountGuid, landlord.guid, '2026-09')
				expect((await service.getMonth(accountGuid, '2026-09')).payments[0]).toEqual(expect.objectContaining({ paidAmount: 18700 }))

				await service.unmarkPaid(accountGuid, landlord.guid, '2026-09')
				expect((await service.getMonth(accountGuid, '2026-09')).payments[0]).toEqual(expect.objectContaining({ paidAmount: null, paidAt: null }))
				await expect(service.unmarkPaid(accountGuid, landlord.guid, '2026-09')).rejects.toThrow(ExpensesTypes.PaymentNotFoundError)
			})

			it('rejects marking a payee with nothing to pay in the month', async () => {
				const { accountGuid } = await setup()
				const idle = await payees.create(accountGuid, { name: 'Nikdo' })

				await expect(service.markPaid(accountGuid, idle.guid, '2026-09')).rejects.toThrow(ExpensesTypes.PaymentNotInMonthError)
			})

			it('rejects a payee of another account on expenses and payments', async () => {
				const { landlord } = await setup()
				const firma = await createAccount('Firma')

				await expect(service.create(firma, makeInput({ payeeGuid: landlord.guid }))).rejects.toThrow(PayeesTypes.PayeeNotFoundError)
				await expect(service.markPaid(firma, landlord.guid, '2026-09')).rejects.toThrow(PayeesTypes.PayeeNotFoundError)
			})

			it('keeps the expenses without a payee when the payee is deleted, drops its paid marks', async () => {
				const { accountGuid, landlord, rent } = await setup()
				await service.markPaid(accountGuid, landlord.guid, '2026-09')

				await payees.remove(accountGuid, landlord.guid)

				expect(await service.get(accountGuid, rent.guid)).toEqual(expect.objectContaining({ payeeGuid: null }))
				expect((await service.getMonth(accountGuid, '2026-09')).payments).toEqual([])
				expect(await db.core.select().from(coreSchema.payeePayment)).toEqual([])
			})
		})

		describe('corrections', () => {
			it('shows a correction as a separate row of its apply month, counted in the totals', async () => {
				const accountGuid = await createAccount()
				const expense = await service.create(accountGuid, makeInput({ name: 'Elektřina', amount: 2000, category: ExpenseCategory.services }))
				await service.create(accountGuid, makeInput({ name: 'Pojistka', amount: 300, category: ExpenseCategory.car }))

				const correction = await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-09', paidAmount: 2312, note: 'SPOT' })
				expect(correction).toEqual(expect.objectContaining({ forMonth: '2026-09', applyMonth: '2026-10', amount: 312, note: 'SPOT' }))

				const september = await service.getMonth(accountGuid, '2026-09')
				expect(september.corrections).toEqual([])
				expect(september.total).toBe(2300)
				expect(september.items.find((i) => i.guid === expense.guid)?.corrections).toEqual([expect.objectContaining({ guid: correction.guid, amount: 312 })])

				const october = await service.getMonth(accountGuid, '2026-10')
				expect(october.corrections).toEqual([expect.objectContaining({ guid: correction.guid, expenseName: 'Elektřina', category: ExpenseCategory.services, forMonth: '2026-09', amount: 312 })])
				expect(october.categories.find((c) => c.category === ExpenseCategory.services)?.total).toBe(2312)
				expect(october.total).toBe(2612)
				expect(october.items.find((i) => i.guid === expense.guid)?.corrections).toEqual([])
			})

			it('counts a correction even after its expense has ended', async () => {
				const accountGuid = await createAccount()
				const expense = await service.create(accountGuid, makeInput({ amount: 500, endMonth: '2026-09' }))
				await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-09', amount: -120 })

				const october = await service.getMonth(accountGuid, '2026-10')
				expect(october.items).toEqual([])
				expect(october.total).toBe(-120)
			})

			it('computes the difference against the computed amount of a meter-linked expense', async () => {
				const accountGuid = await createAccount()
				const sheet = await meters.createSheet('Dům – elektřina', UtilityType.electricity)
				const expense = await service.create(accountGuid, makeInput({ name: 'Elektřina', startMonth: '2026-08', meterSheetGuid: sheet.guid }))
				await meters.createReading(sheet.guid, { readingDate: '2026-08-31', valueHigh: 1000, valueLow: 2000 })
				await meters.createReading(sheet.guid, { readingDate: '2026-09-30', valueHigh: 1100, valueLow: 2200 })
				await service.setPrice(accountGuid, expense.guid, '2026-08', { unitPriceHigh: 6, unitPriceLow: 3, fixedFee: 150 })

				// Computed September amount: 100 × 6 + 200 × 3 + 150 = 1350.
				const correction = await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-09', paidAmount: 1200.5 })

				expect(correction.amount).toBe(-149.5)
			})

			it('lists, updates and removes corrections; scoped to the expense', async () => {
				const accountGuid = await createAccount()
				const expense = await service.create(accountGuid, makeInput())
				const other = await service.create(accountGuid, makeInput({ name: 'Jiný' }))
				const first = await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-08', amount: 10 })
				const second = await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-09', amount: 20 })

				expect((await service.listCorrections(accountGuid, expense.guid)).map((c) => c.guid)).toEqual([second.guid, first.guid])

				const updated = await service.updateCorrection(accountGuid, expense.guid, first.guid, { forMonth: '2026-08', applyMonth: '2026-12', amount: 15 })
				expect(updated).toEqual(expect.objectContaining({ applyMonth: '2026-12', amount: 15 }))

				await expect(service.updateCorrection(accountGuid, other.guid, first.guid, { forMonth: '2026-08', amount: 1 })).rejects.toThrow(ExpensesTypes.CorrectionNotFoundError)
				await expect(service.removeCorrection(accountGuid, other.guid, first.guid)).rejects.toThrow(ExpensesTypes.CorrectionNotFoundError)

				await service.removeCorrection(accountGuid, expense.guid, first.guid)
				expect((await service.listCorrections(accountGuid, expense.guid)).map((c) => c.guid)).toEqual([second.guid])
			})

			it('keeps corrections to their account', async () => {
				const rodina = await createAccount('Rodina')
				const firma = await createAccount('Firma')
				const expense = await service.create(rodina, makeInput())
				await service.createCorrection(rodina, expense.guid, { forMonth: '2026-09', amount: 50 })

				await expect(service.createCorrection(firma, expense.guid, { forMonth: '2026-09', amount: 50 })).rejects.toThrow(ExpensesTypes.ExpenseNotFoundError)
				expect((await service.getMonth(firma, '2026-10')).corrections).toEqual([])
			})

			it('deletes corrections together with their expense (cascade)', async () => {
				const accountGuid = await createAccount()
				const expense = await service.create(accountGuid, makeInput())
				await service.createCorrection(accountGuid, expense.guid, { forMonth: '2026-09', amount: 50 })

				await service.remove(accountGuid, expense.guid)

				const rows = await db.core.select().from(coreSchema.expenseCorrection)
					.where(eq(coreSchema.expenseCorrection.expenseGuid, expense.guid))
				expect(rows).toEqual([])
			})
		})
	})
})
