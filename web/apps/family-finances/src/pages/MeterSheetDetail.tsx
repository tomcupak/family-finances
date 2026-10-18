import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { getMeters } from '../api/schema/meters/meters'
import type { ConsumptionBucket, MeterReadingWithDiff, MeterSheet } from '../api/schema/models'
import { ConsumptionInterval } from '../api/schema/models'
import { AppPaths } from '../appPaths'
import { ConsumptionChart } from '../components/ConsumptionChart'
import { Layout } from '../components/Layout'
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'
import { defaultReadingDate, ENTRY_MODE_LABEL, formatDate, formatDiff, formatValue, hasLowTariff, isIncrement, monthsAgoIso, parseNumberInput, todayIso, UTILITY_META } from '../utils/meters'

const { getMeterSheet, updateMeterSheet, removeMeterSheet, listMeterReadings, createMeterReading, removeMeterReading, getMeterConsumption } = getMeters()

export const MeterSheetDetailPage = () => {
	const { sheetGuid = '' } = useParams()
	const navigate = useNavigate()
	const [sheet, setSheet] = useState<MeterSheet | undefined>()
	const [readings, setReadings] = useState<MeterReadingWithDiff[] | undefined>()
	const [buckets, setBuckets] = useState<ConsumptionBucket[] | undefined>()
	const [interval, setInterval] = useState<ConsumptionInterval>(ConsumptionInterval.month)
	const [from, setFrom] = useState(() => monthsAgoIso(12))
	const [to, setTo] = useState(() => todayIso())
	const [error, setError] = useState<string | undefined>()
	const [renaming, setRenaming] = useState(false)

	const loadSheet = useCallback(() => {
		getMeterSheet(sheetGuid)
			.then(setSheet)
			.catch((err: unknown) => setError(apiErrorCode(err) === 'sheet_not_found' ? 'List odečtů neexistuje.' : 'Nepodařilo se načíst list.'))
	}, [sheetGuid])

	const loadReadings = useCallback(() => {
		listMeterReadings(sheetGuid).then(setReadings).catch(() => setError('Nepodařilo se načíst odečty.'))
	}, [sheetGuid])

	const loadConsumption = useCallback(() => {
		getMeterConsumption(sheetGuid, { from, to, interval }).then(setBuckets).catch(() => setError('Nepodařilo se načíst spotřebu.'))
	}, [sheetGuid, from, to, interval])

	useEffect(() => {
		loadSheet()
		loadReadings()
	}, [loadSheet, loadReadings])

	useEffect(() => {
		setBuckets(undefined)
		loadConsumption()
	}, [loadConsumption])

	const reloadAll = () => {
		loadSheet()
		loadReadings()
		loadConsumption()
	}

	const handleRemoveReading = async (guid: string) => {
		if (!window.confirm('Opravdu smazat tento odečet?')) return
		try {
			await removeMeterReading(guid)
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
		reloadAll()
	}

	const handleToggleArchived = async () => {
		if (!sheet) return
		try {
			setSheet(await updateMeterSheet(sheet.guid, { archived: !sheet.archived }))
		} catch (err) {
			setError(apiErrorMessage(err))
		}
	}

	const handleRemoveSheet = async () => {
		if (!sheet) return
		if (!window.confirm(`Opravdu smazat list „${sheet.name}" včetně všech jeho odečtů?`)) return
		try {
			await removeMeterSheet(sheet.guid)
			void navigate(AppPaths.Readings)
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	if (!sheet) {
		return (
			<Layout title="Odečty">
				<p><Link to={AppPaths.Readings}>← Zpět na listy</Link></p>
				{error ? <p className="ErrorText">{error}</p> : <p>Načítám…</p>}
			</Layout>
		)
	}

	const meta = UTILITY_META[sheet.utility]
	const twoTariffs = hasLowTariff(sheet.utility)
	const increment = isIncrement(sheet)

	return (
		<Layout title={sheet.name}>
			<div className="CardHeader" style={{ marginBottom: 16 }}>
				<p>
					<Link to={AppPaths.Readings}>← Zpět na listy</Link>
					<span className="Badge">{meta.label} ({meta.unit})</span>
					<span className="Badge">{ENTRY_MODE_LABEL[sheet.entryMode]}</span>
					{sheet.archived && <span className="Badge">archivovaný</span>}
				</p>
				<div className="RowActions">
					<button type="button" className="DeleteLink" onClick={() => setRenaming((r) => !r)}>Přejmenovat</button>
					<button type="button" className="DeleteLink" onClick={() => { void handleToggleArchived() }}>{sheet.archived ? 'Obnovit' : 'Archivovat'}</button>
					<button type="button" className="DeleteLink" onClick={() => { void handleRemoveSheet() }}>Smazat list</button>
				</div>
			</div>

			{renaming && (
				<RenameForm
					sheet={sheet}
					onDone={(updated) => { setSheet(updated); setRenaming(false) }}
					onCancel={() => setRenaming(false)}
				/>
			)}

			{error && <p className="ErrorText">{error}</p>}

			<h2 className="SectionTitle">Nový odečet</h2>
			{increment && <p className="SubText">Zadává se spotřeba za období končící datem odečtu (typicky za měsíc k jeho poslednímu dni) – nic se nedopočítává.</p>}
			<ReadingForm sheet={sheet} onCreated={reloadAll} />

			<div className="UtilityToolbar" style={{ marginTop: 24 }}>
				<div>
					<label htmlFor="from">Od</label>
					<input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
				</div>
				<div>
					<label htmlFor="to">Do</label>
					<input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
				</div>
				<div>
					<label htmlFor="interval">Interval</label>
					<select id="interval" value={interval} onChange={(e) => setInterval(e.target.value as ConsumptionInterval)}>
						<option value={ConsumptionInterval.day}>Den</option>
						<option value={ConsumptionInterval.week}>Týden</option>
						<option value={ConsumptionInterval.month}>Měsíc</option>
						<option value={ConsumptionInterval.year}>Rok</option>
					</select>
				</div>
			</div>

			<div className="Card" style={{ marginBottom: 24 }}>
				{buckets ? <ConsumptionChart buckets={buckets} unit={meta.unit} color={meta.color} interval={interval} /> : <p>Načítám…</p>}
			</div>

			<div className="TableScroll">
				<table>
					<thead>
						<tr>
							<th>Datum</th>
							{increment
								? <th>Spotřeba ({meta.unit})</th>
								: <>
									{twoTariffs ? <><th>NT</th><th>VT</th></> : <th>Stav ({meta.unit})</th>}
									<th>Spotřeba od minula ({meta.unit})</th>
								</>}
							<th>Poznámka</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{readings?.map((reading) => (
							<tr key={reading.guid}>
								<td>{formatDate(reading.readingDate)}</td>
								{!increment && twoTariffs && <td>{formatValue(reading.valueLow)}</td>}
								{!increment && <td>{formatValue(reading.valueHigh)}</td>}
								<td>
									{twoTariffs && reading.diffTotal !== null
										? <><strong>{formatDiff(reading.diffTotal)}</strong> <span className="SubText">(NT {formatDiff(reading.diffLow)}, VT {formatDiff(reading.diffHigh)})</span></>
										: formatDiff(reading.diffTotal)}
								</td>
								<td>{reading.note ?? ''}</td>
								<td className="RowActions"><button className="DeleteLink" onClick={() => { void handleRemoveReading(reading.guid) }}>Smazat</button></td>
							</tr>
						))}
						{readings?.length === 0 && (
							<tr><td colSpan={increment ? 4 : twoTariffs ? 6 : 5}>Zatím žádné odečty.</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</Layout>
	)
}

const ReadingForm: React.FC<{ sheet: MeterSheet; onCreated: () => void }> = ({ sheet, onCreated }) => {
	const twoTariffs = hasLowTariff(sheet.utility)
	const increment = isIncrement(sheet)
	const unit = UTILITY_META[sheet.utility].unit
	const [readingDate, setReadingDate] = useState(() => defaultReadingDate())
	const [high, setHigh] = useState('')
	const [low, setLow] = useState('')
	const [note, setNote] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		// An increment may be in one tariff only (e.g. charging at NT) - an empty tariff is then 0.
		const emptyAs = increment && (high.trim() || low.trim()) ? 0 : undefined
		const valueHigh = high.trim() ? parseNumberInput(high) : emptyAs
		const valueLow = low.trim() ? parseNumberInput(low) : emptyAs
		if (valueHigh === undefined || (twoTariffs && valueLow === undefined)) {
			setError(twoTariffs ? 'Vyplňte NT i VT (číslo).' : `Vyplňte ${increment ? 'spotřebu' : 'stav'} (číslo).`)
			return
		}

		setSubmitting(true)
		setError(undefined)
		try {
			await createMeterReading(sheet.guid, { readingDate, valueHigh, valueLow: twoTariffs ? valueLow : null, note: note.trim() || undefined })
			setHigh('')
			setLow('')
			setNote('')
			onCreated()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<>
			<form className="ReadingForm" onSubmit={(e) => { void handleSubmit(e) }}>
				<div>
					<label htmlFor="readingDate">Datum odečtu</label>
					<input id="readingDate" type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} required />
				</div>
				{twoTariffs && (
					<div>
						<label htmlFor="valueLow">{increment ? 'Spotřeba NT' : 'NT'} ({unit})</label>
						<input id="valueLow" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} required={!increment} />
					</div>
				)}
				<div>
					<label htmlFor="valueHigh">{increment ? (twoTariffs ? 'Spotřeba VT' : 'Spotřeba') : (twoTariffs ? 'VT' : 'Stav')} ({unit})</label>
					<input id="valueHigh" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} required={!(increment && twoTariffs)} />
				</div>
				<div>
					<label htmlFor="note">Poznámka</label>
					<input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
				</div>
				<button type="submit" disabled={submitting}>Přidat odečet</button>
			</form>
			{error && <p className="ErrorText">{error}</p>}
		</>
	)
}

const RenameForm: React.FC<{
	sheet: MeterSheet
	onDone: (sheet: MeterSheet) => void
	onCancel: () => void
}> = ({ sheet, onDone, onCancel }) => {
	const [name, setName] = useState(sheet.name)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim()) return
		try {
			onDone(await updateMeterSheet(sheet.guid, { name: name.trim() }))
		} catch (err) {
			setError(apiErrorMessage(err))
		}
	}

	return (
		<>
			<form className="ReadingForm" onSubmit={(e) => { void handleSubmit(e) }}>
				<div>
					<label htmlFor="sheet-rename">Název listu</label>
					<input id="sheet-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
				</div>
				<button type="submit">Uložit</button>
				<button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>
			</form>
			{error && <p className="ErrorText">{error}</p>}
		</>
	)
}
