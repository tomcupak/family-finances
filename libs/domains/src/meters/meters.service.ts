import { coreSchema, DbProvider, MeterEntryMode, UtilityType } from '@family-finances/database'
import { Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { MetersTypes } from './meters.types'

const DAY_MS = 24 * 60 * 60 * 1000
const UNIQUE_CONSTRAINT_VIOLATION = '23505'

type SheetRow = typeof coreSchema.meterSheet.$inferSelect
type ReadingRow = typeof coreSchema.meterReading.$inferSelect

interface Bucket {
	start: Date
	end: Date
}

interface DatedValue {
	date: Date
	value: number
}

interface ReadingValues {
	readingDate: string
	valueHigh: number
	valueLow: number | null
}

/** What the consumption computation needs to know about a sheet. */
interface SheetKind {
	utility: UtilityType
	entryMode: MeterEntryMode
}

@Injectable()
export class MetersService {
	constructor(
		private db: DbProvider,
	) {}

	// ── Sheets ────────────────────────────────────────────────────────────────

	/** Sheets ordered by name, each with its latest reading (for quick entry / overview). */
	async listSheets(includeArchived = false) {
		const sheets = await this.db.core.select()
			.from(coreSchema.meterSheet)
			.where(includeArchived ? undefined : eq(coreSchema.meterSheet.archived, false))
			.orderBy(asc(coreSchema.meterSheet.name))
		return this.withLastReadings(sheets)
	}

	async getSheet(guid: string) {
		const sheet = await this.findSheet(guid)
		const [withLast] = await this.withLastReadings([sheet])
		if (!withLast) throw new MetersTypes.SheetNotFoundError()
		return withLast
	}

	/** `entryMode` is fixed after creation, like `utility` - the readings' meaning depends on it. */
	async createSheet(name: string, utility: UtilityType, entryMode = MeterEntryMode.state) {
		const normalized = this.normalizeSheetName(name)
		let row: SheetRow | undefined
		try {
			[row] = await this.db.core.insert(coreSchema.meterSheet)
				.values({ name: normalized, utility, entryMode })
				.returning()
		} catch (err) {
			this.rethrowUnique(err, new MetersTypes.DuplicateSheetNameError())
		}
		if (!row) throw new Error('Insert into meter_sheet returned no row')
		return this.toSheetWithLastReading(row, undefined)
	}

	/** Renames / (un)archives a sheet. The utility type and entry mode are fixed - readings depend on them. */
	async updateSheet(guid: string, update: MetersTypes.SheetUpdate) {
		const set: Partial<typeof coreSchema.meterSheet.$inferInsert> = {}
		if (update.name !== undefined) set.name = this.normalizeSheetName(update.name)
		if (update.archived !== undefined) set.archived = update.archived
		if (Object.keys(set).length === 0) return this.getSheet(guid)

		let row: SheetRow | undefined
		try {
			[row] = await this.db.core.update(coreSchema.meterSheet)
				.set(set)
				.where(eq(coreSchema.meterSheet.guid, guid))
				.returning()
		} catch (err) {
			this.rethrowUnique(err, new MetersTypes.DuplicateSheetNameError())
		}
		if (!row) throw new MetersTypes.SheetNotFoundError()
		return this.getSheet(row.guid)
	}

	/** Deletes the sheet together with all its readings (FK cascade). */
	async removeSheet(guid: string) {
		const [row] = await this.db.core.delete(coreSchema.meterSheet)
			.where(eq(coreSchema.meterSheet.guid, guid))
			.returning()
		if (!row) throw new MetersTypes.SheetNotFoundError()
	}

	// ── Readings ──────────────────────────────────────────────────────────────

	/**
	 * Readings newest first, each with the consumption since the previous reading (null for the first one
	 * of a `state` sheet; an `increment` reading is its own consumption).
	 */
	async listReadings(sheetGuid: string) {
		const sheet = await this.findSheet(sheetGuid)
		const readings = await this.readingsAsc(sheetGuid)
		return this.withDiffs(readings, sheet).reverse()
	}

	async createReading(sheetGuid: string, input: MetersTypes.ReadingInput) {
		const sheet = await this.findSheet(sheetGuid)
		const values = this.normalizeReadingValues(sheet.utility, input)
		let row: ReadingRow | undefined
		try {
			[row] = await this.db.core.insert(coreSchema.meterReading)
				.values({ sheetGuid, ...values, note: this.normalizeNote(input.note) })
				.returning()
		} catch (err) {
			this.rethrowUnique(err, new MetersTypes.DuplicateReadingDateError())
		}
		if (!row) throw new Error('Insert into meter_reading returned no row')
		return row
	}

	/** Quick entry of the same-dated readings for several sheets at once - all or nothing. */
	async createReadingsBulk(readingDate: string, entries: MetersTypes.BulkReadingInput[]) {
		const sheetGuids = [...new Set(entries.map((e) => e.sheetGuid))]
		const sheets = sheetGuids.length
			? await this.db.core.select().from(coreSchema.meterSheet).where(inArray(coreSchema.meterSheet.guid, sheetGuids))
			: []
		const sheetsByGuid = new Map(sheets.map((s) => [s.guid, s]))

		const rows = entries.map((entry) => {
			const sheet = sheetsByGuid.get(entry.sheetGuid)
			if (!sheet) throw new MetersTypes.SheetNotFoundError()
			const values = this.normalizeReadingValues(sheet.utility, { ...entry, readingDate })
			return { sheetGuid: sheet.guid, ...values, note: this.normalizeNote(entry.note) }
		})
		if (rows.length === 0) return []

		try {
			return await this.db.core.insert(coreSchema.meterReading).values(rows).returning()
		} catch (err) {
			this.rethrowUnique(err, new MetersTypes.DuplicateReadingDateError())
		}
	}

	async removeReading(guid: string) {
		const [row] = await this.db.core.delete(coreSchema.meterReading)
			.where(eq(coreSchema.meterReading.guid, guid))
			.returning()
		if (!row) throw new MetersTypes.ReadingNotFoundError()
	}

	// ── Consumption ───────────────────────────────────────────────────────────

	/**
	 * Consumption billed to a month = sum of the diffs of all readings dated within the month
	 * (each against its previous reading, which may be from an earlier month); for an `increment`
	 * sheet the sum of the readings' values. Used by expenses.
	 */
	async getMonthlyConsumption(sheetGuid: string, month: string): Promise<MetersTypes.MonthlyConsumption> {
		const sheet = await this.findSheet(sheetGuid)
		const readings = await this.db.core.select()
			.from(coreSchema.meterReading)
			.where(and(
				eq(coreSchema.meterReading.sheetGuid, sheetGuid),
				lte(coreSchema.meterReading.readingDate, Months.lastDay(month)),
			))
			.orderBy(asc(coreSchema.meterReading.readingDate))
		return { sheetGuid, month, ...this.sumMonthDiffs(readings, sheet, month) }
	}

	/**
	 * Buckets consumption over [from, to] into calendar-aligned periods (day/week/month/year).
	 * Each pair of consecutive readings contributes a constant daily rate
	 * ((next.value - prev.value) / daysBetween) to every calendar day it spans, so a diff that
	 * crosses a bucket boundary (e.g. a reading taken mid-month) is split proportionally across
	 * both buckets instead of being dumped entirely into one. Electricity tariffs (VT/NT) are
	 * bucketed separately and summed. An `increment` reading is spread the same way over the days
	 * since the previous reading, but at most back to the first day of its own month.
	 */
	async getConsumption(
		sheetGuid: string,
		from: string,
		to: string,
		interval: MetersTypes.IntervalUnit = MetersTypes.IntervalUnit.month,
	): Promise<MetersTypes.ConsumptionBucket[]> {
		const sheet = await this.findSheet(sheetGuid)
		const readings = await this.readingsAsc(sheetGuid)
		return this.bucketConsumption(readings, sheet, this.parseDate(from), this.parseDate(to), interval)
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private async findSheet(guid: string) {
		const [sheet] = await this.db.core.select()
			.from(coreSchema.meterSheet)
			.where(eq(coreSchema.meterSheet.guid, guid))
		if (!sheet) throw new MetersTypes.SheetNotFoundError()
		return sheet
	}

	private async readingsAsc(sheetGuid: string) {
		return this.db.core.select()
			.from(coreSchema.meterReading)
			.where(eq(coreSchema.meterReading.sheetGuid, sheetGuid))
			.orderBy(asc(coreSchema.meterReading.readingDate))
	}

	private async withLastReadings(sheets: SheetRow[]) {
		if (sheets.length === 0) return []
		const lastReadings = await this.db.core.selectDistinctOn([coreSchema.meterReading.sheetGuid])
			.from(coreSchema.meterReading)
			.where(inArray(coreSchema.meterReading.sheetGuid, sheets.map((s) => s.guid)))
			.orderBy(coreSchema.meterReading.sheetGuid, desc(coreSchema.meterReading.readingDate))
		const bySheet = new Map(lastReadings.map((r) => [r.sheetGuid, r]))
		return sheets.map((sheet) => this.toSheetWithLastReading(sheet, bySheet.get(sheet.guid)))
	}

	private toSheetWithLastReading(sheet: SheetRow, last: ReadingRow | undefined) {
		return {
			...sheet,
			lastReadingDate: last?.readingDate ?? null,
			lastValueHigh: last?.valueHigh ?? null,
			lastValueLow: last?.valueLow ?? null,
		}
	}

	private withDiffs<R extends ReadingValues>(readingsAsc: R[], sheet: SheetKind) {
		return readingsAsc.map((reading, i) => {
			const prev = i > 0 ? readingsAsc[i - 1] : undefined
			const diff = this.consumptionOf(prev, reading, sheet)
			return {
				...reading,
				diffHigh: diff?.high ?? null,
				diffLow: diff?.low ?? null,
				diffTotal: diff?.total ?? null,
			}
		})
	}

	private sumMonthDiffs(readingsAsc: ReadingValues[], sheet: SheetKind, month: string) {
		let high = 0
		let low = 0
		let readingCount = 0
		readingsAsc.forEach((curr, i) => {
			if (Months.fromDate(curr.readingDate) !== month) return
			const diff = this.consumptionOf(readingsAsc[i - 1], curr, sheet)
			if (!diff) return
			high += diff.high
			low += diff.low ?? 0
			readingCount++
		})
		const isElectricity = sheet.utility === UtilityType.electricity
		return {
			high: this.round(high),
			low: isElectricity ? this.round(low) : null,
			total: this.round(high + (isElectricity ? low : 0)),
			readingCount,
		}
	}

	/** Consumption of `curr` - the diff to `prev` for a `state` sheet (null without `prev`), the value itself for an `increment` one. */
	private consumptionOf(prev: ReadingValues | undefined, curr: ReadingValues, sheet: SheetKind): MetersTypes.Consumption | null {
		if (sheet.entryMode === MeterEntryMode.increment) return this.diff({ ...curr, valueHigh: 0, valueLow: 0 }, curr, sheet.utility)
		return prev ? this.diff(prev, curr, sheet.utility) : null
	}

	private diff(prev: ReadingValues, curr: ReadingValues, utility: UtilityType): MetersTypes.Consumption {
		const high = this.round(curr.valueHigh - prev.valueHigh)
		const low = utility === UtilityType.electricity ? this.round((curr.valueLow ?? 0) - (prev.valueLow ?? 0)) : null
		return { high, low, total: this.round(high + (low ?? 0)) }
	}

	private bucketConsumption(
		readingsAsc: ReadingValues[],
		sheet: SheetKind,
		from: Date,
		to: Date,
		interval: MetersTypes.IntervalUnit,
	): MetersTypes.ConsumptionBucket[] {
		const buckets = this.buildBuckets(from, to, interval)
		const states = sheet.entryMode === MeterEntryMode.increment ? this.incrementsToStates(readingsAsc) : readingsAsc
		const high = this.splitAcrossBuckets(states.map((r) => ({ date: this.parseDate(r.readingDate), value: r.valueHigh })), buckets)
		const low = sheet.utility === UtilityType.electricity
			? this.splitAcrossBuckets(states.map((r) => ({ date: this.parseDate(r.readingDate), value: r.valueLow ?? 0 })), buckets)
			: undefined

		return buckets.map((bucket, i) => {
			const consumptionHigh = high[i] ?? 0
			const consumptionLow = low ? (low[i] ?? 0) : null
			const total = consumptionHigh + (consumptionLow ?? 0)
			return {
				bucketStart: this.formatDate(bucket.start),
				bucketEnd: this.formatDate(bucket.end),
				consumption: this.round(total),
				consumptionHigh: this.round(consumptionHigh),
				consumptionLow: consumptionLow === null ? null : this.round(consumptionLow),
				avgDailyRate: this.round(total / this.daysBetween(bucket.start, bucket.end)),
			}
		})
	}

	/**
	 * Turns increments into an equivalent series of cumulative states for `splitAcrossBuckets`: each increment
	 * becomes a rise over its own period - from the day after the previous reading, but no earlier than the
	 * first day of its month, through its date inclusive (state points are exclusive ends, hence `+ 1 day`).
	 */
	private incrementsToStates(readingsAsc: ReadingValues[]): ReadingValues[] {
		const states: ReadingValues[] = []
		let high = 0
		let low = 0
		let prevEnd: string | undefined
		for (const reading of readingsAsc) {
			const monthStart = Months.firstDay(Months.fromDate(reading.readingDate))
			const start = prevEnd && prevEnd > monthStart ? prevEnd : monthStart
			const end = this.formatDate(this.addDays(this.parseDate(reading.readingDate), 1))
			states.push({ readingDate: start, valueHigh: high, valueLow: low })
			high += reading.valueHigh
			low += reading.valueLow ?? 0
			states.push({ readingDate: end, valueHigh: high, valueLow: low })
			prevEnd = end
		}
		return states
	}

	private normalizeReadingValues(utility: UtilityType, input: MetersTypes.ReadingInput): ReadingValues {
		const valueLow = input.valueLow ?? null
		const isElectricity = utility === UtilityType.electricity
		if (isElectricity !== (valueLow !== null)) throw new MetersTypes.InvalidReadingValuesError()
		return { readingDate: input.readingDate, valueHigh: input.valueHigh, valueLow }
	}

	private normalizeSheetName(name: string) {
		const normalized = name.trim()
		if (!normalized) throw new MetersTypes.InvalidSheetNameError()
		return normalized
	}

	private normalizeNote(note: string | null | undefined) {
		const normalized = note?.trim()
		return normalized ? normalized : null
	}

	private rethrowUnique(err: unknown, mapped: Error): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) throw mapped
		throw err
	}

	private buildBuckets(from: Date, to: Date, interval: MetersTypes.IntervalUnit): Bucket[] {
		const buckets: Bucket[] = []
		let cursor = this.bucketStart(from, interval)
		while (cursor <= to) {
			const end = this.nextBucketStart(cursor, interval)
			buckets.push({ start: cursor, end })
			cursor = end
		}
		return buckets
	}

	private splitAcrossBuckets(readings: DatedValue[], buckets: Bucket[]): number[] {
		const totals = new Array<number>(buckets.length).fill(0)

		for (let i = 1; i < readings.length; i++) {
			const prev = readings[i - 1]
			const curr = readings[i]
			if (!prev || !curr) continue
			const totalDays = this.daysBetween(prev.date, curr.date)
			if (totalDays <= 0) continue

			const dailyRate = (curr.value - prev.value) / totalDays
			for (const day = new Date(prev.date); day < curr.date; day.setUTCDate(day.getUTCDate() + 1)) {
				const bucketIndex = buckets.findIndex((b) => day >= b.start && day < b.end)
				if (bucketIndex !== -1) totals[bucketIndex] = (totals[bucketIndex] ?? 0) + dailyRate
			}
		}

		return totals
	}

	private bucketStart(date: Date, interval: MetersTypes.IntervalUnit): Date {
		const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
		switch (interval) {
			case MetersTypes.IntervalUnit.day:
				return day
			case MetersTypes.IntervalUnit.week: {
				const isoDayOfWeek = (day.getUTCDay() + 6) % 7 // Monday = 0
				day.setUTCDate(day.getUTCDate() - isoDayOfWeek)
				return day
			}
			case MetersTypes.IntervalUnit.month:
				return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
			case MetersTypes.IntervalUnit.year:
				return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
		}
	}

	private nextBucketStart(start: Date, interval: MetersTypes.IntervalUnit): Date {
		const next = new Date(start)
		switch (interval) {
			case MetersTypes.IntervalUnit.day:
				next.setUTCDate(next.getUTCDate() + 1)
				break
			case MetersTypes.IntervalUnit.week:
				next.setUTCDate(next.getUTCDate() + 7)
				break
			case MetersTypes.IntervalUnit.month:
				next.setUTCMonth(next.getUTCMonth() + 1)
				break
			case MetersTypes.IntervalUnit.year:
				next.setUTCFullYear(next.getUTCFullYear() + 1)
				break
		}
		return next
	}

	private addDays(date: Date, days: number): Date {
		const next = new Date(date)
		next.setUTCDate(next.getUTCDate() + days)
		return next
	}

	private daysBetween(a: Date, b: Date): number {
		return Math.round((b.getTime() - a.getTime()) / DAY_MS)
	}

	private parseDate(value: string): Date {
		return new Date(`${value}T00:00:00.000Z`)
	}

	private formatDate(date: Date): string {
		return date.toISOString().slice(0, 10)
	}

	private round(value: number): number {
		return Math.round(value * 1000) / 1000
	}
}
