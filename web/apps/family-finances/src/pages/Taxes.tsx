import React, { useEffect, useState } from 'react'

import type { SaveTaxReturn, TaxAdvanceMonth, TaxReturn } from '../api/schema/models'
import { TaxAdvanceKind } from '../api/schema/models'
import { getTaxes } from '../api/schema/taxes/taxes'
import { Layout } from '../components/Layout'
import { useAccount } from '../store/account'
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'
import { formatMoney, formatSignedMoney } from '../utils/expenses'
import { monthName } from '../utils/income'
import { parseNumberInput } from '../utils/meters'
import type { TaxConstantKey } from '../utils/taxes'
import { ADVANCE_KIND_LABEL, ADVANCE_KINDS, isClosed, settlementLabel, TAX_CONSTANT_FIELDS } from '../utils/taxes'

const { getTaxReturn, createTaxReturn, updateTaxReturn, removeTaxReturn, setTaxAdvance, closeTaxReturn, reopenTaxReturn } = getTaxes()

/** Default year of the page: the previous one until its return is usually filed (end of June), then the current one. */
function defaultYear(today: Date = new Date()): number {
	return today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear()
}

export const TaxesPage = () => {
	const { account } = useAccount()
	const [year, setYear] = useState(() => defaultYear())

	return (
		<Layout title="Daně">
			<div className="MonthSwitcher">
				<button type="button" className="SecondaryButton" aria-label="Předchozí rok" onClick={() => setYear((y) => y - 1)}>‹</button>
				<strong className="YearLabel">{year}</strong>
				<button type="button" className="SecondaryButton" aria-label="Další rok" onClick={() => setYear((y) => y + 1)}>›</button>
				{year !== new Date().getFullYear() && (
					<button type="button" className="SecondaryButton" onClick={() => setYear(new Date().getFullYear())}>Aktuální rok</button>
				)}
			</div>
			{account && <TaxYearView key={`${account.guid}-${year}`} accountGuid={account.guid} year={year} />}
		</Layout>
	)
}

/** `undefined` = loading, `null` = the year has no tax return yet. */
type ReturnState = TaxReturn | null | undefined

const TaxYearView: React.FC<{ accountGuid: string; year: number }> = ({ accountGuid, year }) => {
	const [data, setData] = useState<ReturnState>()
	const [error, setError] = useState<string | undefined>()
	const [actionError, setActionError] = useState<string | undefined>()
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		let cancelled = false
		getTaxReturn(accountGuid, year)
			.then((result) => { if (!cancelled) setData(result) })
			.catch((err: unknown) => {
				if (cancelled) return
				if (apiErrorCode(err) === 'tax_return_not_found') setData(null)
				else setError(apiErrorMessage(err, 'Nepodařilo se načíst daňové přiznání.'))
			})
		return () => { cancelled = true }
	}, [accountGuid, year])

	const runAction = async (action: () => Promise<TaxReturn | null>) => {
		setBusy(true)
		setActionError(undefined)
		try {
			setData(await action())
		} catch (err) {
			setActionError(apiErrorMessage(err, 'Akce se nezdařila.'))
		} finally {
			setBusy(false)
		}
	}

	const handleClose = () => {
		if (!window.confirm(`Uzavřít rok ${year}? Přiznání, zálohy ani příjmy roku pak nepůjde měnit (dokud rok znovu neotevřete).`)) return
		void runAction(() => closeTaxReturn(accountGuid, year))
	}

	const handleRemove = () => {
		if (!window.confirm(`Smazat daňové přiznání za rok ${year} včetně všech záloh?`)) return
		void runAction(async () => { await removeTaxReturn(accountGuid, year); return null })
	}

	if (error) return <p className="ErrorText">{error}</p>
	if (data === undefined) return <p>Načítám…</p>
	if (data === null) return <CreateReturnCard accountGuid={accountGuid} year={year} onCreated={setData} />

	const closed = isClosed(data)

	return (
		<>
			<div className="Card TaxStatusBar">
				{closed ? (
					<span className="Badge BadgeSuccess">Uzavřeno {new Date(data.closedAt ?? '').toLocaleDateString('cs-CZ')}</span>
				) : (
					<span className="Badge BadgeMuted">Otevřeno</span>
				)}
				<span className="SubText">
					{closed
						? 'Přiznání, zálohy i příjmy roku jsou zamčené.'
						: data.canClose ? 'Rok už skončil – po podání přiznání ho uzavřete.' : 'Uzavřít půjde až po skončení roku.'}
				</span>
				<div className="FormActions">
					{closed ? (
						<button type="button" className="SecondaryButton" disabled={busy} onClick={() => { void runAction(() => reopenTaxReturn(accountGuid, year)) }}>Znovu otevřít</button>
					) : (
						<>
							<button type="button" disabled={busy || !data.canClose} onClick={handleClose}>Uzavřít rok</button>
							<button type="button" className="DeleteLink" disabled={busy} onClick={handleRemove}>Smazat přiznání</button>
						</>
					)}
				</div>
				{actionError && <p className="ErrorText">{actionError}</p>}
			</div>
			<div className="IncomeGrid">
				<div className="IncomeSide">
					<CalculationCard data={data} />
					<AdvancesCard accountGuid={accountGuid} data={data} onChange={setData} />
				</div>
				<div className="IncomeSide">
					<SettlementCard data={data} />
					<div className="Card">
						<h2 className="SectionTitle">Konstanty roku {year}</h2>
						<ConstantsForm key={data.guid + String(closed)} accountGuid={accountGuid} data={data} onSaved={setData} />
					</div>
				</div>
			</div>
		</>
	)
}

