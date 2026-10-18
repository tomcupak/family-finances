import { coreSchema, DbProvider, IncomeType, TaxAdvanceKind } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'

import { AccountsService } from '../accounts/accounts.service'
import { AccountsTypes } from '../accounts/accounts.types'
import { IncomeService } from '../income/income.service'
import { IncomeTypes } from '../income/income.types'
import { TaxesService } from './taxes.service'
import { TaxesTypes } from './taxes.types'

const mockAccountsService = { get: jest.fn() }
const mockIncomeService = { findYear: jest.fn() }

function makeConstants(values: Partial<TaxesTypes.Constants> = {}): TaxesTypes.Constants {
	return { ...TaxesTypes.DEFAULT_CONSTANTS, ...values }
}

function makeMonthInput(values: Partial<IncomeTypes.MonthInput> = {}): IncomeTypes.MonthInput {
	return { grossSalary: 0, netSalary: null, hourlyRate: 0, workingDays: 20, vacationDays: 0, expectedInvoice: 0, ...values }
}

describe('TaxesService', () => {
	let service: TaxesService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new TaxesService({} as never, mockAccountsService as never, mockIncomeService as never)
	})

	describe('calculate', () => {
		it('matches the modelling data (income 1 000 000, default constants) to the haléř', () => {
			expect(service['calculate'](makeConstants(), 1000000)).toEqual({
				income: 1000000,
				taxBase: 400000,
				tax: 60000,
				assessmentBase: 220000,
				social: 64240,
				health: 37716,
				taxAfterDiscounts: -31344,
				grossMonthly: 83333.33,
				net: 929388,
				netMonthly: 77449,
			})
		})

		it('applies the insurance minimums and the tax discounts only down to zero before the child discount', () => {
			const result = service['calculate'](makeConstants(), 300000)

			// base 120 000, tax 18 000, assessment base 66 000 → social 19 272 < min, health 8 910 < min
			expect(result).toEqual(expect.objectContaining({ taxBase: 120000, tax: 18000, assessmentBase: 66000, social: 57108, health: 37716 }))
			// max(18 000 − 30 840 − 24 840, 0) − 35 664
			expect(result.taxAfterDiscounts).toBe(-35664)
		})

		it('keeps a positive tax when it exceeds the discounts', () => {
			const result = service['calculate'](makeConstants({ spouseDiscount: 0, childDiscount: 0 }), 2000000)

			expect(result.tax).toBe(120000)
			expect(result.taxAfterDiscounts).toBe(120000 - 30840)
			expect(result.social).toBe(128480)
			expect(result.health).toBe(59400)
		})

		it('rounds every step to haléře', () => {
			const result = service['calculate'](makeConstants(), 123456.78)

			expect(result.taxBase).toBe(49382.71)
			expect(result.tax).toBe(7407.41)
			expect(result.grossMonthly).toBe(10288.07)
		})
	})

	describe('buildAdvances / settle', () => {
		it('fills missing advances with 0 and computes underpayment / overpayment per kind', () => {
			const advances = service['buildAdvances']([
				{ month: 1, kind: TaxAdvanceKind.social, amount: 5000 },
				{ month: 2, kind: TaxAdvanceKind.social, amount: 5000 },
				{ month: 1, kind: TaxAdvanceKind.health, amount: 40000 },
			])
			expect(advances).toHaveLength(12)
			expect(advances[0]).toEqual({ month: 1, social: 5000, health: 40000, tax: 0 })
			expect(advances[11]).toEqual({ month: 12, social: 0, health: 0, tax: 0 })

			const totals = service['sumAdvances'](advances)
			const settlement = service['settle'](service['calculate'](makeConstants(), 1000000), totals)

			expect(settlement).toEqual([
				{ kind: TaxAdvanceKind.social, computed: 64240, paid: 10000, difference: 54240 },
				{ kind: TaxAdvanceKind.health, computed: 37716, paid: 40000, difference: -2284 },
				{ kind: TaxAdvanceKind.tax, computed: -31344, paid: 0, difference: -31344 },
			])
		})
	})

	describe('canClose', () => {
		it('is true only after the last day of the year', () => {
			expect(service['canClose'](2025, '2026-01-01')).toBe(true)
			expect(service['canClose'](2025, '2025-12-31')).toBe(false)
			expect(service['canClose'](2026, '2026-10-04')).toBe(false)
		})
	})

	describe('setAdvance validation', () => {
		it('rejects a month outside 1-12 before touching the DB', async () => {
			await expect(service.setAdvance('a', 2025, 13, TaxAdvanceKind.tax, { amount: 1 })).rejects.toThrow(TaxesTypes.InvalidTaxAdvanceMonthError)
			expect(mockAccountsService.get).not.toHaveBeenCalled()
		})
	})

	describe('DB', () => {
		const TODAY = '2026-10-04'
		let db: DbProvider
		let accountGuid: string
		let incomeService: IncomeService

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			const accountsService = new AccountsService(db)
			incomeService = new IncomeService(db, accountsService)
			service = new TaxesService(db, accountsService, incomeService)
			accountGuid = (await accountsService.create('Rodina')).guid
		})

		it('creates a return with default constants and income from the income plan', async () => {
			await incomeService.createYear(accountGuid, { year: 2025, type: IncomeType.self_employed })
			await incomeService.updateMonth(accountGuid, 2025, 1, makeMonthInput({ expectedInvoice: 600000 }))
			await incomeService.updateMonth(accountGuid, 2025, 2, makeMonthInput({ expectedInvoice: 400000 }))

			const result = await service.create(accountGuid, 2025, TODAY)

			expect(result).toEqual(expect.objectContaining({ year: 2025, closedAt: null, canClose: true, plannedIncome: 1000000, incomeOverride: null, ...TaxesTypes.DEFAULT_CONSTANTS }))
			expect(result.calculation).toEqual(expect.objectContaining({ income: 1000000, net: 929388, netMonthly: 77449 }))
			expect(result.advances).toHaveLength(12)
		})

		it('uses the income override and 0 without an income plan', async () => {
			const created = await service.create(accountGuid, 2025, TODAY)
			expect(created.plannedIncome).toBeNull()
			expect(created.calculation.income).toBe(0)

			const updated = await service.update(accountGuid, 2025, { ...makeConstants(), incomeOverride: 1000000 }, TODAY)
			expect(updated.calculation.taxAfterDiscounts).toBe(-31344)
		})

		it('prefills constants from the nearest earlier return, rejects a duplicate year', async () => {
			await service.create(accountGuid, 2024, TODAY)
			await service.update(accountGuid, 2024, makeConstants({ socialMin: 60000, childDiscount: 0 }), TODAY)

			const next = await service.create(accountGuid, 2026, TODAY)

			expect(next).toEqual(expect.objectContaining({ socialMin: 60000, childDiscount: 0, healthMin: 37716 }))
			await expect(service.create(accountGuid, 2026, TODAY)).rejects.toThrow(TaxesTypes.DuplicateTaxReturnError)
			await expect(service.create(accountGuid, 1999, TODAY)).rejects.toThrow(TaxesTypes.InvalidTaxYearError)
		})

		it('throws for an unknown account / missing return', async () => {
			await expect(service.create('00000000-0000-0000-0000-000000000000', 2025, TODAY)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.get(accountGuid, 2025, TODAY)).rejects.toThrow(TaxesTypes.TaxReturnNotFoundError)
		})

		it('"sets from month" copies the advance to following months; single months can be edited afterwards', async () => {
			await service.create(accountGuid, 2025, TODAY)

			await service.setAdvance(accountGuid, 2025, 3, TaxAdvanceKind.social, { amount: 4759, applyToFollowingMonths: true }, TODAY)
			await service.setAdvance(accountGuid, 2025, 6, TaxAdvanceKind.social, { amount: 5000 }, TODAY)
			const result = await service.setAdvance(accountGuid, 2025, 10, TaxAdvanceKind.social, { amount: 5500, applyToFollowingMonths: true }, TODAY)

			expect(result.advances.map((m) => m.social)).toEqual([0, 0, 4759, 4759, 4759, 5000, 4759, 4759, 4759, 5500, 5500, 5500])
			expect(result.advances.every((m) => m.health === 0 && m.tax === 0)).toBe(true)
			expect(result.advanceTotals.social).toBe(4759 * 6 + 5000 + 5500 * 3)
			expect(await db.core.select().from(coreSchema.taxAdvance)).toHaveLength(10)

			expect(await service.getMonthAdvances(accountGuid, '2025-06')).toEqual({ social: 5000, health: 0, tax: 0, total: 5000 })
			expect(await service.getMonthAdvances(accountGuid, '2024-06')).toEqual({ social: 0, health: 0, tax: 0, total: 0 })
		})

		it('closes only a finished year; a closed year blocks the return, advances and income until reopened', async () => {
			await incomeService.createYear(accountGuid, { year: 2025, type: IncomeType.self_employed })
			await service.create(accountGuid, 2025, TODAY)
			await service.create(accountGuid, 2026, TODAY)

			await expect(service.close(accountGuid, 2026, TODAY)).rejects.toThrow(TaxesTypes.TaxYearNotFinishedError)

			const closed = await service.close(accountGuid, 2025, TODAY)
			expect(closed.closedAt).toBeInstanceOf(Date)
			await expect(service.update(accountGuid, 2025, makeConstants(), TODAY)).rejects.toThrow(TaxesTypes.TaxReturnClosedError)
			await expect(service.setAdvance(accountGuid, 2025, 1, TaxAdvanceKind.tax, { amount: 1 }, TODAY)).rejects.toThrow(TaxesTypes.TaxReturnClosedError)
			await expect(service.remove(accountGuid, 2025)).rejects.toThrow(TaxesTypes.TaxReturnClosedError)
			await expect(incomeService.updateMonth(accountGuid, 2025, 1, makeMonthInput())).rejects.toThrow(IncomeTypes.IncomeYearLockedError)
			expect((await incomeService.getYear(accountGuid, 2025)).locked).toBe(true)
			// another year of the same account stays editable
			await expect(service.setAdvance(accountGuid, 2026, 1, TaxAdvanceKind.tax, { amount: 1 }, TODAY)).resolves.toBeDefined()

			const reopened = await service.reopen(accountGuid, 2025, TODAY)
			expect(reopened.closedAt).toBeNull()
			expect((await incomeService.getYear(accountGuid, 2025)).locked).toBe(false)
			await expect(incomeService.updateMonth(accountGuid, 2025, 1, makeMonthInput())).resolves.toBeDefined()
		})

		it('lists returns newest first; removing a return / the account cascades', async () => {
			await service.create(accountGuid, 2024, TODAY)
			await service.create(accountGuid, 2025, TODAY)
			await service.setAdvance(accountGuid, 2024, 1, TaxAdvanceKind.health, { amount: 3143, applyToFollowingMonths: true }, TODAY)
			await service.setAdvance(accountGuid, 2025, 1, TaxAdvanceKind.health, { amount: 3143 }, TODAY)

			expect((await service.list(accountGuid)).map((r) => r.year)).toEqual([2025, 2024])

			await service.remove(accountGuid, 2024)
			expect(await db.core.select().from(coreSchema.taxAdvance)).toHaveLength(1)

			await new AccountsService(db).remove(accountGuid)
			expect(await db.core.select().from(coreSchema.taxReturn)).toHaveLength(0)
			expect(await db.core.select().from(coreSchema.taxAdvance)).toHaveLength(0)
		})
	})
})
