import { TaxAdvanceKind } from '@family-finances/database'
import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

import { TaxesTypes } from './taxes.types'

export namespace TaxesDto {
	export enum ErrorCodes {
		TaxReturnNotFound = 'tax_return_not_found',
		DuplicateTaxReturn = 'duplicate_tax_return',
		InvalidTaxYear = 'invalid_tax_year',
		InvalidTaxAdvanceMonth = 'invalid_tax_advance_month',
		TaxReturnClosed = 'tax_return_closed',
		TaxYearNotFinished = 'tax_year_not_finished',
	}

	export class TaxReturnSummary {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'integer', example: 2025 })
		declare year: number

		@ApiProperty({ type: 'string', format: 'date-time', nullable: true, description: 'Set = closed: the return, its advances and the year\'s income can\'t be changed' })
		declare closedAt: Date | null
	}

	export class TaxConstants {
		@ApiProperty({ type: 'number', minimum: 0, maximum: 100, example: 60, description: '% flat-rate expenses (výdajový paušál)' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		@Max(100)
		declare expenseRatePct: number

		@ApiProperty({ type: 'number', minimum: 0, maximum: 100, example: 15, description: '% income tax' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		@Max(100)
		declare taxRatePct: number

		@ApiProperty({ type: 'number', minimum: 0, maximum: 100, example: 55, description: '% of the tax base that is the assessment base (vyměřovací základ)' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		@Max(100)
		declare assessmentBasePct: number

		@ApiProperty({ type: 'number', minimum: 0, maximum: 100, example: 29.2, description: '% social insurance' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		@Max(100)
		declare socialRatePct: number

		@ApiProperty({ type: 'number', minimum: 0, maximum: 100, example: 13.5, description: '% health insurance' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		@Max(100)
		declare healthRatePct: number

		@ApiProperty({ type: 'number', minimum: 0, example: 57108, description: 'CZK/year - minimum social insurance' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare socialMin: number

		@ApiProperty({ type: 'number', minimum: 0, example: 37716, description: 'CZK/year - minimum health insurance' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare healthMin: number

		@ApiProperty({ type: 'number', minimum: 0, example: 30840, description: 'CZK/year - basic taxpayer discount' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare basicDiscount: number

		@ApiProperty({ type: 'number', minimum: 0, example: 24840, description: 'CZK/year - spouse discount' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare spouseDiscount: number

		@ApiProperty({ type: 'number', minimum: 0, example: 35664, description: 'CZK/year - child discount, Σ for all children (may result in a tax bonus)' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare childDiscount: number
	}

	export class SaveTaxReturn extends TaxConstants {
		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'CZK; empty = Σ expectedInvoice of the year\'s income plan' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare incomeOverride?: number | null
	}

	export class CreateTaxReturn {
		@ApiProperty({ type: 'integer', minimum: TaxesTypes.MIN_YEAR, maximum: TaxesTypes.MAX_YEAR, example: 2026 })
		@IsInt()
		@Min(TaxesTypes.MIN_YEAR)
		@Max(TaxesTypes.MAX_YEAR)
		declare year: number
	}

	export class SetTaxAdvance {
		@ApiProperty({ type: 'number', minimum: 0, description: 'CZK' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare amount: number

		@ApiProperty({ type: 'boolean', required: false, description: '"Nastavit od měsíce" - also copy the amount to all following months of the year' })
		@IsOptional()
		@IsBoolean()
		declare applyToFollowingMonths?: boolean
	}

	export class TaxCalculation {
		@ApiProperty({ type: 'number', description: 'incomeOverride ?? Σ expectedInvoice of the year' })
		declare income: number

		@ApiProperty({ type: 'number', description: 'income × (1 − expenseRatePct)' })
		declare taxBase: number

		@ApiProperty({ type: 'number', description: 'taxBase × taxRatePct' })
		declare tax: number

		@ApiProperty({ type: 'number', description: 'taxBase × assessmentBasePct' })
		declare assessmentBase: number

		@ApiProperty({ type: 'number', description: 'max(assessmentBase × socialRatePct, socialMin)' })
		declare social: number

		@ApiProperty({ type: 'number', description: 'max(assessmentBase × healthRatePct, healthMin)' })
		declare health: number

		@ApiProperty({ type: 'number', description: 'max(tax − basic − spouse, 0) − child; negative = tax bonus' })
		declare taxAfterDiscounts: number

		@ApiProperty({ type: 'number', description: 'income / 12' })
		declare grossMonthly: number

		@ApiProperty({ type: 'number', description: 'income − social − health − taxAfterDiscounts' })
		declare net: number

		@ApiProperty({ type: 'number', description: 'net / 12' })
		declare netMonthly: number
	}

	export class TaxAdvanceMonth {
		@ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
		declare month: number

		@ApiProperty({ type: 'number' })
		declare social: number

		@ApiProperty({ type: 'number' })
		declare health: number

		@ApiProperty({ type: 'number' })
		declare tax: number
	}

	export class TaxAdvanceSums {
		@ApiProperty({ type: 'number' })
		declare social: number

		@ApiProperty({ type: 'number' })
		declare health: number

		@ApiProperty({ type: 'number' })
		declare tax: number
	}

	/** Advances paid in one month (`TaxesService.getMonthAdvances`). */
	export class MonthAdvances extends TaxAdvanceSums {
		@ApiProperty({ type: 'number', description: 'social + health + tax' })
		declare total: number
	}

	export class TaxSettlement {
		@ApiProperty({ enum: TaxAdvanceKind, enumName: 'TaxAdvanceKind' })
		declare kind: TaxAdvanceKind

		@ApiProperty({ type: 'number', description: 'From the calculation (social / health / taxAfterDiscounts)' })
		declare computed: number

		@ApiProperty({ type: 'number', description: 'Σ advances of the year' })
		declare paid: number

		@ApiProperty({ type: 'number', description: 'computed − paid: + = underpayment (doplatek), − = overpayment (přeplatek)' })
		declare difference: number
	}

	export class TaxReturn extends TaxConstants {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'integer', example: 2025 })
		declare year: number

		@ApiProperty({ type: 'string', format: 'date-time', nullable: true, description: 'Set = closed: the return, its advances and the year\'s income can\'t be changed' })
		declare closedAt: Date | null

		@ApiProperty({ type: 'number', nullable: true, description: 'CZK; null = income from the income plan' })
		declare incomeOverride: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'Σ expectedInvoice of the year\'s income plan; null = no income plan for the year' })
		declare plannedIncome: number | null

		@ApiProperty({ type: 'boolean', description: 'The whole year is in the past - the return can be closed' })
		declare canClose: boolean

		@ApiProperty({ type: TaxCalculation })
		declare calculation: TaxCalculation

		@ApiProperty({ type: TaxAdvanceMonth, isArray: true, description: 'Always 12 months, January first; a missing advance is 0' })
		declare advances: TaxAdvanceMonth[]

		@ApiProperty({ type: TaxAdvanceSums })
		declare advanceTotals: TaxAdvanceSums

		@ApiProperty({ type: TaxSettlement, isArray: true, description: 'social, health, tax' })
		declare settlement: TaxSettlement[]

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class TaxReturnNotFoundError extends Api.createErrorDto([ErrorCodes.TaxReturnNotFound]) {}
	export class DuplicateTaxReturnError extends Api.createErrorDto([ErrorCodes.DuplicateTaxReturn]) {}
	export class InvalidTaxYearError extends Api.createErrorDto([ErrorCodes.InvalidTaxYear]) {}
	export class InvalidTaxAdvanceMonthError extends Api.createErrorDto([ErrorCodes.InvalidTaxAdvanceMonth]) {}
	export class TaxReturnClosedError extends Api.createErrorDto([ErrorCodes.TaxReturnClosed]) {}
	export class TaxYearNotFinishedError extends Api.createErrorDto([ErrorCodes.TaxYearNotFinished]) {}
}
