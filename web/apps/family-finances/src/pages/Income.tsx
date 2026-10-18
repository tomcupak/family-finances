import React, { useEffect, useState } from 'react'

import { getIncome } from '../api/schema/income/income'
import type { IncomeMonth, IncomeYear, SaveIncomeMonth } from '../api/schema/models'
import { IncomeType } from '../api/schema/models'
import { Layout } from '../components/Layout'
import { useAccount } from '../store/account'
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'
import { formatMoney, formatSignedMoney } from '../utils/expenses'
import { DEFAULT_VACATION_ALLOWANCE, defaultCheckMonth, formatDays, HOURS_PER_DAY, INCOME_TYPE_LABEL, INCOME_TYPES, monthName, parseVacationAllowance, VACATION_ALLOWANCE_ERROR } from '../utils/income'
import { parseNumberInput } from '../utils/meters'

const { getIncomeYear, createIncomeYear, updateIncomeYear, removeIncomeYear, updateIncomeMonth } = getIncome()

export const IncomePage = () => {
	const { account } = useAccount()
	const [year, setYear] = useState(() => new Date().getFullYear())

	return (
		<Layout title="Příjmy">
			<div className="MonthSwitcher">
				<button type="button" className="SecondaryButton" aria-label="Předchozí rok" onClick={() => setYear((y) => y - 1)}>‹</button>
				<strong className="YearLabel">{year}</strong>
				<button type="button" className="SecondaryButton" aria-label="Další rok" onClick={() => setYear((y) => y + 1)}>›</button>
				{year !== new Date().getFullYear() && (
					<button type="button" className="SecondaryButton" onClick={() => setYear(new Date().getFullYear())}>Aktuální rok</button>
				)}
			</div>
			{account && <IncomeYearView key={`${account.guid}-${year}`} accountGuid={account.guid} year={year} />}
		</Layout>
	)
}

/** `undefined` = loading, `null` = the year has no income plan yet. */
type YearState = IncomeYear | null | undefined

