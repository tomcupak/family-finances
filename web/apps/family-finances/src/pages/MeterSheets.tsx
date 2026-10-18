import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { getMeters } from '../api/schema/meters/meters'
import type { BulkReadingEntry, MeterSheet } from '../api/schema/models'
import { MeterEntryMode, UtilityType } from '../api/schema/models'
import { AppPaths } from '../appPaths'
import { Layout } from '../components/Layout'
import { apiErrorMessage } from '../utils/apiError'
import { defaultReadingDate, ENTRY_MODE_LABEL, formatDate, formatDiff, formatValue, hasLowTariff, isIncrement, parseNumberInput, UTILITY_META } from '../utils/meters'

const { listMeterSheets, createMeterSheet, updateMeterSheet, createMeterReadingsBulk } = getMeters()

interface DraftValues {
	high: string
	low: string
}

const EMPTY_DRAFT: DraftValues = { high: '', low: '' }

export const MeterSheetsPage = () => {
	const [sheets, setSheets] = useState<MeterSheet[] | undefined>()
	const [showArchived, setShowArchived] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const load = useCallback(() => {
		listMeterSheets({ includeArchived: showArchived })
			.then((list) => { setSheets(list); setError(undefined) })
			.catch(() => setError('Nepodařilo se načíst listy odečtů.'))
	}, [showArchived])

	useEffect(() => {
		load()
	}, [load])

	const handleToggleArchived = async (sheet: MeterSheet) => {
		try {
			await updateMeterSheet(sheet.guid, { archived: !sheet.archived })
			load()
		} catch (err) {
			setError(apiErrorMessage(err))
		}
	}

	return (
		<Layout title="Odečty">
			<p>Listy odečtů jsou společné pro všechny účty (např. „Dům – elektřina", „Elektroauto"). Elektřina se zadává v kWh (NT a VT), voda v litrech, plyn v m³. List zadávaný jako přírůstek (např. nabíječka auta) neukládá stav měřidla, ale rovnou spotřebu za období končící datem odečtu.</p>

			<h2 className="SectionTitle">Nový list</h2>
			<CreateSheetForm onCreated={load} />

			{error && <p className="ErrorText">{error}</p>}

			<BulkEntry sheets={sheets} onSaved={load} onToggleArchived={(s) => { void handleToggleArchived(s) }} />

			<label className="CheckboxLabel">
				<input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
				Zobrazit archivované listy
			</label>
		</Layout>
	)
}

const CreateSheetForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
	const [name, setName] = useState('')
	const [utility, setUtility] = useState<UtilityType>(UtilityType.electricity)
	const [entryMode, setEntryMode] = useState<MeterEntryMode>(MeterEntryMode.state)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim()) return
		setSubmitting(true)
		setError(undefined)
		try {
			await createMeterSheet({ name: name.trim(), utility, entryMode })
			setName('')
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
					<label htmlFor="sheet-name">Název</label>
					<input id="sheet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Dům – elektřina" maxLength={100} required />
				</div>
				<div>
					<label htmlFor="sheet-utility">Typ</label>
					<select id="sheet-utility" value={utility} onChange={(e) => setUtility(e.target.value as UtilityType)}>
						{Object.values(UtilityType).map((u) => (
							<option key={u} value={u}>{UTILITY_META[u].label} ({UTILITY_META[u].unit})</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="sheet-entry-mode">Zadává se</label>
					<select id="sheet-entry-mode" value={entryMode} onChange={(e) => setEntryMode(e.target.value as MeterEntryMode)}>
						{Object.values(MeterEntryMode).map((m) => (
							<option key={m} value={m}>{ENTRY_MODE_LABEL[m]}</option>
						))}
					</select>
				</div>
				<button type="submit" disabled={submitting}>Založit list</button>
			</form>
			{error && <p className="ErrorText">{error}</p>}
		</>
	)
}

/** Sheet overview doubling as quick entry: one date, new states for all active sheets at once. */
const BulkEntry: React.FC<{
	sheets: MeterSheet[] | undefined
	onSaved: () => void
	onToggleArchived: (sheet: MeterSheet) => void
}> = ({ sheets, onSaved, onToggleArchived }) => {
	const [readingDate, setReadingDate] = useState(() => defaultReadingDate())
	const [drafts, setDrafts] = useState<Record<string, DraftValues>>({})
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const [success, setSuccess] = useState<string | undefined>()

	const setDraft = (guid: string, patch: Partial<DraftValues>) => {
		setDrafts((current) => ({ ...current, [guid]: { ...(current[guid] ?? EMPTY_DRAFT), ...patch } }))
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(undefined)
		setSuccess(undefined)

		const entries: BulkReadingEntry[] = []
		for (const sheet of sheets ?? []) {
			const draft = drafts[sheet.guid]
			if (sheet.archived || !draft || (!draft.high.trim() && !draft.low.trim())) continue
			// An increment may be in one tariff only (e.g. charging at NT) - an empty tariff is then 0.
			const emptyAs = isIncrement(sheet) ? 0 : undefined
			const valueHigh = draft.high.trim() ? parseNumberInput(draft.high) : emptyAs
			const valueLow = draft.low.trim() ? parseNumberInput(draft.low) : emptyAs
			const needsLow = hasLowTariff(sheet.utility)
			if (valueHigh === undefined || (needsLow && valueLow === undefined)) {
				setError(`„${sheet.name}": ${needsLow ? 'vyplňte NT i VT' : 'vyplňte hodnotu'} (číslo).`)
				return
			}
			entries.push({ sheetGuid: sheet.guid, valueHigh, valueLow: needsLow ? valueLow : null })
		}
		if (entries.length === 0) {
			setError('Vyplňte alespoň jeden stav.')
			return
		}

		setSubmitting(true)
		try {
			await createMeterReadingsBulk({ readingDate, entries })
			setDrafts({})
			setSuccess(`Uloženo ${entries.length} ${entries.length === 1 ? 'odečet' : entries.length < 5 ? 'odečty' : 'odečtů'} k ${formatDate(readingDate)}.`)
			onSaved()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form className="Card" style={{ margin: '24px 0 12px' }} onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="CardHeader">
				<h2 className="SectionTitle">Listy a rychlé zadání odečtů</h2>
				<div className="ReadingForm" style={{ marginBottom: 0 }}>
					<div>
						<label htmlFor="bulk-date">Datum odečtu</label>
						<input id="bulk-date" type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} required />
					</div>
					<button type="submit" disabled={submitting || !sheets?.some((s) => !s.archived)}>Uložit odečty</button>
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
			{success && <p className="SuccessText">{success}</p>}

			<div className="TableScroll">
				<table className="BulkTable">
					<thead>
						<tr>
							<th>List</th>
							<th>Poslední odečet</th>
							<th>Poslední hodnota</th>
							<th>Nový stav / spotřeba</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{sheets?.map((sheet) => {
							const meta = UTILITY_META[sheet.utility]
							const draft = drafts[sheet.guid] ?? EMPTY_DRAFT
							const twoTariffs = hasLowTariff(sheet.utility)
							const increment = isIncrement(sheet)
							// The last value of an increment sheet is a consumption, not a state.
							const formatLast = increment ? formatDiff : formatValue
							return (
								<tr key={sheet.guid} className={sheet.archived ? 'MutedRow' : undefined}>
									<td>
										<span className="UtilityDot" style={{ background: meta.color }} />
										<Link to={`${AppPaths.Readings}/${sheet.guid}`}>{sheet.name}</Link>
										<div className="SubText">{meta.label} ({meta.unit}){increment && ' · přírůstky'}{sheet.archived && ' · archivovaný'}</div>
									</td>
									<td data-label="Poslední odečet">{formatDate(sheet.lastReadingDate)}</td>
									<td data-label={increment ? 'Poslední spotřeba' : 'Poslední stav'}>
										{twoTariffs
											? <>NT {formatLast(sheet.lastValueLow)}<br />VT {formatLast(sheet.lastValueHigh)}</>
											: formatLast(sheet.lastValueHigh)}
									</td>
									<td>
										{!sheet.archived && (
											<div className="InlineInputs">
												{twoTariffs && (
													<input
														aria-label={`${sheet.name} – NT`}
														placeholder={increment ? '+NT' : 'NT'}
														inputMode="decimal"
														value={draft.low}
														onChange={(e) => setDraft(sheet.guid, { low: e.target.value })}
													/>
												)}
												<input
													aria-label={`${sheet.name} – ${twoTariffs ? 'VT' : increment ? 'spotřeba' : 'stav'}`}
													placeholder={`${increment ? '+' : ''}${twoTariffs ? 'VT' : meta.unit}`}
													inputMode="decimal"
													value={draft.high}
													onChange={(e) => setDraft(sheet.guid, { high: e.target.value })}
												/>
											</div>
										)}
									</td>
									<td className="RowActions">
										<button type="button" className="DeleteLink" onClick={() => onToggleArchived(sheet)}>
											{sheet.archived ? 'Obnovit' : 'Archivovat'}
										</button>
									</td>
								</tr>
							)
						})}
						{sheets?.length === 0 && (
							<tr><td colSpan={5}>Zatím žádné listy odečtů.</td></tr>
						)}
						{!sheets && (
							<tr><td colSpan={5}>Načítám…</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</form>
	)
}
