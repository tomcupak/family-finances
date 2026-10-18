import { MeterEntryMode, UtilityType } from '@family-finances/database'
import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { ArrayMinSize, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator'

import { MetersTypes } from './meters.types'

export namespace MetersDto {
	export enum ErrorCodes {
		SheetNotFound = 'sheet_not_found',
		DuplicateSheetName = 'duplicate_sheet_name',
		InvalidSheetName = 'invalid_sheet_name',
		ReadingNotFound = 'reading_not_found',
		DuplicateReadingDate = 'duplicate_reading_date',
		InvalidReadingValues = 'invalid_reading_values',
	}

	// ── Sheets ────────────────────────────────────────────────────────────────

	export class MeterSheet {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string' })
		declare name: string

		@ApiProperty({ enum: UtilityType, enumName: 'UtilityType' })
		declare utility: UtilityType

		@ApiProperty({ enum: MeterEntryMode, enumName: 'MeterEntryMode', description: 'state = readings are meter states, increment = readings are the consumption itself' })
		declare entryMode: MeterEntryMode

		@ApiProperty({ type: 'boolean' })
		declare archived: boolean

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date

		@ApiProperty({ type: 'string', format: 'date', nullable: true })
		declare lastReadingDate: string | null

		@ApiProperty({ type: 'number', nullable: true, description: 'VT (electricity) / the only state (water, gas); the consumption for an increment sheet' })
		declare lastValueHigh: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'NT - electricity only' })
		declare lastValueLow: number | null
	}

	export class ListSheetsQuery {
		@ApiProperty({ type: 'boolean', required: false, default: false })
		@IsOptional()
		@Transform(({ value }) => value === true || value === 'true')
		@IsBoolean()
		declare includeArchived?: boolean
	}

	export class CreateSheet {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string

		@ApiProperty({ enum: UtilityType, enumName: 'UtilityType' })
		@IsEnum(UtilityType)
		declare utility: UtilityType

		@ApiProperty({ enum: MeterEntryMode, enumName: 'MeterEntryMode', required: false, default: MeterEntryMode.state, description: 'Fixed after creation' })
		@IsOptional()
		@IsEnum(MeterEntryMode)
		declare entryMode?: MeterEntryMode
	}

	export class UpdateSheet {
		@ApiProperty({ type: 'string', maxLength: 100, required: false })
		@IsOptional()
		@IsString()
		@MaxLength(100)
		declare name?: string

		@ApiProperty({ type: 'boolean', required: false })
		@IsOptional()
		@IsBoolean()
		declare archived?: boolean
	}

	// ── Readings ──────────────────────────────────────────────────────────────

	export class MeterReading {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare sheetGuid: string

		@ApiProperty({ type: 'string', format: 'date' })
		declare readingDate: string

		@ApiProperty({ type: 'number', description: 'VT (electricity) / the only state (water, gas); the consumption for an increment sheet' })
		declare valueHigh: number

		@ApiProperty({ type: 'number', nullable: true, description: 'NT - electricity only' })
		declare valueLow: number | null

		@ApiProperty({ type: 'string', nullable: true })
		declare note: string | null

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class MeterReadingWithDiff extends MeterReading {
		@ApiProperty({ type: 'number', nullable: true, description: 'Consumption since the previous reading (VT / single state); null for the first reading of a state sheet, the value itself for an increment sheet' })
		declare diffHigh: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'NT consumption since the previous reading - electricity only' })
		declare diffLow: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'diffHigh + diffLow' })
		declare diffTotal: number | null
	}

	export class CreateReading {
		@ApiProperty({ type: 'string', format: 'date' })
		@IsDateString({ strict: true })
		declare readingDate: string

		@ApiProperty({ type: 'number', minimum: 0, description: 'VT (electricity) / the only state (water, gas)' })
		@IsNumber()
		@Min(0)
		declare valueHigh: number

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'NT - required for electricity, must be empty otherwise' })
		@IsOptional()
		@IsNumber()
		@Min(0)
		declare valueLow?: number | null

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null
	}

	export class BulkReadingEntry {
		@ApiProperty({ type: 'string', format: 'uuid' })
		@IsUUID()
		declare sheetGuid: string

		@ApiProperty({ type: 'number', minimum: 0 })
		@IsNumber()
		@Min(0)
		declare valueHigh: number

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true })
		@IsOptional()
		@IsNumber()
		@Min(0)
		declare valueLow?: number | null

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null
	}

	export class CreateReadingsBulk {
		@ApiProperty({ type: 'string', format: 'date' })
		@IsDateString({ strict: true })
		declare readingDate: string

		@ApiProperty({ type: BulkReadingEntry, isArray: true })
		@ValidateNested({ each: true })
		@Type(() => BulkReadingEntry)
		@ArrayMinSize(1)
		declare entries: BulkReadingEntry[]
	}

	// ── Consumption ───────────────────────────────────────────────────────────

	export class ConsumptionQuery {
		@ApiProperty({ type: 'string', format: 'date' })
		@IsDateString({ strict: true })
		declare from: string

		@ApiProperty({ type: 'string', format: 'date' })
		@IsDateString({ strict: true })
		declare to: string

		@ApiProperty({ enum: MetersTypes.IntervalUnit, enumName: 'ConsumptionInterval', required: false, default: MetersTypes.IntervalUnit.month })
		@IsOptional()
		@IsEnum(MetersTypes.IntervalUnit)
		declare interval?: MetersTypes.IntervalUnit
	}

	export class ConsumptionBucket {
		@ApiProperty({ type: 'string', format: 'date' })
		declare bucketStart: string

		@ApiProperty({ type: 'string', format: 'date', description: 'Exclusive' })
		declare bucketEnd: string

		@ApiProperty({ type: 'number', description: 'Total (VT + NT for electricity)' })
		declare consumption: number

		@ApiProperty({ type: 'number' })
		declare consumptionHigh: number

		@ApiProperty({ type: 'number', nullable: true, description: 'Electricity only' })
		declare consumptionLow: number | null

		@ApiProperty({ type: 'number' })
		declare avgDailyRate: number
	}

	export class MonthlyConsumption {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare sheetGuid: string

		@ApiProperty({ type: 'string', example: '2026-09' })
		declare month: string

		@ApiProperty({ type: 'number' })
		declare high: number

		@ApiProperty({ type: 'number', nullable: true, description: 'Electricity only' })
		declare low: number | null

		@ApiProperty({ type: 'number' })
		declare total: number

		@ApiProperty({ type: 'integer' })
		declare readingCount: number
	}

	// ── Errors ────────────────────────────────────────────────────────────────

	export class SheetNotFoundError extends Api.createErrorDto([ErrorCodes.SheetNotFound]) {}
	export class DuplicateSheetNameError extends Api.createErrorDto([ErrorCodes.DuplicateSheetName]) {}
	export class InvalidSheetNameError extends Api.createErrorDto([ErrorCodes.InvalidSheetName]) {}
	export class ReadingNotFoundError extends Api.createErrorDto([ErrorCodes.ReadingNotFound]) {}
	export class DuplicateReadingDateError extends Api.createErrorDto([ErrorCodes.DuplicateReadingDate]) {}
	export class InvalidReadingValuesError extends Api.createErrorDto([ErrorCodes.InvalidReadingValues]) {}
}
