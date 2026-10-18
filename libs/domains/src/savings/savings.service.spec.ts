import { coreSchema, DbProvider } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'
import { eq } from 'drizzle-orm'

import { AccountsService } from '../accounts/accounts.service'
import { AccountsTypes } from '../accounts/accounts.types'
import { SavingsService } from './savings.service'
import { SavingsTypes } from './savings.types'

const mockAccountsService = { get: jest.fn() }

function makeGoal(values: Partial<SavingsTypes.Goal> = {}): SavingsTypes.Goal {
	return {
		guid: 'g',
		accountGuid: 'a',
		name: 'Dovolená',
		currentBalance: 10000,
		balanceDate: '2026-10-04',
		targetAmount: 70000,
		targetMonth: '2027-03',
		note: null,
		confirmedContribution: null,
		createdAt: new Date(),
		...values,
	}
}

function makeInput(values: Partial<SavingsTypes.GoalInput> = {}): SavingsTypes.GoalInput {
	return { name: 'Dovolená', currentBalance: 10000, balanceDate: '2026-10-04', targetAmount: 70000, targetMonth: '2027-03', ...values }
}

describe('SavingsService', () => {
	let service: SavingsService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new SavingsService({} as never, mockAccountsService as never)
	})

	describe('planOf', () => {
		it('includes the balance month when the balance is from the current month', () => {
			// Oct–Mar = 6 months, (70 000 − 10 000) / 6
			expect(service['planOf'](makeGoal(), '2026-10-20')).toEqual({
				contributionStartMonth: '2026-10',
				contributionMonths: 6,
				monthlyContribution: 10000,
			})
		})

		it('starts the month after an older balance', () => {
			// balance from September → Oct–Mar = 6 months
			expect(service['planOf'](makeGoal({ balanceDate: '2026-09-30' }), '2026-10-04')).toEqual({
				contributionStartMonth: '2026-10',
				contributionMonths: 6,
				monthlyContribution: 10000,
			})
			// balance from June, today October → Jul–Mar = 9 months
			expect(service['planOf'](makeGoal({ balanceDate: '2026-06-15', currentBalance: 25000 }), '2026-10-04')).toEqual({
				contributionStartMonth: '2026-07',
				contributionMonths: 9,
				monthlyContribution: 5000,
			})
		})

		it('rounds the contribution up to haléře', () => {
			const plan = service['planOf'](makeGoal({ currentBalance: 0, targetAmount: 100, targetMonth: '2026-12' }), '2026-10-04')
			expect(plan.monthlyContribution).toBe(33.34)
			// exact division is not bumped by float noise
			expect(service['planOf'](makeGoal({ currentBalance: 0, targetAmount: 0.3, targetMonth: '2026-12' }), '2026-10-04').monthlyContribution).toBe(0.1)
		})

		it('starts the month after a confirmed contribution of the current month', () => {
			// confirmed in October → Nov–Mar = 5 months, (70 000 − 20 000) / 5
			expect(service['planOf'](makeGoal({ currentBalance: 20000, balanceDate: '2026-10-18', confirmedContribution: 10000 }), '2026-10-20')).toEqual({
				contributionStartMonth: '2026-11',
				contributionMonths: 5,
				monthlyContribution: 10000,
			})
		})

		it('is 0 when the target is reached or no month is left', () => {
			expect(service['planOf'](makeGoal({ currentBalance: 70000 }), '2026-10-04').monthlyContribution).toBe(0)
			expect(service['planOf'](makeGoal({ currentBalance: 80000 }), '2026-10-04').monthlyContribution).toBe(0)
			// balance from March, target March, today April → start April, nothing left
			const plan = service['planOf'](makeGoal({ balanceDate: '2027-03-10' }), '2027-04-01')
			expect(plan).toEqual({ contributionStartMonth: '2027-04', contributionMonths: 0, monthlyContribution: 0 })
		})
	})

	describe('inMonth', () => {
		it('accumulates contributions up to the month, capped at the target', () => {
			const goal = makeGoal()
			const at = (month: string) => service['inMonth'](goal, month, '2026-10-04')

			expect(at('2026-09')).toEqual(expect.objectContaining({ contributionInMonth: 0, expectedBalance: 10000 }))
			expect(at('2026-10')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 20000 }))
			expect(at('2026-12')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 40000 }))
			expect(at('2027-03')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 70000 }))
			expect(at('2027-04')).toEqual(expect.objectContaining({ contributionInMonth: 0, expectedBalance: 70000 }))
		})

		it('tops up only the remainder in the last month after rounding up', () => {
			const goal = makeGoal({ currentBalance: 0, targetAmount: 100, targetMonth: '2026-12' })
			const months = ['2026-10', '2026-11', '2026-12'].map((m) => service['inMonth'](goal, m, '2026-10-04'))

			expect(months.map((m) => m.contributionInMonth)).toEqual([33.34, 33.34, 33.32])
			expect(months.map((m) => m.expectedBalance)).toEqual([33.34, 66.68, 100])
		})

		it('still pays a confirmed contribution in its month, the balance already includes it', () => {
			const goal = makeGoal({ currentBalance: 20000, balanceDate: '2026-10-18', confirmedContribution: 10000 })
			const at = (month: string) => service['inMonth'](goal, month, '2026-10-20')

			expect(at('2026-10')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 20000, contributionConfirmed: true }))
			expect(at('2026-11')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 30000, contributionConfirmed: false }))
			// a month later the plan is unchanged
			expect(service['inMonth'](goal, '2026-11', '2026-11-02')).toEqual(expect.objectContaining({ contributionInMonth: 10000, expectedBalance: 30000 }))
		})

		it('keeps a balance above the target as is', () => {
			const result = service['inMonth'](makeGoal({ currentBalance: 80000 }), '2026-12', '2026-10-04')
			expect(result).toEqual(expect.objectContaining({ monthlyContribution: 0, contributionInMonth: 0, expectedBalance: 80000 }))
		})
	})

	describe('toValues', () => {
		it('rejects a blank name', () => {
			expect(() => service['toValues'](makeInput({ name: '  ' }), '2026-10-04')).toThrow(SavingsTypes.InvalidSavingsGoalNameError)
		})

		it('rejects a non-positive target and a target month before the balance month', () => {
			expect(() => service['toValues'](makeInput({ targetAmount: 0 }), '2026-10-04')).toThrow(SavingsTypes.InvalidSavingsGoalTargetError)
			expect(() => service['toValues'](makeInput({ targetMonth: '2026-09' }), '2026-10-04')).toThrow(SavingsTypes.InvalidSavingsGoalTargetError)
		})

		it('defaults balanceDate to today and stores the target month as its first day', () => {
			expect(service['toValues'](makeInput({ balanceDate: null, note: '  ' }), '2026-10-04')).toEqual(expect.objectContaining({
				balanceDate: '2026-10-04',
				targetMonth: '2027-03-01',
				note: null,
			}))
		})
	})

	describe('DB', () => {
		let db: DbProvider
		let accountsService: AccountsService

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			accountsService = new AccountsService(db)
			service = new SavingsService(db, accountsService)
		})

		async function createAccount(name = 'Rodina') {
			const account = await accountsService.create(name)
			if (!account) throw new Error('Account not created')
			return account
		}

		it('creates goals and sums the month', async () => {
			const account = await createAccount()
			await service.create(account.guid, makeInput(), '2026-10-04')
			await service.create(account.guid, makeInput({ name: 'Auto', currentBalance: 0, targetAmount: 1200, targetMonth: '2026-12' }), '2026-10-04')

			const month = await service.getMonth(account.guid, '2026-11', '2026-10-04')

			expect(month.goals.map((g) => g.name)).toEqual(['Auto', 'Dovolená'])
			expect(month.totalContribution).toBe(10400)
			expect(month.totalExpectedBalance).toBe(30000 + 800)
		})

		it('lists goals as of the current month', async () => {
			const account = await createAccount()
			await service.create(account.guid, makeInput(), '2026-10-04')

			const [goal] = await service.list(account.guid, '2026-10-04')

			expect(goal).toEqual(expect.objectContaining({ month: '2026-10', monthlyContribution: 10000, expectedBalance: 20000, targetMonth: '2027-03' }))
		})

		it('updates the balance with today as the balance date', async () => {
			const account = await createAccount()
			const goal = await service.create(account.guid, makeInput({ balanceDate: '2026-08-01' }), '2026-10-04')

			const updated = await service.updateBalance(account.guid, goal.guid, { currentBalance: 40000 }, '2026-10-04')

			expect(updated).toEqual(expect.objectContaining({ currentBalance: 40000, balanceDate: '2026-10-04', monthlyContribution: 5000 }))
		})

		it('confirms the month\'s contribution: planned balance as of today, the month still pays it', async () => {
			const account = await createAccount()
			// balance from August → Sep–Mar = 7 × 10 000, Sep + Oct planned = 30 000 at the end of October
			const goal = await service.create(account.guid, makeInput({ balanceDate: '2026-08-31', targetAmount: 80000 }), '2026-08-31')

			const confirmed = await service.confirmContribution(account.guid, goal.guid, '2026-10-18')

			expect(confirmed).toEqual(expect.objectContaining({
				currentBalance: 30000, balanceDate: '2026-10-18', confirmedContribution: 10000,
				contributionConfirmed: true, contributionInMonth: 10000, expectedBalance: 30000, monthlyContribution: 10000, contributionStartMonth: '2026-11',
			}))
			expect((await service.getMonth(account.guid, '2026-10', '2026-10-18')).totalContribution).toBe(10000)
			await expect(service.confirmContribution(account.guid, goal.guid, '2026-10-19')).rejects.toThrow(SavingsTypes.SavingsContributionNotDueError)
		})

		it('reverts a confirmation - the contribution is due again', async () => {
			const account = await createAccount()
			const goal = await service.create(account.guid, makeInput({ balanceDate: '2026-09-30' }), '2026-09-30')
			await expect(service.revertContribution(account.guid, goal.guid, '2026-10-18')).rejects.toThrow(SavingsTypes.SavingsContributionNotConfirmedError)
			await service.confirmContribution(account.guid, goal.guid, '2026-10-18')

			const reverted = await service.revertContribution(account.guid, goal.guid, '2026-10-18')

			expect(reverted).toEqual(expect.objectContaining({ currentBalance: 10000, confirmedContribution: null, contributionConfirmed: false, contributionInMonth: 10000, expectedBalance: 20000 }))
		})

		it('rejects confirming a goal with nothing due', async () => {
			const account = await createAccount()
			const goal = await service.create(account.guid, makeInput({ currentBalance: 70000 }), '2026-10-04')

			await expect(service.confirmContribution(account.guid, goal.guid, '2026-10-18')).rejects.toThrow(SavingsTypes.SavingsContributionNotDueError)
		})

		it('drops the confirmation when the balance is changed, keeps it on other edits', async () => {
			const account = await createAccount()
			const goal = await service.create(account.guid, makeInput({ balanceDate: '2026-09-30' }), '2026-09-30')
			const confirmed = await service.confirmContribution(account.guid, goal.guid, '2026-10-18')

			const renamed = await service.update(account.guid, goal.guid, makeInput({ name: 'Moře', currentBalance: confirmed.currentBalance, balanceDate: confirmed.balanceDate }), '2026-10-18')
			expect(renamed).toEqual(expect.objectContaining({ name: 'Moře', confirmedContribution: 10000 }))

			const rebalanced = await service.updateBalance(account.guid, goal.guid, { currentBalance: 25000 }, '2026-10-18')
			expect(rebalanced).toEqual(expect.objectContaining({ confirmedContribution: null, contributionConfirmed: false }))
		})

		it('does not find a goal through another account', async () => {
			const account = await createAccount()
			const other = await createAccount('Firma')
			const goal = await service.create(account.guid, makeInput(), '2026-10-04')

			await expect(service.get(other.guid, goal.guid)).rejects.toThrow(SavingsTypes.SavingsGoalNotFoundError)
			await expect(service.updateBalance(other.guid, goal.guid, { currentBalance: 1 })).rejects.toThrow(SavingsTypes.SavingsGoalNotFoundError)
			await expect(service.remove(other.guid, goal.guid)).rejects.toThrow(SavingsTypes.SavingsGoalNotFoundError)
		})

		it('rejects an unknown account', async () => {
			const unknown = '00000000-0000-0000-0000-000000000000'
			await expect(service.create(unknown, makeInput(), '2026-10-04')).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.getMonth(unknown, '2026-10')).rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})

		it('deletes goals with their account', async () => {
			const account = await createAccount()
			await service.create(account.guid, makeInput(), '2026-10-04')

			await accountsService.remove(account.guid)

			expect(await db.core.select().from(coreSchema.savingsGoal).where(eq(coreSchema.savingsGoal.accountGuid, account.guid))).toEqual([])
		})
	})
})
