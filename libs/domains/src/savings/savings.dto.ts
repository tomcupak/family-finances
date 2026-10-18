import { Api, Months } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

export namespace SavingsDto {
	export enum ErrorCodes {
		SavingsGoalNotFound = 'savings_goal_not_found',
		InvalidSavingsGoalName = 'invalid_savings_goal_name',
		InvalidSavingsGoalTarget = 'invalid_savings_goal_target',
		SavingsContributionNotDue = 'savings_contribution_not_due',
		SavingsContributionNotConfirmed = 'savings_contribution_not_confirmed',
	}

	export class SavingsGoal {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'string' })
		declare name: string

		@ApiProperty({ type: 'number', description: 'CZK saved as of `balanceDate`' })
		declare currentBalance: number

		@ApiProperty({ type: 'string', format: 'date', example: '2026-10-04' })
		declare balanceDate: string

		@ApiProperty({ type: 'number', description: 'CZK' })
		declare targetAmount: number

		@ApiProperty({ type: 'string', example: '2027-06', description: 'YYYY-MM - reached by the end of this month' })
		declare targetMonth: string

		@ApiProperty({ type: 'string', nullable: true })
		declare note: string | null

		@ApiProperty({ type: 'number', nullable: true, description: 'Contribution of the balanceDate month confirmed as deposited (already in currentBalance); null = still due' })
		declare confirmedContribution: number | null

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date

		@ApiProperty({ type: 'string', example: '2026-10', description: 'YYYY-MM - first month a contribution is paid in (balance month if it is the current month, else the next one)' })
		declare contributionStartMonth: string

		@ApiProperty({ type: 'integer', description: 'Contribution months from `contributionStartMonth` to `targetMonth` inclusive' })
		declare contributionMonths: number

		@ApiProperty({ type: 'number', description: 'CZK per month = (target − balance) / contributionMonths, rounded up; 0 when reached / no month left' })
		declare monthlyContribution: number

		@ApiProperty({ type: 'string', example: '2026-10', description: 'YYYY-MM the two values below are for' })
		declare month: string

		@ApiProperty({ type: 'number', description: 'CZK contributed in `month` (0 outside the plan)' })
		declare contributionInMonth: number

		@ApiProperty({ type: 'number', description: 'Expected balance at the end of `month` (max targetAmount)' })
		declare expectedBalance: number

		@ApiProperty({ type: 'boolean', description: 'The contribution of `month` was confirmed as deposited' })
		declare contributionConfirmed: boolean
	}

	export class MonthSavings {
		@ApiProperty({ type: 'string', example: '2026-10' })
		declare month: string

		@ApiProperty({ type: 'number', description: 'Σ contributionInMonth' })
		declare totalContribution: number

		@ApiProperty({ type: 'number', description: 'Σ expectedBalance' })
		declare totalExpectedBalance: number

		@ApiProperty({ type: SavingsGoal, isArray: true })
		declare goals: SavingsGoal[]
	}

	export class SaveSavingsGoal {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string

		@ApiProperty({ type: 'number', minimum: 0, description: 'CZK saved as of `balanceDate`' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare currentBalance: number

		@ApiProperty({ type: 'string', format: 'date', required: false, nullable: true, description: 'YYYY-MM-DD; empty = today' })
		@IsOptional()
		@IsDateString({ strict: true })
		declare balanceDate?: string | null

		@ApiProperty({ type: 'number', minimum: 0.01, description: 'CZK' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare targetAmount: number

		@ApiProperty({ type: 'string', example: '2027-06', description: 'YYYY-MM, not before the balance month' })
		@Matches(Months.PATTERN)
		declare targetMonth: string

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null
	}

	export class UpdateSavingsBalance {
		@ApiProperty({ type: 'number', minimum: 0, description: 'CZK' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare currentBalance: number

		@ApiProperty({ type: 'string', format: 'date', required: false, nullable: true, description: 'YYYY-MM-DD; empty = today' })
		@IsOptional()
		@IsDateString({ strict: true })
		declare balanceDate?: string | null
	}

	export class SavingsGoalNotFoundError extends Api.createErrorDto([ErrorCodes.SavingsGoalNotFound]) {}
	export class InvalidSavingsGoalError extends Api.createErrorDto([ErrorCodes.InvalidSavingsGoalName, ErrorCodes.InvalidSavingsGoalTarget]) {}
	export class SavingsContributionNotDueError extends Api.createErrorDto([ErrorCodes.SavingsContributionNotDue]) {}
	export class SavingsContributionNotConfirmedError extends Api.createErrorDto([ErrorCodes.SavingsContributionNotConfirmed]) {}
}
