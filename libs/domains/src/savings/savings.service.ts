import { coreSchema, DbProvider } from '@family-finances/database'
import { Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { AccountsService } from '../accounts/accounts.service'
import { SavingsTypes } from './savings.types'

type GoalRow = typeof coreSchema.savingsGoal.$inferSelect

@Injectable()
export class SavingsService {
	constructor(
		private db: DbProvider,
		private accountsService: AccountsService,
	) {}

	/** Goals of the account with their plan and the expected balance at the end of the current month. */
	async list(accountGuid: string, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth[]> {
		return (await this.getMonth(accountGuid, Months.fromDate(today), today)).goals
	}

	/**
	 * Goals of the account in `month` (`YYYY-MM`): each goal's contribution paid in the month and its
	 * expected balance at the month's end, plus the sums. Plans are computed as of `today` (`YYYY-MM-DD`).
	 */
	async getMonth(accountGuid: string, month: string, today: string = Months.today()): Promise<SavingsTypes.MonthSavings> {
		await this.accountsService.get(accountGuid)
		const rows = await this.db.core.select()
			.from(coreSchema.savingsGoal)
			.where(eq(coreSchema.savingsGoal.accountGuid, accountGuid))
			.orderBy(asc(coreSchema.savingsGoal.targetMonth), asc(coreSchema.savingsGoal.name))
		const goals = rows.map((row) => this.inMonth(this.toGoal(row), month, today))
		return {
			month,
			totalContribution: this.roundMoney(goals.reduce((sum, g) => sum + g.contributionInMonth, 0)),
			totalExpectedBalance: this.roundMoney(goals.reduce((sum, g) => sum + g.expectedBalance, 0)),
			goals,
		}
	}

	async get(accountGuid: string, guid: string, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		const [row] = await this.db.core.select()
			.from(coreSchema.savingsGoal)
			.where(this.byGuid(accountGuid, guid))
		if (!row) throw new SavingsTypes.SavingsGoalNotFoundError()
		return this.inMonth(this.toGoal(row), Months.fromDate(today), today)
	}

	async create(accountGuid: string, input: SavingsTypes.GoalInput, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		const values = this.toValues(input, today)
		await this.accountsService.get(accountGuid)
		const [row] = await this.db.core.insert(coreSchema.savingsGoal)
			.values({ ...values, accountGuid })
			.returning()
		if (!row) throw new Error('Insert into savings_goal returned no row')
		return this.inMonth(this.toGoal(row), Months.fromDate(today), today)
	}

	/** A confirmed contribution is kept only while the balance and its date stay the same. */
	async update(accountGuid: string, guid: string, input: SavingsTypes.GoalInput, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		const values = this.toValues(input, today)
		const current = await this.get(accountGuid, guid, today)
		const balanceChanged = current.currentBalance !== values.currentBalance || current.balanceDate !== values.balanceDate
		return this.save(accountGuid, guid, balanceChanged ? { ...values, confirmedContribution: null } : values, today)
	}

	/** Quick balance update - sets `currentBalance` as of `balanceDate` (default today); the month's contribution is due again. */
	async updateBalance(accountGuid: string, guid: string, input: SavingsTypes.BalanceInput, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		return this.save(accountGuid, guid, { currentBalance: input.currentBalance, balanceDate: input.balanceDate || today, confirmedContribution: null }, today)
	}

	/**
	 * Confirms that the contribution of the current month was deposited as planned: `currentBalance` becomes
	 * the expected balance at the end of the month (incl. any missed earlier plan months), `balanceDate` today,
	 * and the contribution is remembered so the month still counts it and the plan continues from the next month.
	 */
	async confirmContribution(accountGuid: string, guid: string, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		const goal = await this.get(accountGuid, guid, today)
		if (goal.contributionConfirmed || goal.contributionInMonth <= 0) throw new SavingsTypes.SavingsContributionNotDueError()
		return this.save(accountGuid, guid, { currentBalance: goal.expectedBalance, balanceDate: today, confirmedContribution: goal.contributionInMonth }, today)
	}

	/** Reverts `confirmContribution` of the current month - subtracts the confirmed contribution, it is due again. */
	async revertContribution(accountGuid: string, guid: string, today: string = Months.today()): Promise<SavingsTypes.GoalInMonth> {
		const goal = await this.get(accountGuid, guid, today)
		if (!goal.contributionConfirmed || goal.confirmedContribution === null) throw new SavingsTypes.SavingsContributionNotConfirmedError()
		return this.save(accountGuid, guid, { currentBalance: this.roundMoney(goal.currentBalance - goal.confirmedContribution), confirmedContribution: null }, today)
	}

	async remove(accountGuid: string, guid: string) {
		const [row] = await this.db.core.delete(coreSchema.savingsGoal)
			.where(this.byGuid(accountGuid, guid))
			.returning()
		if (!row) throw new SavingsTypes.SavingsGoalNotFoundError()
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private async save(accountGuid: string, guid: string, values: Partial<typeof coreSchema.savingsGoal.$inferInsert>, today: string) {
		const [row] = await this.db.core.update(coreSchema.savingsGoal)
			.set(values)
			.where(this.byGuid(accountGuid, guid))
			.returning()
		if (!row) throw new SavingsTypes.SavingsGoalNotFoundError()
		return this.inMonth(this.toGoal(row), Months.fromDate(today), today)
	}

	/**
	 * The goal's contribution plan as of `today`. Contributions are paid from the month of `balanceDate`
	 * when that is the current month and its contribution isn't confirmed (the balance was just updated,
	 * this month's deposit is still due), otherwise from the month after it, up to `targetMonth` inclusive.
	 * Monthly contribution = (targetAmount − currentBalance) / number of those months, rounded up to
	 * haléře so the target is reached; 0 when already reached or no month is left.
	 */
	private planOf(goal: SavingsTypes.Goal, today: string): SavingsTypes.Plan {
		const balanceMonth = Months.fromDate(goal.balanceDate)
		const contributionStartMonth = Months.diff(Months.fromDate(today), balanceMonth) >= 0 && goal.confirmedContribution === null
			? balanceMonth
			: Months.add(balanceMonth, 1)
		const contributionMonths = Math.max(Months.diff(contributionStartMonth, goal.targetMonth) + 1, 0)
		const remaining = goal.targetAmount - goal.currentBalance
		const monthlyContribution = remaining <= 0 || contributionMonths === 0
			? 0
			// Round to 1e-6 first so float noise (e.g. 100.0000000001) doesn't bump the haléř.
			: Math.ceil(Math.round(remaining / contributionMonths * 1e6) / 1e4) / 100
		return { contributionStartMonth, contributionMonths, monthlyContribution }
	}

	/** Expected balance at the end of `month`: currentBalance + contribution × elapsed plan months, max targetAmount. */
	private expectedBalance(goal: SavingsTypes.Goal, plan: SavingsTypes.Plan, month: string): number {
		if (plan.monthlyContribution === 0) return goal.currentBalance
		const elapsed = Math.min(Math.max(Months.diff(plan.contributionStartMonth, month) + 1, 0), plan.contributionMonths)
		return this.roundMoney(Math.min(goal.currentBalance + plan.monthlyContribution * elapsed, goal.targetAmount))
	}

	private inMonth(goal: SavingsTypes.Goal, month: string, today: string): SavingsTypes.GoalInMonth {
		const plan = this.planOf(goal, today)
		const expectedBalance = this.expectedBalance(goal, plan, month)
		// The confirmed contribution is already in the balance, but it is still paid in its month.
		const contributionConfirmed = goal.confirmedContribution !== null && month === Months.fromDate(goal.balanceDate)
		// Difference to the previous month - the last plan month only tops up to the target.
		const contributionInMonth = contributionConfirmed
			? goal.confirmedContribution ?? 0
			: this.roundMoney(expectedBalance - this.expectedBalance(goal, plan, Months.add(month, -1)))
		return { ...goal, ...plan, month, contributionInMonth, expectedBalance, contributionConfirmed }
	}

	private toValues(input: SavingsTypes.GoalInput, today: string) {
		const name = input.name.trim()
		if (!name) throw new SavingsTypes.InvalidSavingsGoalNameError()
		const balanceDate = input.balanceDate || today
		if (input.targetAmount <= 0 || Months.diff(Months.fromDate(balanceDate), input.targetMonth) < 0)
			throw new SavingsTypes.InvalidSavingsGoalTargetError()
		return {
			name,
			currentBalance: input.currentBalance,
			balanceDate,
			targetAmount: input.targetAmount,
			targetMonth: Months.firstDay(input.targetMonth),
			note: input.note?.trim() || null,
		}
	}

	private toGoal(row: GoalRow): SavingsTypes.Goal {
		return { ...row, targetMonth: Months.fromDate(row.targetMonth) }
	}

	private byGuid(accountGuid: string, guid: string) {
		return and(eq(coreSchema.savingsGoal.guid, guid), eq(coreSchema.savingsGoal.accountGuid, accountGuid))
	}

	private roundMoney(value: number) {
		return Math.round(value * 100) / 100
	}
}
