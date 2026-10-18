import { coreSchema, DbProvider, MeterEntryMode, UtilityType } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'

import { MetersService } from './meters.service'
import { MetersTypes } from './meters.types'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const sheetKind = (utility: UtilityType, entryMode = MeterEntryMode.state) => ({ utility, entryMode })

function makeReading(readingDate: string, valueHigh: number, valueLow: number | null = null) {
	return { readingDate, valueHigh, valueLow }
}

describe('MetersService', () => {
	let service: MetersService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new MetersService({} as never)
	})

	describe('splitAcrossBuckets', () => {
		it('splits a diff proportionally across two buckets when the reading falls mid-period', () => {
			const buckets = [
				{ start: day('2024-01-01'), end: day('2024-02-01') },
				{ start: day('2024-02-01'), end: day('2024-03-01') },
			]
			const readings = [
				{ date: day('2024-01-15'), value: 100 },
				{ date: day('2024-02-15'), value: 131 }, // 31 days, +1/day
			]

			const totals = service['splitAcrossBuckets'](readings, buckets)

			expect(totals[0]).toBeCloseTo(17) // Jan 15-31 (17 days)
			expect(totals[1]).toBeCloseTo(14) // Feb 1-14 (14 days)
		})

		it('attributes a diff ending exactly on a bucket boundary fully to the earlier bucket', () => {
			const buckets = [
				{ start: day('2024-01-01'), end: day('2024-02-01') },
				{ start: day('2024-02-01'), end: day('2024-03-01') },
			]
			const readings = [
				{ date: day('2024-01-01'), value: 0 },
				{ date: day('2024-02-01'), value: 31 },
			]

			const totals = service['splitAcrossBuckets'](readings, buckets)

			expect(totals[0]).toBeCloseTo(31)
			expect(totals[1]).toBe(0)
		})

		it('reports no consumption when there is only a single reading', () => {
			const buckets = [{ start: day('2024-01-01'), end: day('2024-02-01') }]

			const totals = service['splitAcrossBuckets']([{ date: day('2024-01-15'), value: 100 }], buckets)

			expect(totals[0]).toBe(0)
		})
	})

	describe('buildBuckets', () => {
		it('builds calendar-aligned month buckets covering the requested range', () => {
			const buckets = service['buildBuckets'](day('2024-01-15'), day('2024-03-05'), MetersTypes.IntervalUnit.month)

			expect(buckets).toEqual([
				{ start: day('2024-01-01'), end: day('2024-02-01') },
				{ start: day('2024-02-01'), end: day('2024-03-01') },
				{ start: day('2024-03-01'), end: day('2024-04-01') },
			])
		})

		it('builds ISO week buckets (Monday start)', () => {
			// 2024-01-03 is a Wednesday
			const buckets = service['buildBuckets'](day('2024-01-03'), day('2024-01-03'), MetersTypes.IntervalUnit.week)

			expect(buckets).toEqual([{ start: day('2024-01-01'), end: day('2024-01-08') }])
		})
	})

	describe('bucketConsumption', () => {
		it('buckets electricity VT and NT separately and sums them', () => {
			const readings = [makeReading('2024-01-01', 100, 50), makeReading('2024-02-01', 131, 112)]

			const [bucket] = service['bucketConsumption'](readings, sheetKind(UtilityType.electricity), day('2024-01-01'), day('2024-01-31'), MetersTypes.IntervalUnit.month)

			expect(bucket).toEqual(expect.objectContaining({ consumptionHigh: 31, consumptionLow: 62, consumption: 93, avgDailyRate: 3 }))
		})

		it('leaves consumptionLow null for single-tariff meters', () => {
			const readings = [makeReading('2024-01-01', 1000), makeReading('2024-02-01', 4100)]

			const [bucket] = service['bucketConsumption'](readings, sheetKind(UtilityType.water), day('2024-01-01'), day('2024-01-31'), MetersTypes.IntervalUnit.month)

			expect(bucket).toEqual(expect.objectContaining({ consumptionHigh: 3100, consumptionLow: null, consumption: 3100 }))
		})

		it('keeps each increment within its own month', () => {
			const readings = [makeReading('2024-01-31', 310, 0), makeReading('2024-03-31', 62, 31)]

			const buckets = service['bucketConsumption'](readings, sheetKind(UtilityType.electricity, MeterEntryMode.increment), day('2024-01-01'), day('2024-03-31'), MetersTypes.IntervalUnit.month)

			expect(buckets.map((b) => b.consumption)).toEqual([310, 0, 93])
			expect(buckets[2]).toEqual(expect.objectContaining({ consumptionHigh: 62, consumptionLow: 31, avgDailyRate: 3 }))
		})

		it('spreads an increment over the days since the previous one within the month', () => {
			const readings = [makeReading('2024-01-10', 10), makeReading('2024-01-20', 100)]

			const buckets = service['bucketConsumption'](readings, sheetKind(UtilityType.gas, MeterEntryMode.increment), day('2024-01-01'), day('2024-01-20'), MetersTypes.IntervalUnit.day)

			expect(buckets[0]?.consumption).toBe(1) // 10 over Jan 1-10
			expect(buckets[10]?.consumption).toBe(10) // 100 over Jan 11-20
			expect(buckets.reduce((sum, b) => sum + b.consumption, 0)).toBeCloseTo(110)
		})
	})

	describe('sumMonthDiffs', () => {
		it('sums diffs of all readings dated within the month, the previous reading may be older', () => {
			const readings = [
				makeReading('2026-07-31', 1000, 500),
				makeReading('2026-08-15', 1100, 520), // +100 / +20
				makeReading('2026-08-31', 1150, 600), // +50 / +80
				makeReading('2026-09-30', 1300, 700), // other month
			]

			const result = service['sumMonthDiffs'](readings, sheetKind(UtilityType.electricity), '2026-08')

			expect(result).toEqual({ high: 150, low: 100, total: 250, readingCount: 2 })
		})

		it('ignores the very first reading (nothing to diff against)', () => {
			const readings = [makeReading('2026-08-01', 10), makeReading('2026-08-31', 12.5)]

			expect(service['sumMonthDiffs'](readings, sheetKind(UtilityType.gas), '2026-08')).toEqual({ high: 2.5, low: null, total: 2.5, readingCount: 1 })
		})

		it('returns zero when no reading falls in the month', () => {
			const readings = [makeReading('2026-07-31', 10), makeReading('2026-09-30', 20)]

			expect(service['sumMonthDiffs'](readings, sheetKind(UtilityType.water), '2026-08')).toEqual({ high: 0, low: null, total: 0, readingCount: 0 })
		})

		it('sums the values of an increment sheet dated within the month, including the first one', () => {
			const readings = [
				makeReading('2026-07-31', 300, 0),
				makeReading('2026-08-15', 120, 10),
				makeReading('2026-08-31', 80.5, 0),
			]

			expect(service['sumMonthDiffs'](readings, sheetKind(UtilityType.electricity, MeterEntryMode.increment), '2026-08'))
				.toEqual({ high: 200.5, low: 10, total: 210.5, readingCount: 2 })
		})
	})

	describe('withDiffs', () => {
		it('computes consumption since the previous reading, null for the first one', () => {
			const result = service['withDiffs']([makeReading('2026-01-31', 100, 40), makeReading('2026-02-28', 130.5, 50)], sheetKind(UtilityType.electricity))

			expect(result[0]).toEqual(expect.objectContaining({ diffHigh: null, diffLow: null, diffTotal: null }))
			expect(result[1]).toEqual(expect.objectContaining({ diffHigh: 30.5, diffLow: 10, diffTotal: 40.5 }))
		})

		it('uses the value itself as the consumption of an increment sheet', () => {
			const result = service['withDiffs']([makeReading('2026-01-31', 100, 40), makeReading('2026-02-28', 30, 0)], sheetKind(UtilityType.electricity, MeterEntryMode.increment))

			expect(result[0]).toEqual(expect.objectContaining({ diffHigh: 100, diffLow: 40, diffTotal: 140 }))
			expect(result[1]).toEqual(expect.objectContaining({ diffHigh: 30, diffLow: 0, diffTotal: 30 }))
		})
	})

	describe('normalizeReadingValues', () => {
		it('requires both tariffs for electricity', () => {
			expect(() => service['normalizeReadingValues'](UtilityType.electricity, { readingDate: '2026-01-31', valueHigh: 1 }))
				.toThrow(MetersTypes.InvalidReadingValuesError)
			expect(service['normalizeReadingValues'](UtilityType.electricity, { readingDate: '2026-01-31', valueHigh: 1, valueLow: 0 }))
				.toEqual({ readingDate: '2026-01-31', valueHigh: 1, valueLow: 0 })
		})

		it('rejects the low tariff for water and gas', () => {
			expect(() => service['normalizeReadingValues'](UtilityType.water, { readingDate: '2026-01-31', valueHigh: 1, valueLow: 2 }))
				.toThrow(MetersTypes.InvalidReadingValuesError)
			expect(service['normalizeReadingValues'](UtilityType.gas, { readingDate: '2026-01-31', valueHigh: 1, valueLow: null }))
				.toEqual({ readingDate: '2026-01-31', valueHigh: 1, valueLow: null })
		})
	})

	describe('DB', () => {
		let db: DbProvider

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			service = new MetersService(db)
		})

		it('lists active sheets with their last reading; archived only on request', async () => {
			const house = await service.createSheet('Dům – elektřina', UtilityType.electricity)
			const car = await service.createSheet('Elektroauto', UtilityType.electricity)
			await service.createReading(house.guid, { readingDate: '2026-08-31', valueHigh: 100, valueLow: 50 })
			await service.createReading(house.guid, { readingDate: '2026-09-30', valueHigh: 120, valueLow: 60 })
			await service.updateSheet(car.guid, { archived: true })

			const active = await service.listSheets()
			const all = await service.listSheets(true)

			expect(active).toEqual([expect.objectContaining({ guid: house.guid, lastReadingDate: '2026-09-30', lastValueHigh: 120, lastValueLow: 60 })])
			expect(all.map((s) => s.name)).toEqual(['Dům – elektřina', 'Elektroauto'])
			expect(all[1]).toEqual(expect.objectContaining({ archived: true, lastReadingDate: null }))
		})

		it('rejects a duplicate sheet name and a blank name', async () => {
			await service.createSheet('Voda', UtilityType.water)

			await expect(service.createSheet('Voda', UtilityType.water)).rejects.toThrow(MetersTypes.DuplicateSheetNameError)
			await expect(service.createSheet('  ', UtilityType.water)).rejects.toThrow(MetersTypes.InvalidSheetNameError)
		})

		it('rejects a second reading on the same date for the same sheet, allows it on another sheet', async () => {
			const water = await service.createSheet('Voda', UtilityType.water)
			const gas = await service.createSheet('Plyn', UtilityType.gas)
			await service.createReading(water.guid, { readingDate: '2026-09-30', valueHigh: 1000 })

			await expect(service.createReading(water.guid, { readingDate: '2026-09-30', valueHigh: 1100 }))
				.rejects.toThrow(MetersTypes.DuplicateReadingDateError)
			await expect(service.createReading(gas.guid, { readingDate: '2026-09-30', valueHigh: 5 })).resolves.toBeDefined()
		})

		it('throws SheetNotFoundError for an unknown sheet', async () => {
			const unknown = '00000000-0000-0000-0000-000000000000'

			await expect(service.createReading(unknown, { readingDate: '2026-09-30', valueHigh: 1 })).rejects.toThrow(MetersTypes.SheetNotFoundError)
			await expect(service.removeSheet(unknown)).rejects.toThrow(MetersTypes.SheetNotFoundError)
			await expect(service.getMonthlyConsumption(unknown, '2026-09')).rejects.toThrow(MetersTypes.SheetNotFoundError)
		})

		it('deletes readings together with their sheet (cascade)', async () => {
			const water = await service.createSheet('Voda', UtilityType.water)
			await service.createReading(water.guid, { readingDate: '2026-09-30', valueHigh: 1000 })

			await service.removeSheet(water.guid)

			expect(await db.core.select().from(coreSchema.meterReading)).toEqual([])
		})

		it('lists readings newest first with consumption since the previous reading', async () => {
			const water = await service.createSheet('Voda', UtilityType.water)
			await service.createReading(water.guid, { readingDate: '2026-08-31', valueHigh: 1000 })
			await service.createReading(water.guid, { readingDate: '2026-09-30', valueHigh: 4500, note: ' po opravě ' })

			const readings = await service.listReadings(water.guid)

			expect(readings).toEqual([
				expect.objectContaining({ readingDate: '2026-09-30', diffHigh: 3500, diffLow: null, diffTotal: 3500, note: 'po opravě' }),
				expect.objectContaining({ readingDate: '2026-08-31', diffTotal: null }),
			])
		})

		it('computes monthly consumption from readings dated within the month', async () => {
			const house = await service.createSheet('Dům', UtilityType.electricity)
			await service.createReading(house.guid, { readingDate: '2026-07-31', valueHigh: 1000, valueLow: 500 })
			await service.createReading(house.guid, { readingDate: '2026-08-31', valueHigh: 1200, valueLow: 650 })
			await service.createReading(house.guid, { readingDate: '2026-09-30', valueHigh: 1250, valueLow: 700 })

			expect(await service.getMonthlyConsumption(house.guid, '2026-08'))
				.toEqual({ sheetGuid: house.guid, month: '2026-08', high: 200, low: 150, total: 350, readingCount: 1 })
		})

		it('computes monthly consumption of an increment sheet from its values', async () => {
			const charger = await service.createSheet('Elektroauto', UtilityType.electricity, MeterEntryMode.increment)
			expect(charger.entryMode).toBe(MeterEntryMode.increment)
			await service.createReading(charger.guid, { readingDate: '2026-08-31', valueHigh: 150, valueLow: 50 })
			await service.createReading(charger.guid, { readingDate: '2026-09-30', valueHigh: 90, valueLow: 0 })

			expect(await service.getMonthlyConsumption(charger.guid, '2026-08'))
				.toEqual(expect.objectContaining({ high: 150, low: 50, total: 200, readingCount: 1 }))
		})

		it('creates bulk readings all or nothing', async () => {
			const house = await service.createSheet('Dům', UtilityType.electricity)
			const water = await service.createSheet('Voda', UtilityType.water)
			await service.createReading(water.guid, { readingDate: '2026-09-30', valueHigh: 1000 })

			await expect(service.createReadingsBulk('2026-09-30', [
				{ sheetGuid: house.guid, valueHigh: 1, valueLow: 2 },
				{ sheetGuid: water.guid, valueHigh: 1100 }, // duplicate date
			])).rejects.toThrow(MetersTypes.DuplicateReadingDateError)
			expect(await service.listReadings(house.guid)).toEqual([])

			const created = await service.createReadingsBulk('2026-10-31', [
				{ sheetGuid: house.guid, valueHigh: 1, valueLow: 2 },
				{ sheetGuid: water.guid, valueHigh: 1100 },
			])
			expect(created).toHaveLength(2)
		})

		it('validates values per sheet utility in bulk', async () => {
			const house = await service.createSheet('Dům', UtilityType.electricity)

			await expect(service.createReadingsBulk('2026-09-30', [{ sheetGuid: house.guid, valueHigh: 1 }]))
				.rejects.toThrow(MetersTypes.InvalidReadingValuesError)
		})
	})
})
