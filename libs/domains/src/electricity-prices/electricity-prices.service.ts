import { coreSchema, DbProvider, ElectricityPriceMode } from '@family-finances/database'
import { Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { ElectricityPricesTypes } from './electricity-prices.types'

type SupplierRow = typeof coreSchema.electricitySupplier.$inferSelect
type PeriodRow = typeof coreSchema.electricityPricePeriod.$inferSelect

const DAY_MS = 24 * 60 * 60 * 1000
const UNIQUE_CONSTRAINT_VIOLATION = '23505'

/** Which period prices a day and whether it really covers it. */
interface DayPrice {
	date: string
	period: ElectricityPricesTypes.PricePeriod
	estimated: boolean
}

@Injectable()
export class ElectricityPricesService {
	constructor(
		private db: DbProvider,
	) {}

	// ── Suppliers ─────────────────────────────────────────────────────────────

	/** Suppliers ordered by name and location (none first), each with its periods (newest first). */
	async list(): Promise<ElectricityPricesTypes.SupplierWithPeriods[]> {
		const [suppliers, periods] = await Promise.all([
			this.db.core.select()
				.from(coreSchema.electricitySupplier)
				.orderBy(asc(coreSchema.electricitySupplier.name), sql`${coreSchema.electricitySupplier.location} asc nulls first`),
			this.db.core.select()
				.from(coreSchema.electricityPricePeriod)
				.orderBy(desc(coreSchema.electricityPricePeriod.dateFrom), desc(coreSchema.electricityPricePeriod.createdAt)),
		])
		return suppliers.map((row) => ({
			...this.toSupplier(row),
			periods: periods.filter((p) => p.supplierGuid === row.guid).map((p) => this.toPeriod(p)),
		}))
	}

	async get(guid: string): Promise<ElectricityPricesTypes.Supplier> {
		const [row] = await this.db.core.select()
			.from(coreSchema.electricitySupplier)
			.where(eq(coreSchema.electricitySupplier.guid, guid))
		if (!row) throw new ElectricityPricesTypes.SupplierNotFoundError()
		return this.toSupplier(row)
	}

	async create(input: ElectricityPricesTypes.SupplierInput): Promise<ElectricityPricesTypes.Supplier> {
		const values = this.toSupplierValues(input)
		let row: SupplierRow | undefined
		try {
			[row] = await this.db.core.insert(coreSchema.electricitySupplier)
				.values(values)
				.returning()
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		if (!row) throw new Error('Insert into electricity_supplier returned no row')
		return this.toSupplier(row)
	}

	async update(guid: string, input: ElectricityPricesTypes.SupplierInput): Promise<ElectricityPricesTypes.Supplier> {
		const values = this.toSupplierValues(input)
		let row: SupplierRow | undefined
		try {
			[row] = await this.db.core.update(coreSchema.electricitySupplier)
				.set(values)
				.where(eq(coreSchema.electricitySupplier.guid, guid))
				.returning()
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		if (!row) throw new ElectricityPricesTypes.SupplierNotFoundError()
		return this.toSupplier(row)
	}

	/** Deletes the supplier with its periods - linked expenses fall back to their own monthly prices. */
	async remove(guid: string) {
		const [row] = await this.db.core.delete(coreSchema.electricitySupplier)
			.where(eq(coreSchema.electricitySupplier.guid, guid))
			.returning()
		if (!row) throw new ElectricityPricesTypes.SupplierNotFoundError()
	}

	// ── Price periods ─────────────────────────────────────────────────────────

	async createPeriod(supplierGuid: string, input: ElectricityPricesTypes.PricePeriodInput): Promise<ElectricityPricesTypes.PricePeriod> {
		const values = this.toPeriodValues(input)
		await this.get(supplierGuid)
		const [row] = await this.db.core.insert(coreSchema.electricityPricePeriod)
			.values({ ...values, supplierGuid })
			.returning()
		if (!row) throw new Error('Insert into electricity_price_period returned no row')
		return this.toPeriod(row)
	}

	async updatePeriod(supplierGuid: string, periodGuid: string, input: ElectricityPricesTypes.PricePeriodInput): Promise<ElectricityPricesTypes.PricePeriod> {
		const values = this.toPeriodValues(input)
		await this.get(supplierGuid)
		const [row] = await this.db.core.update(coreSchema.electricityPricePeriod)
			.set(values)
			.where(this.periodByGuid(supplierGuid, periodGuid))
			.returning()
		if (!row) throw new ElectricityPricesTypes.PricePeriodNotFoundError()
		return this.toPeriod(row)
	}

	async removePeriod(supplierGuid: string, periodGuid: string) {
		await this.get(supplierGuid)
		const [row] = await this.db.core.delete(coreSchema.electricityPricePeriod)
			.where(this.periodByGuid(supplierGuid, periodGuid))
			.returning()
		if (!row) throw new ElectricityPricesTypes.PricePeriodNotFoundError()
	}

	// ── Readers for other domains ─────────────────────────────────────────────

	/** Price per kWh of the supplier in `month` (`YYYY-MM`), with or without VAT - see `ElectricityPricesTypes.MonthPrice`. */
	async getMonthPrice(supplierGuid: string, month: string, withVat = true): Promise<ElectricityPricesTypes.MonthPrice> {
		const supplier = await this.get(supplierGuid)
		const rows = await this.db.core.select()
			.from(coreSchema.electricityPricePeriod)
			.where(eq(coreSchema.electricityPricePeriod.supplierGuid, supplierGuid))
		return { supplier, month, withVat, ...this.priceMonth(rows.map((row) => this.toPeriod(row)), month, withVat) }
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * Prices every day of the month by the period covering it (the later-starting one where periods
	 * overlap); an uncovered day is estimated by the nearest period - the one that ended last before it,
	 * else the first one starting after it. The month price is the day-weighted average, i.e. the
	 * consumption is split evenly over the days. Consecutive days with the same price form a segment.
	 */
	private priceMonth(periods: ElectricityPricesTypes.PricePeriod[], month: string, withVat: boolean): Omit<ElectricityPricesTypes.MonthPrice, 'supplier' | 'month' | 'withVat'> {
		if (periods.length === 0) return { unitPrice: null, confirmed: false, segments: [] }
		const days: DayPrice[] = []
		for (let date = Months.firstDay(month); date <= Months.lastDay(month); date = this.addDays(date, 1)) {
			days.push(this.priceDay(periods, date))
		}

		const segments: ElectricityPricesTypes.PriceSegment[] = []
		for (const day of days) {
			const last = segments[segments.length - 1]
			if (last && last.periodGuid === day.period.guid && last.estimated === day.estimated) {
				last.dateTo = day.date
				last.days++
				continue
			}
			segments.push({
				dateFrom: day.date,
				dateTo: day.date,
				days: 1,
				periodGuid: day.period.guid,
				unitPrice: withVat ? day.period.unitPriceWithVat : day.period.unitPriceWithoutVat,
				estimated: day.estimated,
			})
		}
		const weighted = segments.reduce((sum, s) => sum + s.days * s.unitPrice, 0)
		return {
			unitPrice: this.roundPrice(weighted / days.length),
			confirmed: segments.every((s) => !s.estimated),
			segments,
		}
	}

	/** Expects at least one period. */
	private priceDay(periods: ElectricityPricesTypes.PricePeriod[], date: string): DayPrice {
		const covering = periods
			.filter((p) => p.dateFrom <= date && (p.dateTo === null || date <= p.dateTo))
			.sort((a, b) => b.dateFrom.localeCompare(a.dateFrom) || b.createdAt.getTime() - a.createdAt.getTime())
		if (covering[0]) return { date, period: covering[0], estimated: false }
		// Not covered: every period starting before the day has ended (an open-ended one would cover it).
		const ended = periods
			.filter((p) => p.dateTo !== null && p.dateTo < date)
			.sort((a, b) => (b.dateTo ?? '').localeCompare(a.dateTo ?? '') || b.dateFrom.localeCompare(a.dateFrom))
		const upcoming = periods
			.filter((p) => p.dateFrom > date)
			.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
		const nearest = ended[0] ?? upcoming[0]
		if (!nearest) throw new Error('priceDay needs at least one period')
		return { date, period: nearest, estimated: true }
	}

	private toPeriodValues(input: ElectricityPricesTypes.PricePeriodInput) {
		const dateTo = input.dateTo || null
		if (dateTo !== null && dateTo < input.dateFrom) throw new ElectricityPricesTypes.InvalidPricePeriodRangeError()
		const common = { mode: input.mode, dateFrom: input.dateFrom, dateTo, vatIncluded: input.vatIncluded, note: input.note?.trim() || null }

		if (input.mode === ElectricityPriceMode.fixed) {
			const unitPrice = input.unitPrice ?? null
			if (unitPrice === null || unitPrice <= 0) throw new ElectricityPricesTypes.InvalidPricePeriodValuesError()
			return { ...common, unitPrice, consumptionHigh: null, consumptionLow: null, invoiceAmount: null }
		}

		// An invoice always covers a closed date range.
		if (dateTo === null) throw new ElectricityPricesTypes.InvalidPricePeriodRangeError()
		const consumptionHigh = input.consumptionHigh ?? 0
		const consumptionLow = input.consumptionLow ?? null
		const invoiceAmount = input.invoiceAmount ?? null
		if (invoiceAmount === null || invoiceAmount <= 0 || consumptionHigh + (consumptionLow ?? 0) <= 0) {
			throw new ElectricityPricesTypes.InvalidPricePeriodValuesError()
		}
		return { ...common, unitPrice: null, consumptionHigh, consumptionLow, invoiceAmount }
	}

	private toPeriod(row: PeriodRow): ElectricityPricesTypes.PricePeriod {
		const consumptionTotal = row.mode === ElectricityPriceMode.spot ? (row.consumptionHigh ?? 0) + (row.consumptionLow ?? 0) : null
		const entered = row.mode === ElectricityPriceMode.spot
			? (row.invoiceAmount ?? 0) / (consumptionTotal || 1)
			: (row.unitPrice ?? 0)
		const vatFactor = 1 + ElectricityPricesTypes.VAT_RATE_PCT / 100
		return {
			...row,
			days: row.dateTo === null ? null : this.daysBetween(row.dateFrom, row.dateTo) + 1,
			consumptionTotal,
			unitPriceWithoutVat: this.roundPrice(row.vatIncluded ? entered / vatFactor : entered),
			unitPriceWithVat: this.roundPrice(row.vatIncluded ? entered : entered * vatFactor),
		}
	}

	private toSupplierValues(input: ElectricityPricesTypes.SupplierInput) {
		const name = input.name.trim()
		if (!name) throw new ElectricityPricesTypes.InvalidSupplierNameError()
		return { name, location: input.location?.trim() || null }
	}

	private toSupplier(row: SupplierRow): ElectricityPricesTypes.Supplier {
		return { ...row, label: row.location ? `${row.name} (${row.location})` : row.name }
	}

	private periodByGuid(supplierGuid: string, periodGuid: string) {
		return and(eq(coreSchema.electricityPricePeriod.guid, periodGuid), eq(coreSchema.electricityPricePeriod.supplierGuid, supplierGuid))
	}

	/** `YYYY-MM-DD` + `count` days. */
	private addDays(date: string, count: number): string {
		return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10)
	}

	/** Whole days from `from` to `to` (`YYYY-MM-DD`). */
	private daysBetween(from: string, to: string): number {
		return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
	}

	private roundPrice(value: number) {
		return Math.round(value * 10000) / 10000
	}

	private rethrowDuplicate(err: unknown): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
			throw new ElectricityPricesTypes.DuplicateSupplierError()
		}
		throw err
	}
}
