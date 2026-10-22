import { DbProvider, ElectricityPriceMode } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'

import { ElectricityPricesService } from './electricity-prices.service'
import { ElectricityPricesTypes } from './electricity-prices.types'

const mockReturning = jest.fn()
const mockValues = jest.fn(() => ({ returning: mockReturning }))
const mockDb = {
	core: {
		insert: jest.fn(() => ({ values: mockValues })),
	},
}

let rowCount = 0

/** A DB row of a period - `fixed` by default. */
function makeRow(overrides: Partial<ElectricityPricesTypes.PricePeriodInput> & { guid?: string } = {}) {
	rowCount++
	return {
		guid: `period-${rowCount}`,
		supplierGuid: 'supplier',
		mode: ElectricityPriceMode.fixed,
		dateFrom: '2026-01-01',
		dateTo: null,
		vatIncluded: true,
		unitPrice: 4,
		consumptionHigh: null,
		consumptionLow: null,
		invoiceAmount: null,
		note: null,
		createdAt: new Date(2026, 0, 1, 0, 0, rowCount),
		...overrides,
	}
}

function makeSpot(dateFrom: string, dateTo: string, invoiceAmount: number, consumptionHigh = 100, consumptionLow: number | null = null, guid?: string) {
	return makeRow({ mode: ElectricityPriceMode.spot, dateFrom, dateTo, unitPrice: null, consumptionHigh, consumptionLow, invoiceAmount, ...(guid ? { guid } : {}) })
}

function makePeriodInput(overrides: Partial<ElectricityPricesTypes.PricePeriodInput> = {}): ElectricityPricesTypes.PricePeriodInput {
	return { mode: ElectricityPriceMode.fixed, dateFrom: '2026-01-01', dateTo: null, vatIncluded: true, unitPrice: 4.5, ...overrides }
}

