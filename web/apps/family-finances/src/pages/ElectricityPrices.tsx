import React, { useCallback, useEffect, useState } from 'react'

import { getElectricityPrices } from '../api/schema/electricity-prices/electricity-prices'
import type { PricePeriod, SavePricePeriod, Supplier, SupplierWithPeriods } from '../api/schema/models'
import { ElectricityPriceMode } from '../api/schema/models'
import { Layout } from '../components/Layout'
import { apiErrorMessage } from '../utils/apiError'
import { daysInclusive, formatKwhPrice, nextDay, PRICE_MODE_LABEL, PRICE_MODES, VAT_RATE_PCT } from '../utils/electricityPrices'
import { formatMoney } from '../utils/expenses'
import { formatDate, formatValue, parseNumberInput, todayIso } from '../utils/meters'

const {
	listElectricitySuppliers,
	createElectricitySupplier,
	updateElectricitySupplier,
	removeElectricitySupplier,
	createElectricityPricePeriod,
	updateElectricityPricePeriod,
	removeElectricityPricePeriod,
} = getElectricityPrices()

/** Global (not per account) like meter sheets - a supplier contract belongs to a supply point. */
export const ElectricityPricesPage = () => {
	const [suppliers, setSuppliers] = useState<SupplierWithPeriods[] | undefined>()
	const [editing, setEditing] = useState<Supplier | null>(null)
	// Bumped after every save so the (otherwise same-keyed) "new" form remounts empty instead of keeping the previous values
	const [formKey, setFormKey] = useState(0)
	const [error, setError] = useState<string | undefined>()

	const load = useCallback(() => {
		listElectricitySuppliers()
			.then((list) => { setSuppliers(list); setError(undefined) })
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst dodavatele.')))
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const handleRemove = async (supplier: Supplier) => {
		if (!window.confirm(`Smazat dodavatele „${supplier.label}" i s jeho cenami? Napojené náklady se vrátí k ručním měsíčním cenám.`)) return
		try {
			await removeElectricitySupplier(supplier.guid)
			if (editing?.guid === supplier.guid) setEditing(null)
			load()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	return (
		<Layout title="Ceny elektřiny">
			{error && <p className="ErrorText">{error}</p>}
			{!suppliers && !error && <p>Načítám…</p>}
			{suppliers?.length === 0 && (
				<div className="Card" style={{ marginBottom: 24 }}>
					<p>Zatím žádní dodavatelé. Přidejte dodavatele a k němu fixní cenu smlouvy nebo SPOT vyúčtování – cenu za kWh pak mohou převzít náklady na elektřinu.</p>
				</div>
			)}
			{suppliers?.map((supplier) => (
				<SupplierCard
					key={supplier.guid}
					supplier={supplier}
					onChanged={load}
					onEdit={() => setEditing(supplier)}
					onRemove={() => { void handleRemove(supplier) }}
				/>
			))}

			<div className="Card">
				<h2 className="SectionTitle">{editing ? `Upravit „${editing.label}"` : 'Nový dodavatel'}</h2>
				<SupplierForm
					key={editing?.guid ?? `new-${formKey}`}
					supplier={editing}
					onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load() }}
					onCancel={() => setEditing(null)}
				/>
				<p className="SubText">
					Lokalita je nepovinná – odliší dvě smlouvy u stejného dodavatele (např. dům a chata). Náklad na elektřinu se na dodavatele
					napojí v Nákladech → Definice nákladů.
				</p>
			</div>
		</Layout>
	)
}

const SupplierCard: React.FC<{
	supplier: SupplierWithPeriods
	onChanged: () => void
	onEdit: () => void
	onRemove: () => void
}> = ({ supplier, onChanged, onEdit, onRemove }) => {
	// `null` = closed, `'new'` = adding, otherwise the edited period's guid
	const [editing, setEditing] = useState<string | null>(null)
	const [error, setError] = useState<string | undefined>()

	const handleRemove = async (period: PricePeriod) => {
		if (!window.confirm(`Smazat cenu od ${formatDate(period.dateFrom)}?`)) return
		try {
			await removeElectricityPricePeriod(supplier.guid, period.guid)
			onChanged()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	const saved = () => {
		setEditing(null)
		onChanged()
	}

	return (
		<div className="Card" style={{ marginBottom: 24 }}>
			<div className="CardHeader">
				<h2 className="SectionTitle">{supplier.label}</h2>
				<div className="RowActions">
					<button type="button" className="DeleteLink" onClick={() => setEditing(editing === 'new' ? null : 'new')}>Přidat cenu</button>
					<button type="button" className="DeleteLink" onClick={onEdit}>Upravit</button>
					<button type="button" className="DeleteLink" onClick={onRemove}>Smazat</button>
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
			{editing === 'new' && (
				<PeriodForm key="new" supplierGuid={supplier.guid} period={null} lastPeriod={supplier.periods[0]} onSaved={saved} onCancel={() => setEditing(null)} />
			)}
			<div className="TableScroll">
				<table>
					<thead>
						<tr>
							<th>Období</th>
							<th>Režim</th>
							<th className="HideOnMobile">Zadáno</th>
							<th className="NumberCell HideOnMobile">Bez DPH</th>
							<th className="NumberCell">S DPH</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{supplier.periods.map((period) => (
							<React.Fragment key={period.guid}>
								<tr>
									<td>
										{formatDate(period.dateFrom)} – {period.dateTo ? formatDate(period.dateTo) : 'dále'}
										{period.days !== null && <div className="SubText">{period.days} dní</div>}
										{period.note && <div className="SubText">{period.note}</div>}
									</td>
									<td>{PRICE_MODE_LABEL[period.mode]}</td>
									<td className="HideOnMobile"><PeriodInput period={period} /></td>
									<td className="NumberCell HideOnMobile">{formatKwhPrice(period.unitPriceWithoutVat)}</td>
									<td className="NumberCell"><strong>{formatKwhPrice(period.unitPriceWithVat)}</strong></td>
									<td className="RowActions">
										<button type="button" className="DeleteLink" onClick={() => setEditing(editing === period.guid ? null : period.guid)}>Upravit</button>
										<button type="button" className="DeleteLink" onClick={() => { void handleRemove(period) }}>Smazat</button>
									</td>
								</tr>
								{editing === period.guid && (
									<tr className="PriceFormRow">
										<td colSpan={6}>
											<PeriodForm supplierGuid={supplier.guid} period={period} onSaved={saved} onCancel={() => setEditing(null)} />
										</td>
									</tr>
								)}
							</React.Fragment>
						))}
						{supplier.periods.length === 0 && <tr><td colSpan={6}>Zatím žádné ceny.</td></tr>}
					</tbody>
				</table>
			</div>
		</div>
	)
}

/** What was entered: the contract price, or the invoice and its consumption. */
const PeriodInput: React.FC<{ period: PricePeriod }> = ({ period }) => {
	const vat = period.vatIncluded ? 's DPH' : 'bez DPH'
	if (period.mode === ElectricityPriceMode.fixed) return <>{formatKwhPrice(period.unitPrice)} {vat}</>
	return (
		<>
			Faktura {formatMoney(period.invoiceAmount ?? 0)} {vat}
			<div className="SubText">
				VT {formatValue(period.consumptionHigh)} kWh
				{period.consumptionLow !== null && ` + NT ${formatValue(period.consumptionLow)} kWh`}
				{' '}= {formatValue(period.consumptionTotal)} kWh
			</div>
		</>
	)
}

const SupplierForm: React.FC<{
	supplier: Supplier | null
	onSaved: () => void
	onCancel: () => void
}> = ({ supplier, onSaved, onCancel }) => {
	const [name, setName] = useState(supplier?.name ?? '')
	const [location, setLocation] = useState(supplier?.location ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const body = { name: name.trim(), location: location.trim() || null }
		setSubmitting(true)
		setError(undefined)
		try {
			if (supplier) await updateElectricitySupplier(supplier.guid, body)
			else await createElectricitySupplier(body)
			onSaved()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="ReadingForm">
				<div>
					<label htmlFor="supplier-name">Dodavatel</label>
					<input id="supplier-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. ČEZ" maxLength={100} required />
				</div>
				<div>
					<label htmlFor="supplier-location">Lokalita (nepovinné)</label>
					<input id="supplier-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="např. Chata" maxLength={100} />
				</div>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>{supplier ? 'Uložit změny' : 'Přidat dodavatele'}</button>
					{supplier && <button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>}
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

const PeriodForm: React.FC<{
	supplierGuid: string
	period: PricePeriod | null
	/** Prefills a new period: same mode and VAT, starting the day after it ends. */
	lastPeriod?: PricePeriod
	onSaved: () => void
	onCancel: () => void
}> = ({ supplierGuid, period, lastPeriod, onSaved, onCancel }) => {
	const template = period ?? lastPeriod
	const [mode, setMode] = useState(template?.mode ?? ElectricityPriceMode.fixed)
	const [dateFrom, setDateFrom] = useState(period?.dateFrom ?? (lastPeriod?.dateTo ? nextDay(lastPeriod.dateTo) : todayIso()))
	const [dateTo, setDateTo] = useState(period?.dateTo ?? '')
	const [vatIncluded, setVatIncluded] = useState(template?.vatIncluded ?? true)
	const [unitPrice, setUnitPrice] = useState(period?.unitPrice === null || !period ? '' : String(period.unitPrice))
	const [high, setHigh] = useState(period?.consumptionHigh === null || !period ? '' : String(period.consumptionHigh))
	const [low, setLow] = useState(period?.consumptionLow === null || !period ? '' : String(period.consumptionLow))
	const [invoice, setInvoice] = useState(period?.invoiceAmount === null || !period ? '' : String(period.invoiceAmount))
	const [note, setNote] = useState(period?.note ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const isSpot = mode === ElectricityPriceMode.spot
	const consumption = (parseNumberInput(high) ?? 0) + (parseNumberInput(low) ?? 0)
	const entered = isSpot
		? (consumption > 0 ? (parseNumberInput(invoice) ?? 0) / consumption : undefined)
		: parseNumberInput(unitPrice)
	const vatFactor = 1 + VAT_RATE_PCT / 100
	const days = dateFrom && dateTo && dateTo >= dateFrom ? daysInclusive(dateFrom, dateTo) : undefined

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const round = (value: number | undefined, decimals: number) => value === undefined ? null : Math.round(value * 10 ** decimals) / 10 ** decimals
		const body: SavePricePeriod = {
			mode,
			dateFrom,
			dateTo: dateTo || null,
			vatIncluded,
			unitPrice: isSpot ? null : round(parseNumberInput(unitPrice), 4),
			consumptionHigh: isSpot ? round(parseNumberInput(high), 3) : null,
			consumptionLow: isSpot ? round(parseNumberInput(low), 3) : null,
			invoiceAmount: isSpot ? round(parseNumberInput(invoice), 2) : null,
			note: note.trim() || null,
		}
		setSubmitting(true)
		setError(undefined)
		try {
			if (period) await updateElectricityPricePeriod(supplierGuid, period.guid, body)
			else await createElectricityPricePeriod(supplierGuid, body)
			onSaved()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	const idPrefix = `period-${period?.guid ?? 'new'}-${supplierGuid}`

	return (
		<form onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="CorrectionModes">
				{PRICE_MODES.map((m) => (
					<label key={m} className="CheckboxLabel">
						<input type="radio" name={`${idPrefix}-mode`} checked={mode === m} onChange={() => setMode(m)} />
						{PRICE_MODE_LABEL[m]}
					</label>
				))}
			</div>
			<div className="ReadingForm">
				<div>
					<label htmlFor={`${idPrefix}-from`}>Od</label>
					<input id={`${idPrefix}-from`} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
				</div>
				<div>
					<label htmlFor={`${idPrefix}-to`}>{isSpot ? 'Do (včetně)' : 'Do (nepovinné)'}</label>
					<input id={`${idPrefix}-to`} type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} required={isSpot} />
				</div>
				{!isSpot && (
					<div>
						<label htmlFor={`${idPrefix}-price`}>Cena (Kč/kWh)</label>
						<input id={`${idPrefix}-price`} inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required style={{ width: 120 }} />
					</div>
				)}
				{isSpot && (
					<>
						<div>
							<label htmlFor={`${idPrefix}-high`}>Spotřeba VT (kWh)</label>
							<input id={`${idPrefix}-high`} inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} style={{ width: 120 }} />
						</div>
						<div>
							<label htmlFor={`${idPrefix}-low`}>Spotřeba NT (kWh)</label>
							<input id={`${idPrefix}-low`} inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} style={{ width: 120 }} />
						</div>
						<div>
							<label htmlFor={`${idPrefix}-invoice`}>Faktura (Kč)</label>
							<input id={`${idPrefix}-invoice`} inputMode="decimal" value={invoice} onChange={(e) => setInvoice(e.target.value)} required style={{ width: 130 }} />
						</div>
					</>
				)}
				<div>
					<label className="CheckboxLabel" style={{ marginBottom: 8 }}>
						<input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} />
						{isSpot ? 'Faktura je s DPH' : 'Cena je s DPH'}
					</label>
				</div>
				<div>
					<label htmlFor={`${idPrefix}-note`}>Poznámka</label>
					<input id={`${idPrefix}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
				</div>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>{period ? 'Uložit cenu' : 'Přidat cenu'}</button>
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zavřít</button>
				</div>
			</div>
			<p className="SubText">
				{days !== undefined && `${days} dní · `}
				{isSpot && `Spotřeba celkem ${formatValue(consumption)} kWh · `}
				{entered === undefined
					? 'Cena za kWh se spočítá po vyplnění.'
					: `Cena ${formatKwhPrice(vatIncluded ? entered / vatFactor : entered)} bez DPH, ${formatKwhPrice(vatIncluded ? entered : entered * vatFactor)} s DPH (DPH ${VAT_RATE_PCT} %).`}
				{!isSpot && ' Bez data do platí cena neomezeně.'} Kde se ceny překrývají, platí ta s pozdějším začátkem.
			</p>
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}
