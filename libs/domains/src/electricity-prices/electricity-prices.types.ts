import { ElectricityPriceMode } from '@family-finances/database'

export namespace ElectricityPricesTypes {
	export class SupplierNotFoundError extends Error { public code = 'electricity_supplier_not_found' }
	export class InvalidSupplierNameError extends Error { public code = 'invalid_electricity_supplier_name' }
	/** The same name + location (none counts as a value) already exists. */
	export class DuplicateSupplierError extends Error { public code = 'duplicate_electricity_supplier' }
	export class PricePeriodNotFoundError extends Error { public code = 'electricity_price_period_not_found' }
	/** `dateTo` before `dateFrom`, or a `spot` period without `dateTo`. */
	export class InvalidPricePeriodRangeError extends Error { public code = 'invalid_electricity_price_period_range' }
	/** `fixed` without `unitPrice`, `spot` without `invoiceAmount` or with zero consumption. */
	export class InvalidPricePeriodValuesError extends Error { public code = 'invalid_electricity_price_period_values' }

	/** VAT on electricity (%) - prices entered without VAT are converted with it; expenses use prices with VAT. */
	export const VAT_RATE_PCT = 21

	export interface SupplierInput {
		name: string
		/** Tells apart contracts of the same supplier; empty = none. */
		location?: string | null
	}

	export interface Supplier {
		guid: string
		name: string
		location: string | null
		/** `name (location)` or just `name` - what selects and the expense view show. */
		label: string
		createdAt: Date
	}

	export interface SupplierWithPeriods extends Supplier {
		/** Newest `dateFrom` first. */
		periods: PricePeriod[]
	}

	/**
	 * `fixed` uses `unitPrice` (`dateTo` optional), `spot` uses `consumptionHigh` (VT) + `consumptionLow` (NT)
	 * and `invoiceAmount` (`dateTo` required). The values of the other mode are ignored.
	 */
	export interface PricePeriodInput {
		mode: ElectricityPriceMode
		/** `YYYY-MM-DD` */
		dateFrom: string
		/** `YYYY-MM-DD`, inclusive; null = indefinitely (`fixed` only). */
		dateTo?: string | null
		vatIncluded: boolean
		unitPrice?: number | null
		consumptionHigh?: number | null
		consumptionLow?: number | null
		invoiceAmount?: number | null
		note?: string | null
	}

	export interface PricePeriod {
		guid: string
		supplierGuid: string
		mode: ElectricityPriceMode
		dateFrom: string
		dateTo: string | null
		vatIncluded: boolean
		unitPrice: number | null
		consumptionHigh: number | null
		consumptionLow: number | null
		invoiceAmount: number | null
		note: string | null
		/** Days from `dateFrom` to `dateTo` inclusive; null = open-ended. */
		days: number | null
		/** `spot`: VT + NT kWh; null for `fixed`. */
		consumptionTotal: number | null
		/** CZK per kWh, rounded to 4 decimals. */
		unitPriceWithoutVat: number
		unitPriceWithVat: number
		createdAt: Date
	}

	/** Consecutive days of a month priced the same way. */
	export interface PriceSegment {
		/** `YYYY-MM-DD` */
		dateFrom: string
		/** `YYYY-MM-DD`, inclusive */
		dateTo: string
		days: number
		periodGuid: string
		/** CZK per kWh - with or without VAT by `MonthPrice.withVat`. */
		unitPrice: number
		/** The days are not covered by any period - priced by the nearest one (the last earlier, else the first later). */
		estimated: boolean
	}

	/**
	 * Price of a supplier for a month: the consumption is spread evenly over the days, so `unitPrice` is the
	 * day-weighted average of the segments. `confirmed` = every day is covered by a period.
	 */
	export interface MonthPrice {
		supplier: Supplier
		month: string
		/** Whether `unitPrice` and the segments' prices include VAT. */
		withVat: boolean
		/** CZK per kWh, 4 decimals; null = the supplier has no period at all. */
		unitPrice: number | null
		confirmed: boolean
		segments: PriceSegment[]
	}
}
