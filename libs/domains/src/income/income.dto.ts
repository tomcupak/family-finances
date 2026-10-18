import { IncomeType } from '@family-finances/database'
import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

import { IncomeTypes } from './income.types'

export namespace IncomeDto {
	export enum ErrorCodes {
		IncomeYearNotFound = 'income_year_not_found',
		DuplicateIncomeYear = 'duplicate_income_year',
		InvalidIncomeYear = 'invalid_income_year',
		InvalidIncomeMonth = 'invalid_income_month',
		IncomeYearLocked = 'income_year_locked',
	}

	export class IncomeYearSummary {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'integer', example: 2026 })
		declare year: number

		@ApiProperty({ enum: IncomeType, enumName: 'IncomeType' })
		declare type: IncomeType

		@ApiProperty({ type: 'number', nullable: true, description: 'CZK/h - prefills the months\' hourly rate' })
		declare defaultHourlyRate: number | null

		@ApiProperty({ type: 'number', description: 'OSVČ vacation days for the year' })
		declare vacationAllowance: number

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class IncomeMonth {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
		declare month: number

		@ApiProperty({ type: 'number', description: 'HPP - CZK' })
		declare grossSalary: number

		@ApiProperty({ type: 'number', nullable: true, description: 'HPP - CZK; null = same as gross' })
		declare netSalary: number | null

		@ApiProperty({ type: 'number', description: 'OSVČ - CZK/h' })
		declare hourlyRate: number

		@ApiProperty({ type: 'integer', description: 'OSVČ' })
		declare workingDays: number

		@ApiProperty({ type: 'number', description: 'OSVČ - may be a half day' })
		declare vacationDays: number

		@ApiProperty({ type: 'number', description: 'OSVČ - CZK' })
		declare expectedInvoice: number

		@ApiProperty({ type: 'number', description: 'OSVČ real earnings: hourlyRate × 8 × (workingDays − vacationDays)' })
		declare earned: number

		@ApiProperty({ type: 'number', description: 'OSVČ transfer to the vacation savings account in this month: earned − expectedInvoice (− = withdrawal)' })
		declare vacationSaving: number

		@ApiProperty({ type: 'number', description: 'OSVČ vacation check January..this month: Σ earned − Σ expectedInvoice. + = should be saved for vacation, − = more vacation taken than saved so far' })
		declare vacationBalance: number
	}

	export class IncomeTotals {
		@ApiProperty({ type: 'number' })
		declare grossSalary: number

		@ApiProperty({ type: 'number', description: 'Σ (netSalary ?? grossSalary)' })
		declare netSalary: number

		@ApiProperty({ type: 'number' })
		declare earned: number

		@ApiProperty({ type: 'number' })
		declare expectedInvoice: number

		@ApiProperty({ type: 'integer' })
		declare workingDays: number

		@ApiProperty({ type: 'number' })
		declare vacationDays: number
	}

	export class IncomeYear extends IncomeYearSummary {
		@ApiProperty({ type: 'boolean', description: 'Closed tax return of the year - income can\'t be changed' })
		declare locked: boolean

		@ApiProperty({ type: IncomeMonth, isArray: true, description: 'Always 12 months, January first' })
		declare months: IncomeMonth[]

		@ApiProperty({ type: IncomeTotals })
		declare totals: IncomeTotals

		@ApiProperty({ type: 'number', description: 'Vacation days still to assign to months: vacationAllowance − Σ vacationDays (negative = more assigned than the allowance)' })
		declare vacationRemaining: number
	}

	export class SaveIncomeYearSettings {
		@ApiProperty({ enum: IncomeType, enumName: 'IncomeType' })
		@IsEnum(IncomeType)
		declare type: IncomeType

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'CZK/h; changing it also updates months still having the previous default' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare defaultHourlyRate?: number | null

		@ApiProperty({ type: 'number', minimum: 0, maximum: 366, required: false, description: `OSVČ vacation days for the year (0.5 step); create: default ${IncomeTypes.DEFAULT_VACATION_ALLOWANCE}, update: omitted = unchanged` })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 1 })
		@Min(0)
		@Max(366)
		declare vacationAllowance?: number
	}

	export class CreateIncomeYear extends SaveIncomeYearSettings {
		@ApiProperty({ type: 'integer', minimum: IncomeTypes.MIN_YEAR, maximum: IncomeTypes.MAX_YEAR, example: 2026 })
		@IsInt()
		@Min(IncomeTypes.MIN_YEAR)
		@Max(IncomeTypes.MAX_YEAR)
		declare year: number
	}

	export class SaveIncomeMonth {
		@ApiProperty({ type: 'number', minimum: 0, description: 'HPP - CZK' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare grossSalary: number

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'HPP - CZK; empty = same as gross' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare netSalary?: number | null

		@ApiProperty({ type: 'number', minimum: 0, description: 'OSVČ - CZK/h' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare hourlyRate: number

		@ApiProperty({ type: 'integer', minimum: 0, maximum: 31 })
		@IsInt()
		@Min(0)
		@Max(31)
		declare workingDays: number

		@ApiProperty({ type: 'number', minimum: 0, maximum: 31, description: 'Half days allowed (0.5 step); at most workingDays' })
		@IsNumber({ maxDecimalPlaces: 1 })
		@Min(0)
		@Max(31)
		declare vacationDays: number

		@ApiProperty({ type: 'number', minimum: 0, description: 'OSVČ - CZK' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare expectedInvoice: number
	}

	export class IncomeYearNotFoundError extends Api.createErrorDto([ErrorCodes.IncomeYearNotFound]) {}
	export class DuplicateIncomeYearError extends Api.createErrorDto([ErrorCodes.DuplicateIncomeYear]) {}
	export class InvalidIncomeYearError extends Api.createErrorDto([ErrorCodes.InvalidIncomeYear]) {}
	export class InvalidIncomeMonthError extends Api.createErrorDto([ErrorCodes.InvalidIncomeMonth]) {}
	export class IncomeYearLockedError extends Api.createErrorDto([ErrorCodes.IncomeYearLocked]) {}
}
