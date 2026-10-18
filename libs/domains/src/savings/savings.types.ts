export namespace SavingsTypes {
	export class SavingsGoalNotFoundError extends Error { public code = 'savings_goal_not_found' }
	export class InvalidSavingsGoalNameError extends Error { public code = 'invalid_savings_goal_name' }
	/** `targetAmount` not positive, or `targetMonth` before the month of `balanceDate`. */
	export class InvalidSavingsGoalTargetError extends Error { public code = 'invalid_savings_goal_target' }
	/** Nothing to confirm this month: no contribution is due, or it is already confirmed. */
	export class SavingsContributionNotDueError extends Error { public code = 'savings_contribution_not_due' }
	/** Reverting a confirmation that wasn't made this month. */
	export class SavingsContributionNotConfirmedError extends Error { public code = 'savings_contribution_not_confirmed' }

	export interface GoalInput {
		name: string
		/** CZK saved as of `balanceDate`. */
		currentBalance: number
		/** `YYYY-MM-DD`; default today. */
		balanceDate?: string | null
		targetAmount: number
		/** `YYYY-MM` - the goal is reached by the end of this month. */
		targetMonth: string
		note?: string | null
	}

	export interface BalanceInput {
		currentBalance: number
		/** `YYYY-MM-DD`; default today. */
		balanceDate?: string | null
	}

	export interface Goal {
		guid: string
		accountGuid: string
		name: string
		currentBalance: number
		/** `YYYY-MM-DD` */
		balanceDate: string
		targetAmount: number
		/** `YYYY-MM` */
		targetMonth: string
		note: string | null
		/** Contribution of the `balanceDate` month confirmed as deposited (already in `currentBalance`); `null` = still due. */
		confirmedContribution: number | null
		createdAt: Date
	}

	/** The contribution plan of a goal as of a day (`today`) - see `SavingsService.planOf`. */
	export interface Plan {
		/** First month a contribution is paid in (`YYYY-MM`). */
		contributionStartMonth: string
		/** Number of contribution months from `contributionStartMonth` to `targetMonth` inclusive (0 = none left). */
		contributionMonths: number
		/** CZK per month, rounded up to haléře (0 when reached or no months left). */
		monthlyContribution: number
	}

	export interface GoalInMonth extends Goal, Plan {
		/** `YYYY-MM` the following two values are for. */
		month: string
		/** CZK actually contributed in the month (0 outside the plan; the last month may be smaller due to rounding). */
		contributionInMonth: number
		/** Expected balance at the end of the month (capped at `targetAmount`). */
		expectedBalance: number
		/** The month's contribution was confirmed as deposited (`confirmContribution`). */
		contributionConfirmed: boolean
	}

	export interface MonthSavings {
		month: string
		/** Σ `contributionInMonth` of all goals. */
		totalContribution: number
		/** Σ `expectedBalance` of all goals. */
		totalExpectedBalance: number
		goals: GoalInMonth[]
	}
}