const IncomeYearView: React.FC<{ accountGuid: string; year: number }> = ({ accountGuid, year }) => {
	const [data, setData] = useState<YearState>()
	const [error, setError] = useState<string | undefined>()

	useEffect(() => {
		let cancelled = false
		getIncomeYear(accountGuid, year)
			.then((result) => { if (!cancelled) setData(result) })
			.catch((err: unknown) => {
				if (cancelled) return
				if (apiErrorCode(err) === 'income_year_not_found') setData(null)
				else setError(apiErrorMessage(err, 'Nepodařilo se načíst příjmy.'))
			})
		return () => { cancelled = true }
	}, [accountGuid, year])

	const handleRemove = async () => {
		if (!window.confirm(`Smazat příjmový plán pro rok ${year} včetně všech měsíců?`)) return
		try {
			await removeIncomeYear(accountGuid, year)
			setData(null)
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	if (error) return <p className="ErrorText">{error}</p>
	if (data === undefined) return <p>Načítám…</p>
	if (data === null) return <CreateYearForm accountGuid={accountGuid} year={year} onCreated={setData} />

	const selfEmployed = data.type === IncomeType.self_employed

	return (
		<>
			{data.locked && <p className="Badge BadgeWarning LockedNotice">Rok je uzavřený daňovým přiznáním – příjmy nelze měnit.</p>}
			<div className="IncomeGrid">
				<MonthsTable accountGuid={accountGuid} data={data} onChange={setData} />
				<div className="IncomeSide">
					{selfEmployed && <VacationDays data={data} />}
					{selfEmployed && <VacationCheck data={data} />}
					<div className="Card">
						<h2 className="SectionTitle">Nastavení roku {year}</h2>
						<YearSettingsForm key={`${data.type}-${data.defaultHourlyRate}-${data.vacationAllowance}`} accountGuid={accountGuid} data={data} onSaved={setData} />
						{!data.locked && (
							<div className="FormActions">
								<button type="button" className="DeleteLink" onClick={() => { void handleRemove() }}>Smazat plán roku</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</>
	)
}

// ── Create / settings ───────────────────────────────────────────────────────

const CreateYearForm: React.FC<{
	accountGuid: string
	year: number
	onCreated: (data: IncomeYear) => void
}> = ({ accountGuid, year, onCreated }) => {
	const [type, setType] = useState<IncomeType>(IncomeType.self_employed)
	const [rate, setRate] = useState('')
	const [allowance, setAllowance] = useState(String(DEFAULT_VACATION_ALLOWANCE))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const selfEmployed = type === IncomeType.self_employed
		const defaultHourlyRate = selfEmployed ? parseNumberInput(rate) : undefined
		if ((defaultHourlyRate ?? 0) < 0) {
			setError('Hodinovka nesmí být záporná.')
			return
		}
		const vacationAllowance = selfEmployed ? parseVacationAllowance(allowance) : undefined
		if (vacationAllowance === null) {
			setError(VACATION_ALLOWANCE_ERROR)
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			onCreated(await createIncomeYear(accountGuid, {
				year,
				type,
				defaultHourlyRate: defaultHourlyRate === undefined ? null : Math.round(defaultHourlyRate * 100) / 100,
				vacationAllowance,
			}))
		} catch (err) {
			setError(apiErrorMessage(err))
			setSubmitting(false)
		}
	}

	return (
		<div className="Card">
			<h2 className="SectionTitle">Příjmový plán pro rok {year}</h2>
			<p>Pro tento rok zatím není příjmový plán. Založením se vytvoří 12 měsíců s pracovními dny podle českého kalendáře (víkendy a státní svátky).</p>
			<form onSubmit={(e) => { void handleSubmit(e) }}>
				<div className="ReadingForm">
					<div>
						<label htmlFor="income-new-type">Typ příjmu</label>
						<select id="income-new-type" value={type} onChange={(e) => setType(e.target.value as IncomeType)}>
							{INCOME_TYPES.map((t) => <option key={t} value={t}>{INCOME_TYPE_LABEL[t]}</option>)}
						</select>
					</div>
					{type === IncomeType.self_employed && (
						<div>
							<label htmlFor="income-new-rate">Výchozí hodinovka (Kč/h)</label>
							<input id="income-new-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 130 }} />
						</div>
					)}
					{type === IncomeType.self_employed && (
						<div>
							<label htmlFor="income-new-allowance">Dovolená na rok (dny)</label>
							<input id="income-new-allowance" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} style={{ width: 90 }} />
						</div>
					)}
					<div className="FormActions">
						<button type="submit" disabled={submitting}>Založit rok {year}</button>
					</div>
				</div>
			</form>
			{error && <p className="ErrorText">{error}</p>}
		</div>
	)
}

const YearSettingsForm: React.FC<{
	accountGuid: string
	data: IncomeYear
	onSaved: (data: IncomeYear) => void
}> = ({ accountGuid, data, onSaved }) => {
	const [type, setType] = useState<IncomeType>(data.type)
	const [rate, setRate] = useState(data.defaultHourlyRate === null ? '' : String(data.defaultHourlyRate))
	const [allowance, setAllowance] = useState(String(data.vacationAllowance))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const selfEmployed = type === IncomeType.self_employed

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const defaultHourlyRate = parseNumberInput(rate)
		if ((defaultHourlyRate ?? 0) < 0) {
			setError('Hodinovka nesmí být záporná.')
			return
		}
		// HPP doesn't show the field - omitted keeps the stored allowance.
		const vacationAllowance = selfEmployed ? parseVacationAllowance(allowance) : undefined
		if (vacationAllowance === null) {
			setError(VACATION_ALLOWANCE_ERROR)
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			onSaved(await updateIncomeYear(accountGuid, data.year, {
				type,
				defaultHourlyRate: defaultHourlyRate === undefined ? null : Math.round(defaultHourlyRate * 100) / 100,
				vacationAllowance,
			}))
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
					<label htmlFor="income-type">Typ příjmu</label>
					<select id="income-type" value={type} disabled={data.locked} onChange={(e) => setType(e.target.value as IncomeType)}>
						{INCOME_TYPES.map((t) => <option key={t} value={t}>{INCOME_TYPE_LABEL[t]}</option>)}
					</select>
				</div>
				<div>
					<label htmlFor="income-rate">Výchozí hodinovka (Kč/h)</label>
					<input id="income-rate" inputMode="decimal" value={rate} disabled={data.locked} onChange={(e) => setRate(e.target.value)} style={{ width: 130 }} />
				</div>
				{selfEmployed && (
					<div>
						<label htmlFor="income-allowance">Dovolená na rok (dny)</label>
						<input id="income-allowance" inputMode="decimal" value={allowance} disabled={data.locked} onChange={(e) => setAllowance(e.target.value)} style={{ width: 90 }} />
					</div>
				)}
			</div>
			<p className="SubText">Změna výchozí hodinovky se promítne do měsíců, které ještě mají tu původní.</p>
			{error && <p className="ErrorText">{error}</p>}
			{!data.locked && (
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit nastavení</button>
				</div>
			)}
		</form>
	)
}

// ── Months ──────────────────────────────────────────────────────────────────

const MonthsTable: React.FC<{
	accountGuid: string
	data: IncomeYear
	onChange: (data: IncomeYear) => void
}> = ({ accountGuid, data, onChange }) => {
	const [editing, setEditing] = useState<number | null>(null)
	const selfEmployed = data.type === IncomeType.self_employed
	const columns = selfEmployed ? 8 : 4
	const { totals } = data

	return (
		<div className="Card">
			<h2 className="SectionTitle">{selfEmployed ? 'OSVČ' : 'Zaměstnanec (HPP)'} – měsíce roku {data.year}</h2>
			<div className="TableScroll">
				<table>
					<thead>
						<tr>
							<th>Měsíc</th>
							{selfEmployed ? (
								<>
									<th className="NumberCell">Hodinovka</th>
									<th className="NumberCell">Prac. dny</th>
									<th className="NumberCell">Dovolená</th>
									<th className="NumberCell" title={`hodinovka × ${HOURS_PER_DAY} h × (prac. dny − dovolená)`}>Reálný výdělek</th>
									<th className="NumberCell">Očekávaná faktura</th>
									<th className="NumberCell" title="Σ reálného výdělku − Σ očekávaných faktur od ledna do tohoto měsíce">Dovolená – stav</th>
								</>
							) : (
								<>
									<th className="NumberCell">Hrubá mzda</th>
									<th className="NumberCell">Čistá mzda</th>
								</>
							)}
							<th />
						</tr>
					</thead>
					<tbody>
						{data.months.map((m) => editing === m.month ? (
							<tr key={m.guid} className="PriceFormRow">
								<td colSpan={columns}>
									<MonthForm
										accountGuid={accountGuid}
										year={data.year}
										month={m}
										selfEmployed={selfEmployed}
										onSaved={(next) => { setEditing(null); onChange(next) }}
										onCancel={() => setEditing(null)}
									/>
								</td>
							</tr>
						) : (
							<tr key={m.guid}>
								<td>{monthName(m.month)}</td>
								{selfEmployed ? (
									<>
										<td className="NumberCell">{formatMoney(m.hourlyRate)}</td>
										<td className="NumberCell">{m.workingDays}</td>
										<td className="NumberCell">{formatDays(m.vacationDays)}</td>
										<td className="NumberCell">{formatMoney(m.earned)}</td>
										<td className="NumberCell">{formatMoney(m.expectedInvoice)}</td>
										<td className={`NumberCell ${m.vacationBalance < 0 ? 'NegativeValue' : ''}`}>{formatSignedMoney(m.vacationBalance)}</td>
									</>
								) : (
									<>
										<td className="NumberCell">{formatMoney(m.grossSalary)}</td>
										<td className="NumberCell">
											{m.netSalary === null ? <span className="SubText">jako hrubá</span> : formatMoney(m.netSalary)}
										</td>
									</>
								)}
								<td className="RowActions">
									{!data.locked && editing === null && (
										<button type="button" className="DeleteLink" onClick={() => setEditing(m.month)}>Upravit</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="TotalRow">
							<td>Celkem</td>
							{selfEmployed ? (
								<>
									<td />
									<td className="NumberCell">{totals.workingDays}</td>
									<td className="NumberCell">{formatDays(totals.vacationDays)}</td>
									<td className="NumberCell">{formatMoney(totals.earned)}</td>
									<td className="NumberCell">{formatMoney(totals.expectedInvoice)}</td>
									<td />
								</>
							) : (
								<>
									<td className="NumberCell">{formatMoney(totals.grossSalary)}</td>
									<td className="NumberCell">{formatMoney(totals.netSalary)}</td>
								</>
							)}
							<td />
						</tr>
					</tfoot>
				</table>
			</div>
			{!selfEmployed && <p className="SubText">Bez vyplněné čisté mzdy se v přehledu počítá s hrubou.</p>}
		</div>
	)
}

const MonthForm: React.FC<{
	accountGuid: string
	year: number
	month: IncomeMonth
	selfEmployed: boolean
	onSaved: (data: IncomeYear) => void
	onCancel: () => void
}> = ({ accountGuid, year, month, selfEmployed, onSaved, onCancel }) => {
	const [gross, setGross] = useState(String(month.grossSalary))
	const [net, setNet] = useState(month.netSalary === null ? '' : String(month.netSalary))
	const [rate, setRate] = useState(String(month.hourlyRate))
	const [workingDays, setWorkingDays] = useState(String(month.workingDays))
	const [vacationDays, setVacationDays] = useState(String(month.vacationDays))
	const [invoice, setInvoice] = useState(String(month.expectedInvoice))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const id = (field: string) => `income-${month.month}-${field}`

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const values = {
			grossSalary: parseNumberInput(gross) ?? 0,
			netSalary: parseNumberInput(net),
			hourlyRate: parseNumberInput(rate) ?? 0,
			workingDays: parseNumberInput(workingDays) ?? 0,
			vacationDays: parseNumberInput(vacationDays) ?? 0,
			expectedInvoice: parseNumberInput(invoice) ?? 0,
		}
		if (Object.values(values).some((v) => v !== undefined && v < 0)) {
			setError('Hodnoty nesmí být záporné.')
			return
		}
		if (!Number.isInteger(values.workingDays) || values.workingDays > 31) {
			setError('Pracovní dny musí být celé číslo 0–31.')
			return
		}
		if (values.vacationDays > values.workingDays) {
			setError('Dovolená nesmí být delší než počet pracovních dnů.')
			return
		}
		const money = (value: number) => Math.round(value * 100) / 100
		const body: SaveIncomeMonth = {
			grossSalary: money(values.grossSalary),
			netSalary: values.netSalary === undefined ? null : money(values.netSalary),
			hourlyRate: money(values.hourlyRate),
			workingDays: values.workingDays,
			vacationDays: Math.round(values.vacationDays * 10) / 10,
			expectedInvoice: money(values.expectedInvoice),
		}
		setSubmitting(true)
		setError(undefined)
		try {
			onSaved(await updateIncomeMonth(accountGuid, year, month.month, body))
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
				{selfEmployed ? (
					<>
						<div>
							<label htmlFor={id('rate')}>Hodinovka (Kč/h)</label>
							<input id={id('rate')} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 100 }} autoFocus />
						</div>
						<div>
							<label htmlFor={id('days')}>Prac. dny</label>
							<input id={id('days')} inputMode="numeric" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} style={{ width: 70 }} />
						</div>
						<div>
							<label htmlFor={id('vacation')}>Dovolená (dny)</label>
							<input id={id('vacation')} inputMode="decimal" value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} style={{ width: 70 }} />
						</div>
						<div>
							<label htmlFor={id('invoice')}>Očekávaná faktura (Kč)</label>
							<input id={id('invoice')} inputMode="decimal" value={invoice} onChange={(e) => setInvoice(e.target.value)} style={{ width: 130 }} />
						</div>
					</>
				) : (
					<>
						<div>
							<label htmlFor={id('gross')}>Hrubá mzda (Kč)</label>
							<input id={id('gross')} inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} style={{ width: 130 }} autoFocus />
						</div>
						<div>
							<label htmlFor={id('net')}>Čistá mzda (Kč)</label>
							<input id={id('net')} inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="jako hrubá" style={{ width: 130 }} />
						</div>
					</>
				)}
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit</button>
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

// ── Vacation days (OSVČ) ────────────────────────────────────────────────────

const VacationDays: React.FC<{ data: IncomeYear }> = ({ data }) => (
	<div className="Card">
		<h2 className="SectionTitle">Dny dovolené {data.year}</h2>
		<table>
			<tbody>
				<tr>
					<td>Dovolená na rok</td>
					<td className="NumberCell">{formatDays(data.vacationAllowance)}</td>
				</tr>
				<tr>
					<td>− Přiřazeno do měsíců</td>
					<td className="NumberCell">{formatDays(data.totals.vacationDays)}</td>
				</tr>
			</tbody>
			<tfoot>
				<tr className="TotalRow">
					<td>Zbývá přiřadit</td>
					<td className={`NumberCell ${data.vacationRemaining < 0 ? 'NegativeValue' : ''}`}>{formatDays(data.vacationRemaining)}</td>
				</tr>
			</tfoot>
		</table>
		{data.vacationRemaining < 0 && <p className="SubText">V měsících je přiřazeno víc dovolené, než je nastaveno na rok.</p>}
	</div>
)

// ── Vacation check (OSVČ) ───────────────────────────────────────────────────

const VacationCheck: React.FC<{ data: IncomeYear }> = ({ data }) => {
	const [upTo, setUpTo] = useState(() => defaultCheckMonth(data.year))
	const included = data.months.filter((m) => m.month <= upTo)
	const invoices = included.reduce((sum, m) => sum + m.expectedInvoice, 0)
	const earned = included.reduce((sum, m) => sum + m.earned, 0)
	const balance = included.at(-1)?.vacationBalance ?? 0

	return (
		<div className="Card">
			<h2 className="SectionTitle">Kontrola dovolené</h2>
			<div className="ReadingForm">
				<div>
					<label htmlFor="vacation-up-to">Od ledna do (včetně)</label>
					<select id="vacation-up-to" value={upTo} onChange={(e) => setUpTo(Number(e.target.value))}>
						{data.months.map((m) => <option key={m.month} value={m.month}>{monthName(m.month)}</option>)}
					</select>
				</div>
			</div>
			<table>
				<tbody>
					<tr>
						<td>
							Reálný výdělek celkem
							<div className="SubText">hodinovka × {HOURS_PER_DAY} h × (prac. dny − dovolená)</div>
						</td>
						<td className="NumberCell">{formatMoney(earned)}</td>
					</tr>
					<tr>
						<td>− Očekávané faktury celkem</td>
						<td className="NumberCell">{formatMoney(invoices)}</td>
					</tr>
				</tbody>
				<tfoot>
					<tr className="TotalRow">
						<td>Výsledek</td>
						<td className={`NumberCell ${balance < 0 ? 'NegativeValue' : ''}`}>{formatSignedMoney(balance)}</td>
					</tr>
				</tfoot>
			</table>
			<p className="SubText">
				{balance >= 0
					? 'Kladné číslo: reálně jsem vydělal víc, než jsem si vyplatil – tolik má být na spořáku na dovolenou.'
					: 'Záporné číslo: vybral jsem víc dovolené, než jsem si zatím naspořil.'}
			</p>
		</div>
	)
}
