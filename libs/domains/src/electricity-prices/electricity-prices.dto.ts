import { ElectricityPriceMode } from '@family-finances/database'
import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export namespace ElectricityPricesDto {
	export enum ErrorCodes {
		SupplierNotFound = 'electricity_supplier_not_found',
		InvalidSupplierName = 'invalid_electricity_supplier_name',
		DuplicateSupplier = 'duplicate_electricity_supplier',
		PricePeriodNotFound = 'electricity_price_period_not_found',
		InvalidPricePeriodRange = 'invalid_electricity_price_period_range',
		InvalidPricePeriodValues = 'invalid_electricity_price_period_values',
	}

	export class Supplier {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', example: 'ČEZ' })
		declare name: string

		@ApiProperty({ type: 'string', nullable: true, example: 'Chata' })
		declare location: string | null

		@ApiProperty({ type: 'string', example: 'ČEZ (Chata)', description: '`name (location)` or just `name`' })
		declare label: string

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SaveSupplier {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 100, description: 'Tells apart contracts of the same supplier; empty = none' })
		@IsOptional()
		@IsString()
		@MaxLength(100)
		declare location?: string | null
	}

	export class PricePeriod {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare supplierGuid: string

		@ApiProperty({ enum: ElectricityPriceMode, enumName: 'ElectricityPriceMode' })
		declare mode: ElectricityPriceMode

		@ApiProperty({ type: 'string', format: 'date', example: '2026-01-01' })
		declare dateFrom: string

		@ApiProperty({ type: 'string', format: 'date', nullable: true, example: '2026-03-31', description: 'Inclusive; null = indefinitely (fixed only)' })
		declare dateTo: string | null

		@ApiProperty({ type: 'boolean', description: 'The entered price / invoice amount includes VAT' })
		declare vatIncluded: boolean

		@ApiProperty({ type: 'number', nullable: true, description: 'fixed: CZK per kWh as entered' })
		declare unitPrice: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'spot: VT kWh of the invoice' })
		declare consumptionHigh: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'spot: NT kWh of the invoice' })
		declare consumptionLow: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'spot: invoice amount (CZK) as entered' })
		declare invoiceAmount: number | null

		@ApiProperty({ type: 'string', nullable: true })
		declare note: string | null

		@ApiProperty({ type: 'integer', nullable: true, description: 'Days from dateFrom to dateTo inclusive; null = open-ended' })
		declare days: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'spot: VT + NT kWh' })
		declare consumptionTotal: number | null

		@ApiProperty({ type: 'number', description: 'CZK per kWh without VAT' })
		declare unitPriceWithoutVat: number

		@ApiProperty({ type: 'number', description: 'CZK per kWh with VAT - what expenses use' })
		declare unitPriceWithVat: number

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SupplierWithPeriods extends Supplier {
		@ApiProperty({ type: PricePeriod, isArray: true, description: 'Newest dateFrom first' })
		declare periods: PricePeriod[]
	}

	export class SavePricePeriod {
		@ApiProperty({ enum: ElectricityPriceMode, enumName: 'ElectricityPriceMode' })
		@IsEnum(ElectricityPriceMode)
		declare mode: ElectricityPriceMode

		@ApiProperty({ type: 'string', format: 'date', example: '2026-01-01' })
		@IsDateString({ strict: true })
		@Matches(DATE_PATTERN)
		declare dateFrom: string

		@ApiProperty({ type: 'string', format: 'date', required: false, nullable: true, example: '2026-03-31', description: 'Inclusive; required for spot, empty = indefinitely for fixed' })
		@IsOptional()
		@IsDateString({ strict: true })
		@Matches(DATE_PATTERN)
		declare dateTo?: string | null

		@ApiProperty({ type: 'boolean', description: 'The entered price / invoice amount includes VAT' })
		@IsBoolean()
		declare vatIncluded: boolean

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'fixed: CZK per kWh (required)' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 4 })
		@Min(0)
		declare unitPrice?: number | null

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'spot: VT kWh' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 3 })
		@Min(0)
		declare consumptionHigh?: number | null

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'spot: NT kWh; empty = single tariff' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 3 })
		@Min(0)
		declare consumptionLow?: number | null

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'spot: invoice amount for the period, CZK (required)' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare invoiceAmount?: number | null

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null
	}

	export class PriceSegment {
		@ApiProperty({ type: 'string', format: 'date' })
		declare dateFrom: string

		@ApiProperty({ type: 'string', format: 'date', description: 'Inclusive' })
		declare dateTo: string

		@ApiProperty({ type: 'integer' })
		declare days: number

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare periodGuid: string

		@ApiProperty({ type: 'number', description: 'CZK per kWh - with or without VAT by the expense\'s electricityPriceWithVat' })
		declare unitPrice: number

		@ApiProperty({ type: 'boolean', description: 'Not covered by any period - priced by the nearest one' })
		declare estimated: boolean
	}

	export class SupplierNotFoundError extends Api.createErrorDto([ErrorCodes.SupplierNotFound]) {}
	export class InvalidSupplierError extends Api.createErrorDto([ErrorCodes.InvalidSupplierName]) {}
	export class DuplicateSupplierError extends Api.createErrorDto([ErrorCodes.DuplicateSupplier]) {}
	export class PricePeriodNotFoundError extends Api.createErrorDto([ErrorCodes.PricePeriodNotFound, ErrorCodes.SupplierNotFound]) {}
	export class InvalidPricePeriodError extends Api.createErrorDto([ErrorCodes.InvalidPricePeriodRange, ErrorCodes.InvalidPricePeriodValues]) {}
}