describe('ElectricityPricesService', () => {
	let service: ElectricityPricesService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new ElectricityPricesService(mockDb as never)
	})

	describe('toPeriod', () => {
		const toPeriod = (row: ReturnType<typeof makeRow>) => service['toPeriod'](row)

		it('fixed without VAT: adds 21 % VAT, open-ended has no day count', () => {
			expect(toPeriod(makeRow({ unitPrice: 4, vatIncluded: false }))).toEqual(expect.objectContaining({
				days: null, consumptionTotal: null, unitPriceWithoutVat: 4, unitPriceWithVat: 4.84,
			}))
		})

		it('spot: invoice / (VT + NT), days inclusive', () => {
			expect(toPeriod(makeSpot('2026-01-01', '2026-03-31', 2000, 300, 100))).toEqual(expect.objectContaining({
				days: 90, consumptionTotal: 400, unitPriceWithoutVat: 4.1322, unitPriceWithVat: 5,
			}))
		})
	})

	describe('toPeriodValues', () => {
		const toValues = (input: Partial<ElectricityPricesTypes.PricePeriodInput>) => service['toPeriodValues'](makePeriodInput(input))

		it('keeps only the values of the mode', () => {
			expect(toValues({ consumptionHigh: 100, invoiceAmount: 500, note: ' smlouva ' })).toEqual(expect.objectContaining({
				unitPrice: 4.5, consumptionHigh: null, invoiceAmount: null, note: 'smlouva',
			}))
			expect(toValues({ mode: ElectricityPriceMode.spot, dateTo: '2026-01-31', consumptionHigh: 100, invoiceAmount: 500 })).toEqual(expect.objectContaining({
				unitPrice: null, consumptionHigh: 100, consumptionLow: null, invoiceAmount: 500,
			}))
		})

		it('rejects a range ending before it starts, and a spot period without an end', () => {
			expect(() => toValues({ dateTo: '2025-12-31' })).toThrow(ElectricityPricesTypes.InvalidPricePeriodRangeError)
			expect(() => toValues({ mode: ElectricityPriceMode.spot, consumptionHigh: 100, invoiceAmount: 500 })).toThrow(ElectricityPricesTypes.InvalidPricePeriodRangeError)
		})

		it('rejects missing values', () => {
			expect(() => toValues({ unitPrice: null })).toThrow(ElectricityPricesTypes.InvalidPricePeriodValuesError)
			expect(() => toValues({ mode: ElectricityPriceMode.spot, dateTo: '2026-01-31', consumptionHigh: 100 })).toThrow(ElectricityPricesTypes.InvalidPricePeriodValuesError)
			expect(() => toValues({ mode: ElectricityPriceMode.spot, dateTo: '2026-01-31', consumptionHigh: 0, consumptionLow: 0, invoiceAmount: 500 })).toThrow(ElectricityPricesTypes.InvalidPricePeriodValuesError)
		})
	})

	describe('priceMonth', () => {
		const priceMonth = (rows: ReturnType<typeof makeRow>[], month = '2026-09', withVat = true) =>
			service['priceMonth'](rows.map((row) => service['toPeriod'](row)), month, withVat)

		it('no periods: no price', () => {
			expect(priceMonth([])).toEqual({ unitPrice: null, confirmed: false, segments: [] })
		})

		it('one period covering the whole month', () => {
			expect(priceMonth([makeRow({ unitPrice: 4.84, guid: 'a' })])).toEqual({
				unitPrice: 4.84,
				confirmed: true,
				segments: [{ dateFrom: '2026-09-01', dateTo: '2026-09-30', days: 30, periodGuid: 'a', unitPrice: 4.84, estimated: false }],
			})
		})

		it('two periods within the month: day-weighted price', () => {
			const result = priceMonth([
				makeRow({ unitPrice: 4.84, dateTo: '2026-09-14', guid: 'a' }),
				makeSpot('2026-09-15', '2026-10-14', 500, 100, null, 'b'),
			])

			// (14 × 4.84 + 16 × 5) / 30
			expect(result.unitPrice).toBe(4.9253)
			expect(result.confirmed).toBe(true)
			expect(result.segments).toEqual([
				expect.objectContaining({ dateFrom: '2026-09-01', dateTo: '2026-09-14', days: 14, periodGuid: 'a', estimated: false }),
				expect.objectContaining({ dateFrom: '2026-09-15', dateTo: '2026-09-30', days: 16, periodGuid: 'b', estimated: false }),
			])
		})

		it('the later-starting period wins where periods overlap', () => {
			const result = priceMonth([
				makeRow({ unitPrice: 4, guid: 'fixed' }),
				makeSpot('2026-09-10', '2026-09-20', 600, 100, null, 'spot'),
			])

			// (9 × 4 + 11 × 6 + 10 × 4) / 30
			expect(result.unitPrice).toBe(4.7333)
			expect(result.segments.map((s) => [s.periodGuid, s.days])).toEqual([['fixed', 9], ['spot', 11], ['fixed', 10]])
		})

		it('without VAT: the periods\' prices without VAT', () => {
			const result = priceMonth([
				makeRow({ unitPrice: 4, vatIncluded: false, dateTo: '2026-09-14', guid: 'a' }),
				makeSpot('2026-09-15', '2026-10-14', 605, 100, null, 'b'),
			], '2026-09', false)

			// (14 × 4 + 16 × 5) / 30
			expect(result.unitPrice).toBe(4.5333)
			expect(result.segments.map((s) => s.unitPrice)).toEqual([4, 5])
		})

		it('days after the last period: estimated by it, not confirmed', () => {
			const result = priceMonth([makeSpot('2026-08-15', '2026-09-14', 500, 100, null, 'a')])

			expect(result.unitPrice).toBe(5)
			expect(result.confirmed).toBe(false)
			expect(result.segments).toEqual([
				expect.objectContaining({ dateTo: '2026-09-14', days: 14, periodGuid: 'a', estimated: false }),
				expect.objectContaining({ dateFrom: '2026-09-15', days: 16, periodGuid: 'a', estimated: true }),
			])
		})

		it('a gap is estimated by the period that ended last, days before the first period by the first one', () => {
			const result = priceMonth([
				makeSpot('2026-09-05', '2026-09-10', 400, 100, null, 'a'),
				makeSpot('2026-09-21', '2026-10-20', 600, 100, null, 'b'),
			])

			expect(result.confirmed).toBe(false)
			expect(result.segments.map((s) => [s.periodGuid, s.days, s.estimated])).toEqual([
				['a', 4, true], ['a', 6, false], ['a', 10, true], ['b', 10, false],
			])
			// (20 × 4 + 10 × 6) / 30
			expect(result.unitPrice).toBe(4.6667)
		})
	})

	describe('create validation', () => {
		it('trims the name and stores an empty location as null', async () => {
			mockReturning.mockResolvedValue([{ guid: 's', name: 'ČEZ', location: null, createdAt: new Date() }])

			const supplier = await service.create({ name: ' ČEZ ', location: '  ' })

			expect(mockValues).toHaveBeenCalledWith({ name: 'ČEZ', location: null })
			expect(supplier.label).toBe('ČEZ')
		})

		it('rejects a blank name', async () => {
			await expect(service.create({ name: '  ' })).rejects.toThrow(ElectricityPricesTypes.InvalidSupplierNameError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
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
			service = new ElectricityPricesService(db)
		})

		it('creates suppliers, lists them with periods newest first, labels by location', async () => {
			const home = await service.create({ name: 'ČEZ' })
			const cottage = await service.create({ name: 'ČEZ', location: 'Chata' })
			await service.createPeriod(home.guid, makePeriodInput({ dateFrom: '2026-01-01', dateTo: '2026-06-30' }))
			await service.createPeriod(home.guid, makePeriodInput({ mode: ElectricityPriceMode.spot, dateFrom: '2026-07-01', dateTo: '2026-09-30', consumptionHigh: 300, consumptionLow: 100, invoiceAmount: 2000 }))

			const list = await service.list()

			expect(list.map((s) => s.label)).toEqual(['ČEZ', 'ČEZ (Chata)'])
			expect(list[0]?.periods.map((p) => [p.dateFrom, p.unitPriceWithVat])).toEqual([['2026-07-01', 5], ['2026-01-01', 4.5]])
			expect(list[1]).toEqual(expect.objectContaining({ guid: cottage.guid, periods: [] }))
		})

		it('rejects a duplicate name + location, also without a location', async () => {
			await service.create({ name: 'ČEZ' })
			await service.create({ name: 'ČEZ', location: 'Chata' })

			await expect(service.create({ name: 'ČEZ' })).rejects.toThrow(ElectricityPricesTypes.DuplicateSupplierError)
			await expect(service.create({ name: 'ČEZ', location: 'Chata' })).rejects.toThrow(ElectricityPricesTypes.DuplicateSupplierError)
		})

		it('updates and removes periods only of their supplier', async () => {
			const a = await service.create({ name: 'ČEZ' })
			const b = await service.create({ name: 'E.ON' })
			const period = await service.createPeriod(a.guid, makePeriodInput())

			await expect(service.updatePeriod(b.guid, period.guid, makePeriodInput())).rejects.toThrow(ElectricityPricesTypes.PricePeriodNotFoundError)
			await expect(service.updatePeriod(a.guid, period.guid, makePeriodInput({ unitPrice: 5, vatIncluded: false })))
				.resolves.toEqual(expect.objectContaining({ unitPrice: 5, unitPriceWithVat: 6.05 }))
			await expect(service.removePeriod(b.guid, period.guid)).rejects.toThrow(ElectricityPricesTypes.PricePeriodNotFoundError)
			await service.removePeriod(a.guid, period.guid)
			expect((await service.list())[0]?.periods).toEqual([])
		})

		it('computes the month price from the stored periods', async () => {
			const supplier = await service.create({ name: 'ČEZ' })
			await service.createPeriod(supplier.guid, makePeriodInput({ unitPrice: 4, vatIncluded: false, dateTo: '2026-09-14' }))

			const price = await service.getMonthPrice(supplier.guid, '2026-09')

			expect(price).toEqual(expect.objectContaining({ month: '2026-09', withVat: true, unitPrice: 4.84, confirmed: false }))
			expect(await service.getMonthPrice(supplier.guid, '2026-09', false)).toEqual(expect.objectContaining({ withVat: false, unitPrice: 4 }))
			expect(price.supplier.label).toBe('ČEZ')
			await expect(service.getMonthPrice('00000000-0000-0000-0000-000000000000', '2026-09')).rejects.toThrow(ElectricityPricesTypes.SupplierNotFoundError)
		})
	})
})