// ── Create ──────────────────────────────────────────────────────────────────

const CreateReturnCard: React.FC<{
	accountGuid: string
	year: number
	onCreated: (data: TaxReturn) => void
}> = ({ accountGuid, year, onCreated }) => {
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleCreate = async () => {
		setSubmitting(true)
		setError(undefined)
		try {
			onCreated(await createTaxReturn(accountGuid, { year }))
		} catch (err) {
			setError(apiErrorMessage(err))
			setSubmitting(false)
		}
	}

	return (
		<div className="Card">
			<h2 className="SectionTitle">Daňové přiznání za rok {year}</h2>
			<p>Pro tento rok zatím není daňové přiznání. Konstanty (sazby, minima, slevy) se převezmou z posledního předchozího přiznání, jinak se použijí výchozí. Příjem se počítá z očekávaných faktur v Příjmech.</p>
			<div className="FormActions">
				<button type="button" disabled={submitting} onClick={() => { void handleCreate() }}>Založit přiznání {year}</button>
			</div>
			{error && <p className="ErrorText">{error}</p>}
		</div>
	)
}

// ── Calculation & settlement ────────────────────────────────────────────────

const CalculationCard: React.FC<{ data: TaxReturn }> = ({ data }) => {
	const c = data.calculation
	const pct = (value: number) => `${value.toLocaleString('cs-CZ')} %`
	const rows: { label: string; hint: string; value: number; total?: boolean }[] = [
		{ label: 'Příjem', hint: data.incomeOverride !== null ? 'ručně zadaný' : 'Σ očekávaných faktur roku', value: c.income },
		{ label: 'Základ daně', hint: `příjem × (100 % − ${pct(data.expenseRatePct)})`, value: c.taxBase },
		{ label: 'Daň', hint: `základ × ${pct(data.taxRatePct)}`, value: c.tax },
		{ label: 'Vyměřovací základ', hint: `základ × ${pct(data.assessmentBasePct)}`, value: c.assessmentBase },
		{ label: 'Sociální pojištění', hint: `vyměř. základ × ${pct(data.socialRatePct)}, min. ${formatMoney(data.socialMin)}`, value: c.social },
		{ label: 'Zdravotní pojištění', hint: `vyměř. základ × ${pct(data.healthRatePct)}, min. ${formatMoney(data.healthMin)}`, value: c.health },
		{ label: 'Daň po slevách', hint: 'max(daň − poplatník − manžel/ka, 0) − děti; záporná = daňový bonus', value: c.taxAfterDiscounts },
		{ label: 'Hrubý příjem / měsíc', hint: 'příjem / 12', value: c.grossMonthly },
		{ label: 'Čistý příjem', hint: 'příjem − sociální − zdravotní − daň po slevách', value: c.net, total: true },
		{ label: 'Čistý příjem / měsíc', hint: 'čistý / 12', value: c.netMonthly, total: true },
	]

	return (
		<div className="Card">
			<h2 className="SectionTitle">Výpočet</h2>
			{data.incomeOverride === null && data.plannedIncome === null && (
				<p className="SubText">Pro tento rok není příjmový plán – příjem je 0, dokud ho nezadáte v Příjmech nebo ručně v konstantách.</p>
			)}
			<table>
				<tbody>
					{rows.map((row) => (
						<tr key={row.label} className={row.total ? 'TotalRow' : undefined}>
							<td>
								{row.label}
								<div className="SubText">{row.hint}</div>
							</td>
							<td className={`NumberCell ${row.value < 0 ? 'NegativeValue' : ''}`}>{formatMoney(row.value)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

const SettlementCard: React.FC<{ data: TaxReturn }> = ({ data }) => (
	<div className="Card">
		<h2 className="SectionTitle">Doplatek / přeplatek</h2>
		<div className="TableScroll">
			<table>
				<thead>
					<tr>
						<th />
						<th className="NumberCell">Vypočteno</th>
						<th className="NumberCell">Zálohy</th>
						<th className="NumberCell">Rozdíl</th>
					</tr>
				</thead>
				<tbody>
					{data.settlement.map((s) => (
						<tr key={s.kind}>
							<td>{ADVANCE_KIND_LABEL[s.kind]}</td>
							<td className="NumberCell">{formatMoney(s.computed)}</td>
							<td className="NumberCell">{formatMoney(s.paid)}</td>
							<td className="NumberCell">
								<span className={s.difference > 0 ? 'NegativeValue' : undefined}>{formatSignedMoney(s.difference)}</span>
								<div className="SubText">{settlementLabel(s.difference)}</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
		<p className="SubText">Kladný rozdíl = doplatek, záporný = přeplatek (u daně i daňový bonus).</p>
	</div>
)

// ── Advances ────────────────────────────────────────────────────────────────

const AdvancesCard: React.FC<{
	accountGuid: string
	data: TaxReturn
	onChange: (data: TaxReturn) => void
}> = ({ accountGuid, data, onChange }) => {
	const [editing, setEditing] = useState<number | null>(null)
	const closed = isClosed(data)

	return (
		<div className="Card">
			<h2 className="SectionTitle">Zálohy</h2>
			<div className="TableScroll">
				<table>
					<thead>
						<tr>
							<th>Měsíc</th>
							{ADVANCE_KINDS.map((kind) => <th key={kind} className="NumberCell">{ADVANCE_KIND_LABEL[kind]}</th>)}
							<th />
						</tr>
					</thead>
					<tbody>
						{data.advances.map((m) => editing === m.month ? (
							<tr key={m.month} className="PriceFormRow">
								<td colSpan={5}>
									<AdvanceForm
										accountGuid={accountGuid}
										year={data.year}
										month={m}
										onSaved={(next) => { setEditing(null); onChange(next) }}
										onCancel={() => setEditing(null)}
									/>
								</td>
							</tr>
						) : (
							<tr key={m.month}>
								<td>{monthName(m.month)}</td>
								{ADVANCE_KINDS.map((kind) => <td key={kind} className="NumberCell">{formatMoney(m[kind])}</td>)}
								<td className="RowActions">
									{!closed && editing === null && (
										<button type="button" className="DeleteLink" onClick={() => setEditing(m.month)}>Upravit</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="TotalRow">
							<td>Celkem</td>
							{ADVANCE_KINDS.map((kind) => <td key={kind} className="NumberCell">{formatMoney(data.advanceTotals[kind])}</td>)}
							<td />
						</tr>
					</tfoot>
				</table>
			</div>
			<p className="SubText">„Nastavit od měsíce“ zkopíruje částku do všech následujících měsíců roku; jednotlivé měsíce pak jde upravit zvlášť.</p>
		</div>
	)
}

const AdvanceForm: React.FC<{
	accountGuid: string
	year: number
	month: TaxAdvanceMonth
	onSaved: (data: TaxReturn) => void
	onCancel: () => void
}> = ({ accountGuid, year, month, onSaved, onCancel }) => {
	const [kind, setKind] = useState<TaxAdvanceKind>(TaxAdvanceKind.social)
	const [amount, setAmount] = useState(String(month.social))
	const [following, setFollowing] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const id = (field: string) => `advance-${month.month}-${field}`

	const handleKind = (next: TaxAdvanceKind) => {
		setKind(next)
		setAmount(String(month[next]))
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const value = parseNumberInput(amount) ?? 0
		if (value < 0) {
			setError('Záloha nesmí být záporná.')
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			onSaved(await setTaxAdvance(accountGuid, year, month.month, kind, {
				amount: Math.round(value * 100) / 100,
				applyToFollowingMonths: following,
			}))
		} catch (err) {
			setError(apiErrorMessage(err))
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="ReadingForm">
				<div>
					<label>Měsíc</label>
					<strong>{monthName(month.month)}</strong>
				</div>
				<div>
					<label htmlFor={id('kind')}>Záloha</label>
					<select id={id('kind')} value={kind} onChange={(e) => handleKind(e.target.value as TaxAdvanceKind)}>
						{ADVANCE_KINDS.map((k) => <option key={k} value={k}>{ADVANCE_KIND_LABEL[k]}</option>)}
					</select>
				</div>
				<div>
					<label htmlFor={id('amount')}>Částka (Kč)</label>
					<input id={id('amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} autoFocus />
				</div>
				<label className="CheckboxLabel">
					<input type="checkbox" checked={following} onChange={(e) => setFollowing(e.target.checked)} />
					Nastavit od měsíce (i do všech dalších měsíců)
				</label>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit</button>
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

// ── Constants ───────────────────────────────────────────────────────────────

const ConstantsForm: React.FC<{
	accountGuid: string
	data: TaxReturn
	onSaved: (data: TaxReturn) => void
}> = ({ accountGuid, data, onSaved }) => {
	const closed = isClosed(data)
	const [values, setValues] = useState<Record<TaxConstantKey, string>>(() => {
		const initial = {} as Record<TaxConstantKey, string>
		for (const field of TAX_CONSTANT_FIELDS) initial[field.key] = String(data[field.key])
		return initial
	})
	const [incomeOverride, setIncomeOverride] = useState(data.incomeOverride === null ? '' : String(data.incomeOverride))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const [saved, setSaved] = useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const body = { incomeOverride: null } as SaveTaxReturn
		for (const field of TAX_CONSTANT_FIELDS) {
			const value = parseNumberInput(values[field.key])
			if (value === undefined || value < 0 || (field.unit === '%' && value > 100)) {
				setError(`${field.label}: zadejte číslo ${field.unit === '%' ? '0–100' : '≥ 0'}.`)
				return
			}
			body[field.key] = Math.round(value * 100) / 100
		}
		const override = parseNumberInput(incomeOverride)
		if (override !== undefined && override < 0) {
			setError('Příjem nesmí být záporný.')
			return
		}
		body.incomeOverride = override === undefined ? null : Math.round(override * 100) / 100
		setSubmitting(true)
		setError(undefined)
		setSaved(false)
		try {
			onSaved(await updateTaxReturn(accountGuid, data.year, body))
			setSaved(true)
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="TaxConstants">
				<div>
					<label htmlFor="tax-income-override">Příjem (Kč)</label>
					<input
						id="tax-income-override"
						inputMode="decimal"
						value={incomeOverride}
						disabled={closed}
						placeholder={data.plannedIncome === null ? 'bez plánu = 0' : `z plánu: ${formatMoney(data.plannedIncome)}`}
						onChange={(e) => setIncomeOverride(e.target.value)}
					/>
				</div>
				{TAX_CONSTANT_FIELDS.map((field) => (
					<div key={field.key}>
						<label htmlFor={`tax-${field.key}`}>{field.label} ({field.unit})</label>
						<input
							id={`tax-${field.key}`}
							inputMode="decimal"
							value={values[field.key]}
							disabled={closed}
							onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
						/>
					</div>
				))}
			</div>
			<p className="SubText">Prázdný příjem = součet očekávaných faktur z Příjmů. Konstanty nového roku se převezmou z předchozího přiznání.</p>
			{error && <p className="ErrorText">{error}</p>}
			{saved && !error && <p className="SuccessText">Uloženo.</p>}
			{!closed && (
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit konstanty</button>
				</div>
			)}
		</form>
	)
}
