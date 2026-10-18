export namespace MetersTypes {
	export class SheetNotFoundError extends Error { public code = 'sheet_not_found' }
	export class DuplicateSheetNameError extends Error { public code = 'duplicate_sheet_name' }
	export class InvalidSheetNameError extends Error { public code = 'invalid_sheet_name' }
	export class ReadingNotFoundError extends Error { public code = 'reading_not_found' }
	export class DuplicateReadingDateError extends Error { public code = 'duplicate_reading_date' }
	/** Electricity needs both `valueHigh` (VT) and `valueLow` (NT); water/gas only `valueHigh`. */
	export class InvalidReadingValuesError extends Error { public code = 'invalid_reading_values' }

	export enum IntervalUnit {
		day = 'day',
		week = 'week',
		month = 'month',
		year = 'year',
	}

	export interface ReadingInput {
		readingDate: string
		valueHigh: number
		valueLow?: number | null
		note?: string | null
	}

	export interface BulkReadingInput {
		sheetGuid: string
		valueHigh: number
		valueLow?: number | null
		note?: string | null
	}

	export interface SheetUpdate {
		name?: string
		archived?: boolean
	}

	/** Consumption split by tariff. `low` is null for water/gas (single-tariff meters). */
	export interface Consumption {
		high: number
		low: number | null
		total: number
	}

	export interface ConsumptionBucket {
		bucketStart: string
		bucketEnd: string
		consumption: number
		consumptionHigh: number
		consumptionLow: number | null
		avgDailyRate: number
	}

	export interface MonthlyConsumption extends Consumption {
		sheetGuid: string
		month: string
		/** Number of readings dated within the month that had a previous reading to diff against. */
		readingCount: number
	}
}
