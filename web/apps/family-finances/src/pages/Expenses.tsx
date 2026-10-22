import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { getElectricityPrices } from '../api/schema/electricity-prices/electricity-prices'
import { getExpenses } from '../api/schema/expenses/expenses'
import { getMeters } from '../api/schema/meters/meters'
import type { Correction, Expense, MeterSheet, MonthAdvances, MonthCorrection, MonthExpense, MonthExpenses, MonthPayment, Payee, SaveExpense, SupplierWithPeriods, UtilityCost } from '../api/schema/models'
import { ExpenseCategory, ExpenseRecurrence, UtilityType } from '../api/schema/models'
import { getPayees } from '../api/schema/payees/payees'
import { AppPaths } from '../appPaths'
import { Layout } from '../components/Layout'
import { MonthSwitcher } from '../components/MonthSwitcher'
import { useAccount } from '../store/account'
import { apiErrorMessage } from '../utils/apiError'
import { formatKwhPrice, formatSegments } from '../utils/electricityPrices'
import { addMonths, CATEGORIES, CATEGORY_LABEL, correctionLabel, currentMonth, formatMoney, formatMonth, formatSignedMoney, formatUnitPrice, isEnded, PRICE_UNIT, RECURRENCE_LABEL, RECURRENCES } from '../utils/expenses'
import { formatValue, hasLowTariff, parseNumberInput, UTILITY_META } from '../utils/meters'
import { ADVANCE_KIND_LABEL, ADVANCE_KINDS } from '../utils/taxes'
import { PayeesCard, PaymentsCard } from './ExpensePayees'

const {
	listExpenses,
	createExpense,
	updateExpense,
	removeExpense,
	getExpensesMonth,
	setExpenseUtilityPrice,
	removeExpenseUtilityPrice,
	createExpenseCorrection,
	removeExpenseCorrection,
} = getExpenses()
const { listMeterSheets } = getMeters()
const { listPayees } = getPayees()
const { listElectricitySuppliers } = getElectricityPrices()

enum Tab {
	Month = 'month',
	Definitions = 'definitions',
}

export const ExpensesPage = () => {
	const { account } = useAccount()
	const [tab, setTab] = useState(Tab.Month)

	return (
		<Layout title="Náklady">
			<div className="UtilityTabs">
				<button type="button" className={tab === Tab.Month ? 'active' : undefined} onClick={() => setTab(Tab.Month)}>Měsíční přehled</button>
				<button type="button" className={tab === Tab.Definitions ? 'active' : undefined} onClick={() => setTab(Tab.Definitions)}>Definice nákladů</button>
			</div>
			{account && tab === Tab.Month && <MonthView key={account.guid} accountGuid={account.guid} />}
			{account && tab === Tab.Definitions && <Definitions key={account.guid} accountGuid={account.guid} />}
		</Layout>
	)
}

// ── Month view ──────────────────────────────────────────────────────────────

enum EditKind {
	Price = 'price',
	Correction = 'correction',
}

const MonthView: React.FC<{ accountGuid: string }> = ({ accountGuid }) => {
	// Expenses are mostly settled after the month ends - open the previous month by default.
	const [month, setMonth] = useState(() => addMonths(currentMonth(), -1))
	const [data, setData] = useState<MonthExpenses | undefined>()
	const [error, setError] = useState<string | undefined>()
	const [editing, setEditing] = useState<{ guid: string; kind: EditKind } | null>(null)
	const [reloadKey, setReloadKey] = useState(0)

	useEffect(() => {
		let cancelled = false
		getExpensesMonth(accountGuid, month)
			.then((result) => { if (!cancelled) { setData(result); setError(undefined) } })
			.catch((err: unknown) => { if (!cancelled) setError(apiErrorMessage(err, 'Nepodařilo se načíst náklady.')) })
		return () => { cancelled = true }
	}, [accountGuid, month, reloadKey])

	const changeMonth = (next: string) => {
		setData(undefined)
		setEditing(null)
		setMonth(next)
	}

	const reload = () => {
		setEditing(null)
		setReloadKey((k) => k + 1)
	}

	const handleRemoveCorrection = async (correction: Correction, label: string) => {
		if (!window.confirm(`Smazat opravu „${label}"?`)) return
		try {
			await removeExpenseCorrection(accountGuid, correction.expenseGuid, correction.guid)
			reload()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	const isEditing = (guid: string, kind: EditKind) => editing?.guid === guid && editing.kind === kind
	const paymentOf = (expenseGuid: string) => data?.payments.find((p) => p.expenseGuids.includes(expenseGuid))

	return (
		<>
			<MonthSwitcher month={month} onChange={changeMonth} />
			{error && <p className="ErrorText">{error}</p>}

			<div className="ExpensesMonthGrid">
				<div className="Card">
					<h2 className="SectionTitle">Platby v měsíci {formatMonth(month)}</h2>
					<div className="TableScroll">
						<table>
							<thead>
								<tr>
									<th className="HideOnMobile">Kategorie</th>
									<th>Název</th>
									<th className="HideOnMobile">Opakování</th>
									<th className="NumberCell">Částka</th>
								</tr>
							</thead>
							<tbody>
								{/* Items come sorted by category - each category's corrections follow its items. */}
								{data && CATEGORIES.map((category) => (
									<React.Fragment key={category}>
										{data.items.filter((item) => item.category === category).map((item) => (
											<React.Fragment key={item.guid}>
												<tr>
													<td className="HideOnMobile">{CATEGORY_LABEL[item.category]}</td>
													<td>
														{item.name}
														{item.utility && <UtilityCostInfo cost={item.utility} />}
														<PayeeInfo payment={paymentOf(item.guid)} />
														{item.note && <div className="SubText">{item.note}</div>}
														{item.corrections.map((c) => (
															<div key={c.guid} className="SubText">
																Oprava {formatSignedMoney(c.amount)} ({correctionLabel(c.amount)}) → započte se v měsíci {formatMonth(c.applyMonth)}
																{c.note && ` · ${c.note}`}
																<button type="button" className="DeleteLink" onClick={() => { void handleRemoveCorrection(c, `${item.name} ${formatMonth(month)}`) }}>Smazat</button>
															</div>
														))}
													</td>
													<td className="HideOnMobile">{item.utility ? 'Dle odečtů' : RECURRENCE_LABEL[item.recurrence]}</td>
													<td className="NumberCell">
														{formatMoney(item.amount)}
														{editing?.guid !== item.guid && (
															<div>
																{item.utility && !item.utility.supplierGuid && (
																	<button type="button" className="DeleteLink" onClick={() => setEditing({ guid: item.guid, kind: EditKind.Price })}>
																		{item.utility.priceConfirmed ? 'Upravit cenu' : 'Potvrdit cenu'}
																	</button>
																)}
																<button type="button" className="DeleteLink" onClick={() => setEditing({ guid: item.guid, kind: EditKind.Correction })}>Oprava</button>
															</div>
														)}
													</td>
												</tr>
												{item.utility && isEditing(item.guid, EditKind.Price) && (
													<tr className="PriceFormRow">
														<td colSpan={4}>
															<PriceForm
																accountGuid={accountGuid}
																expense={item}
																cost={item.utility}
																month={month}
																onSaved={reload}
																onCancel={() => setEditing(null)}
															/>
														</td>
													</tr>
												)}
												{isEditing(item.guid, EditKind.Correction) && (
													<tr className="PriceFormRow">
														<td colSpan={4}>
															<CorrectionForm
																accountGuid={accountGuid}
																expense={item}
																month={month}
																onSaved={reload}
																onCancel={() => setEditing(null)}
															/>
														</td>
													</tr>
												)}
											</React.Fragment>
										))}
										{data.corrections.filter((c) => c.category === category).map((c) => (
											<CorrectionRow key={c.guid} correction={c} onRemove={() => { void handleRemoveCorrection(c, `${c.expenseName} ${formatMonth(c.forMonth)}`) }} />
										))}
										{category === ExpenseCategory.taxes && <TaxAdvanceRows advances={data.taxAdvances} />}
									</React.Fragment>
								))}
								{data?.items.length === 0 && data.corrections.length === 0 && data.taxAdvances.total === 0 && <tr><td colSpan={4}>V tomto měsíci se nic neplatí.</td></tr>}
								{!data && !error && <tr><td colSpan={4}>Načítám…</td></tr>}
							</tbody>
						</table>
					</div>
				</div>

				<div className="Card">
					<h2 className="SectionTitle">Součty podle kategorií</h2>
					<table>
						<tbody>
							{data?.categories.map((c) => (
								<tr key={c.category} className={c.total === 0 ? 'MutedRow' : undefined}>
									<td>{CATEGORY_LABEL[c.category]}</td>
									<td className="NumberCell">{formatMoney(c.total)}</td>
								</tr>
							))}
						</tbody>
						{data && (
							<tfoot>
								<tr className="TotalRow">
									<td>Celkem</td>
									<td className="NumberCell">{formatMoney(data.total)}</td>
								</tr>
							</tfoot>
						)}
					</table>
				</div>
			</div>

			{data && <PaymentsCard accountGuid={accountGuid} data={data} onChanged={reload} />}
		</>
	)
}

/** Who the item is paid to and whether that payment is already paid this month. */
const PayeeInfo: React.FC<{ payment: MonthPayment | undefined }> = ({ payment }) => {
	if (!payment) return null
	return (
		<div className="SubText">
			Platí se: {payment.payee.name}
			{payment.paidAt !== null && <span className="Badge BadgeSuccess">zaplaceno</span>}
		</div>
	)
}

/** Consumption and price of a meter-linked expense in the month. */
const UtilityCostInfo: React.FC<{ cost: UtilityCost }> = ({ cost }) => {
	const { unit } = UTILITY_META[cost.utility]
	let consumption: string
	if (cost.readingCount === 0) consumption = 'zatím bez odečtu'
	else if (cost.utility === UtilityType.electricity) consumption = `VT ${formatValue(cost.consumptionHigh)} ${unit}, NT ${formatValue(cost.consumptionLow)} ${unit}`
	else if (cost.utility === UtilityType.water) consumption = `${formatValue(cost.consumptionHigh)} ${unit} (${formatValue(cost.consumptionHigh / 1000)} m³)`
	else consumption = `${formatValue(cost.consumptionHigh)} ${unit}`

	if (cost.supplierGuid) return <SupplierCostInfo cost={cost} consumption={consumption} />

	let price = 'není zadaná'
	if (cost.unitPriceHigh !== null) {
		price = hasLowTariff(cost.utility)
			? `VT ${formatUnitPrice(cost.unitPriceHigh, cost.utility)}, NT ${cost.unitPriceLow === null ? 'jako VT' : formatUnitPrice(cost.unitPriceLow, cost.utility)}`
			: formatUnitPrice(cost.unitPriceHigh, cost.utility)
		if (cost.fixedFee) price += `, stálé platby ${formatMoney(cost.fixedFee)}`
	}

	return (
		<div className="SubText UtilityCostInfo">
			<div>List: {cost.sheetName} · Spotřeba: {consumption}</div>
			<div>
				Cena: {price}
				{cost.priceConfirmed && <span className="Badge BadgeSuccess">potvrzená</span>}
				{!cost.priceConfirmed && cost.priceMonth && <span className="Badge BadgeWarning">převzatá z {formatMonth(cost.priceMonth)}</span>}
				{!cost.priceMonth && <span className="Badge BadgeWarning">chybí cena</span>}
			</div>
		</div>
	)
}

/** Meter-linked electricity priced by its supplier's periods - edited on the Ceny elektřiny page. */
const SupplierCostInfo: React.FC<{ cost: UtilityCost; consumption: string }> = ({ cost, consumption }) => (
	<div className="SubText UtilityCostInfo">
		<div>List: {cost.sheetName} · Spotřeba: {consumption}</div>
		<div>
			Cena: {cost.unitPriceHigh === null ? 'dodavatel nemá žádnou cenu' : `${formatKwhPrice(cost.unitPriceHigh)} ${cost.supplierPriceWithVat ? 's DPH' : 'bez DPH'}`}
			{' '}dle <Link to={AppPaths.ElectricityPrices}>{cost.supplierLabel}</Link>
			{cost.priceConfirmed && <span className="Badge BadgeSuccess">potvrzená</span>}
			{!cost.priceConfirmed && cost.priceMonth && <span className="Badge BadgeWarning">část měsíce odhadem</span>}
			{!cost.priceMonth && <span className="Badge BadgeWarning">chybí cena</span>}
		</div>
		{cost.priceSegments.length > 1 && <div>{formatSegments(cost.priceSegments)}</div>}
		{cost.priceSegments.length === 1 && cost.priceSegments[0]?.estimated && <div>Celý měsíc odhadem: {formatSegments(cost.priceSegments)}</div>}
	</div>
)

/** Quick price edit - prefilled with the used (possibly inherited) price; saving confirms it for the month. */
const PriceForm: React.FC<{
	accountGuid: string
	expense: MonthExpense
	cost: UtilityCost
	month: string
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, expense, cost, month, onSaved, onCancel }) => {
	const [high, setHigh] = useState(cost.unitPriceHigh === null ? '' : String(cost.unitPriceHigh))
	const [low, setLow] = useState(cost.unitPriceLow === null ? '' : String(cost.unitPriceLow))
	const [fee, setFee] = useState(cost.fixedFee === null ? '' : String(cost.fixedFee))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const twoTariffs = hasLowTariff(cost.utility)
	const priceUnit = PRICE_UNIT[cost.utility]

	const run = async (action: () => Promise<unknown>) => {
		setSubmitting(true)
		setError(undefined)
		try {
			await action()
			onSaved()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		const unitPriceHigh = parseNumberInput(high)
		const unitPriceLow = twoTariffs ? parseNumberInput(low) : undefined
		const fixedFee = parseNumberInput(fee)
		if (unitPriceHigh === undefined || unitPriceHigh < 0 || (unitPriceLow ?? 0) < 0 || (fixedFee ?? 0) < 0) {
			setError('Zadejte nezáporné ceny.')
			return
		}
		void run(() => setExpenseUtilityPrice(accountGuid, expense.guid, month, {
			unitPriceHigh: Math.round(unitPriceHigh * 10000) / 10000,
			unitPriceLow: unitPriceLow === undefined ? null : Math.round(unitPriceLow * 10000) / 10000,
			fixedFee: fixedFee === undefined ? 0 : Math.round(fixedFee * 100) / 100,
		}))
	}

	const handleReset = () => {
		if (!window.confirm(`Zrušit cenu pro ${formatMonth(month)}? Použije se cena z dřívějšího měsíce.`)) return
		void run(() => removeExpenseUtilityPrice(accountGuid, expense.guid, month))
	}

	return (
		<form onSubmit={handleSubmit}>
			<div className="ReadingForm">
				<div>
					<label htmlFor={`price-high-${expense.guid}`}>{twoTariffs ? `Cena VT (${priceUnit})` : `Cena (${priceUnit})`}</label>
					<input id={`price-high-${expense.guid}`} inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} required style={{ width: 120 }} />
				</div>
				{twoTariffs && (
					<div>
						<label htmlFor={`price-low-${expense.guid}`}>Cena NT ({priceUnit})</label>
						<input id={`price-low-${expense.guid}`} inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} placeholder="jako VT" style={{ width: 120 }} />
					</div>
				)}
				<div>
					<label htmlFor={`price-fee-${expense.guid}`}>Stálé platby (Kč/měs.)</label>
					<input id={`price-fee-${expense.guid}`} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" style={{ width: 120 }} />
				</div>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit pro {formatMonth(month)}</button>
					{cost.priceConfirmed && <button type="button" className="SecondaryButton" disabled={submitting} onClick={handleReset}>Zrušit cenu měsíce</button>}
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zavřít</button>
				</div>
			</div>
			{!cost.priceConfirmed && cost.priceMonth && <p className="SubText">Předvyplněno z {formatMonth(cost.priceMonth)} – uložením se cena zafixuje pro {formatMonth(month)}.</p>}
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

/** Advances of the month from the tax return (Daně) - read-only rows in the taxes category, edited on the Daně page. */
const TaxAdvanceRows: React.FC<{ advances: MonthAdvances }> = ({ advances }) => (
	<>
		{ADVANCE_KINDS.filter((kind) => advances[kind] !== 0).map((kind) => (
			<tr key={kind}>
				<td className="HideOnMobile">{CATEGORY_LABEL[ExpenseCategory.taxes]}</td>
				<td>
					Záloha – {ADVANCE_KIND_LABEL[kind].toLowerCase()}
					<div className="SubText">z <Link to={AppPaths.Taxes}>daňového přiznání</Link></div>
				</td>
				<td className="HideOnMobile">Dle záloh</td>
				<td className="NumberCell">{formatMoney(advances[kind])}</td>
			</tr>
		))}
	</>
)

/** A correction counted in this month - a separate row in its expense's category. */
const CorrectionRow: React.FC<{ correction: MonthCorrection; onRemove: () => void }> = ({ correction, onRemove }) => (
	<tr className="CorrectionRow">
		<td className="HideOnMobile">{CATEGORY_LABEL[correction.category]}</td>
		<td>
			Oprava {correction.expenseName} {formatMonth(correction.forMonth)}
			<span className={`Badge ${correction.amount > 0 ? 'BadgeWarning' : 'BadgeSuccess'}`}>{correctionLabel(correction.amount)}</span>
			{correction.note && <div className="SubText">{correction.note}</div>}
		</td>
		<td className="HideOnMobile">Oprava</td>
		<td className="NumberCell">
			{formatSignedMoney(correction.amount)}
			<div><button type="button" className="DeleteLink" onClick={onRemove}>Smazat</button></div>
		</td>
	</tr>
)

enum CorrectionMode {
	Paid = 'paid',
	Difference = 'difference',
}

/**
 * Adds a correction of the month's amount - either the really paid amount (the difference to the
 * computed amount is stored) or the difference itself. Counted in `applyMonth` (default next month).
 */
const CorrectionForm: React.FC<{
	accountGuid: string
	expense: MonthExpense
	month: string
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, expense, month, onSaved, onCancel }) => {
	const [mode, setMode] = useState(CorrectionMode.Paid)
	const [value, setValue] = useState('')
	const [applyMonth, setApplyMonth] = useState(() => addMonths(month, 1))
	const [note, setNote] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const parsed = parseNumberInput(value)
	const difference = parsed === undefined ? undefined : Math.round((mode === CorrectionMode.Paid ? parsed - expense.amount : parsed) * 100) / 100

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (parsed === undefined || (mode === CorrectionMode.Paid && parsed < 0)) {
			setError(mode === CorrectionMode.Paid ? 'Zadejte zaplacenou částku (nezáporné číslo).' : 'Zadejte rozdíl (+ nedoplatek, − přeplatek).')
			return
		}
		if (difference === 0) {
			setError('Rozdíl je nulový – není co opravovat.')
			return
		}
		const rounded = Math.round(parsed * 100) / 100
		setSubmitting(true)
		setError(undefined)
		try {
			await createExpenseCorrection(accountGuid, expense.guid, {
				forMonth: month,
				applyMonth,
				amount: mode === CorrectionMode.Difference ? rounded : null,
				paidAmount: mode === CorrectionMode.Paid ? rounded : null,
				note: note.trim() || null,
			})
			onSaved()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={(e) => { void handleSubmit(e) }}>
			<div className="CorrectionModes">
				<label className="CheckboxLabel">
					<input type="radio" name={`correction-mode-${expense.guid}`} checked={mode === CorrectionMode.Paid} onChange={() => setMode(CorrectionMode.Paid)} />
					Skutečně zaplaceno
				</label>
				<label className="CheckboxLabel">
					<input type="radio" name={`correction-mode-${expense.guid}`} checked={mode === CorrectionMode.Difference} onChange={() => setMode(CorrectionMode.Difference)} />
					Rovnou rozdíl
				</label>
			</div>
			<div className="ReadingForm">
				<div>
					<label htmlFor={`correction-value-${expense.guid}`}>{mode === CorrectionMode.Paid ? 'Zaplaceno (Kč)' : 'Rozdíl (Kč, + / −)'}</label>
					<input id={`correction-value-${expense.guid}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required style={{ width: 130 }} />
				</div>
				<div>
					<label htmlFor={`correction-apply-${expense.guid}`}>Započíst v měsíci</label>
					<input id={`correction-apply-${expense.guid}`} type="month" value={applyMonth} min={month} onChange={(e) => setApplyMonth(e.target.value)} required />
				</div>
				<div>
					<label htmlFor={`correction-note-${expense.guid}`}>Poznámka</label>
					<input id={`correction-note-${expense.guid}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
				</div>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit opravu</button>
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zavřít</button>
				</div>
			</div>
			<p className="SubText">
				Spočtená částka za {formatMonth(month)}: {formatMoney(expense.amount)}
				{difference !== undefined && difference !== 0 && ` · rozdíl ${formatSignedMoney(difference)} (${correctionLabel(difference)})`}
				{' '}– oprava se zobrazí jako samostatný řádek v nákladech měsíce {formatMonth(applyMonth)}.
			</p>
			{expense.utility && !expense.utility.priceMonth && <p className="SubText">Pozor: náklad zatím nemá cenu, spočtená částka je 0 Kč.</p>}
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

// ── Definitions ─────────────────────────────────────────────────────────────

const Definitions: React.FC<{ accountGuid: string }> = ({ accountGuid }) => {
	const [expenses, setExpenses] = useState<Expense[] | undefined>()
	const [category, setCategory] = useState<ExpenseCategory | ''>('')
	const [editing, setEditing] = useState<Expense | null>(null)
	// Bumped after every save so the (otherwise same-keyed) "new" form remounts empty instead of keeping the previous values
	const [formKey, setFormKey] = useState(0)
	const [sheets, setSheets] = useState<MeterSheet[]>([])
	const [payees, setPayees] = useState<Payee[] | undefined>()
	const [suppliers, setSuppliers] = useState<SupplierWithPeriods[]>([])
	const [error, setError] = useState<string | undefined>()

	useEffect(() => {
		listMeterSheets({ includeArchived: true })
			.then(setSheets)
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst listy odečtů.')))
		listElectricitySuppliers()
			.then(setSuppliers)
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst dodavatele elektřiny.')))
	}, [])

	const load = useCallback(() => {
		listExpenses(accountGuid)
			.then((list) => { setExpenses(list); setError(undefined) })
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst náklady.')))
	}, [accountGuid])

	const loadPayees = useCallback(() => {
		listPayees(accountGuid)
			.then(setPayees)
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst příjemce.')))
	}, [accountGuid])

	useEffect(() => {
		load()
	}, [load])

	useEffect(() => {
		loadPayees()
	}, [loadPayees])

	const handleRemove = async (expense: Expense) => {
		if (!window.confirm(`Smazat náklad „${expense.name}"?`)) return
		try {
			await removeExpense(accountGuid, expense.guid)
			if (editing?.guid === expense.guid) setEditing(null)
			load()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	const visible = expenses?.filter((e) => !category || e.category === category)
	const month = currentMonth()

	return (
		<>
			<div className="Card" style={{ marginBottom: 24 }}>
				<h2 className="SectionTitle">{editing ? `Upravit „${editing.name}"` : 'Nový náklad'}</h2>
				<ExpenseForm
					key={editing?.guid ?? `new-${formKey}`}
					accountGuid={accountGuid}
					expense={editing}
					sheets={sheets}
					suppliers={suppliers}
					payees={payees ?? []}
					onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load() }}
					onCancel={() => setEditing(null)}
				/>
			</div>

			<div className="Card">
				<div className="CardHeader">
					<h2 className="SectionTitle">Definice nákladů</h2>
					<div>
						<label htmlFor="expense-filter">Kategorie</label>
						<select id="expense-filter" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}>
							<option value="">Všechny</option>
							{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
						</select>
					</div>
				</div>
				{error && <p className="ErrorText">{error}</p>}
				<div className="TableScroll">
					<table>
						<thead>
							<tr>
								<th>Kategorie</th>
								<th>Název</th>
								<th>Opakování</th>
								<th>Od</th>
								<th>Do</th>
								<th className="NumberCell">Částka</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{visible?.map((expense) => {
								const ended = isEnded(expense, month)
								return (
									<tr key={expense.guid} className={ended ? 'MutedRow' : undefined}>
										<td>{CATEGORY_LABEL[expense.category]}</td>
										<td>
											{expense.name}
											{ended && <span className="Badge BadgeMuted">ukončeno</span>}
											{expense.payeeGuid && <div className="SubText">Platí se: {payees?.find((p) => p.guid === expense.payeeGuid)?.name ?? '…'}</div>}
											{expense.note && <div className="SubText">{expense.note}</div>}
										</td>
										<td>{RECURRENCE_LABEL[expense.recurrence]}</td>
										<td>{formatMonth(expense.startMonth)}</td>
										<td>{expense.recurrence === ExpenseRecurrence.once ? '–' : expense.endMonth ? formatMonth(expense.endMonth) : 'bez omezení'}</td>
										<td className="NumberCell">
											{expense.meterSheetGuid ? 'dle odečtů' : formatMoney(expense.amount)}
											{expense.meterSheetGuid && (
												<div className="SubText">{sheets.find((sh) => sh.guid === expense.meterSheetGuid)?.name ?? '…'}</div>
											)}
											{expense.electricitySupplierGuid && (
												<div className="SubText">cena: {suppliers.find((su) => su.guid === expense.electricitySupplierGuid)?.label ?? '…'} {expense.electricityPriceWithVat ? 's DPH' : 'bez DPH'}</div>
											)}
										</td>
										<td className="RowActions">
											<button type="button" className="DeleteLink" onClick={() => setEditing(expense)}>Upravit</button>
											<button type="button" className="DeleteLink" onClick={() => { void handleRemove(expense) }}>Smazat</button>
										</td>
									</tr>
								)
							})}
							{visible?.length === 0 && <tr><td colSpan={7}>{category ? 'V této kategorii nejsou žádné náklady.' : 'Zatím žádné náklady.'}</td></tr>}
							{!expenses && !error && <tr><td colSpan={7}>Načítám…</td></tr>}
						</tbody>
					</table>
				</div>
			</div>

			{/* A deleted payee is unset on its expenses - reload both. */}
			<PayeesCard accountGuid={accountGuid} payees={payees} onChanged={() => { loadPayees(); load() }} />
		</>
	)
}

const ExpenseForm: React.FC<{
	accountGuid: string
	expense: Expense | null
	sheets: MeterSheet[]
	suppliers: SupplierWithPeriods[]
	payees: Payee[]
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, expense, sheets, suppliers, payees, onSaved, onCancel }) => {
	const [name, setName] = useState(expense?.name ?? '')
	const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? ExpenseCategory.services)
	const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
	const [recurrence, setRecurrence] = useState<ExpenseRecurrence>(expense?.recurrence ?? ExpenseRecurrence.monthly)
	const [startMonth, setStartMonth] = useState(expense?.startMonth ?? currentMonth())
	const [endMonth, setEndMonth] = useState(expense?.recurrence === ExpenseRecurrence.once ? '' : (expense?.endMonth ?? ''))
	const [note, setNote] = useState(expense?.note ?? '')
	const [meterSheetGuid, setMeterSheetGuid] = useState(expense?.meterSheetGuid ?? '')
	const [supplierGuid, setSupplierGuid] = useState(expense?.electricitySupplierGuid ?? '')
	const [priceWithVat, setPriceWithVat] = useState(expense?.electricityPriceWithVat ?? true)
	const [payeeGuid, setPayeeGuid] = useState(expense?.payeeGuid ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const isOnce = recurrence === ExpenseRecurrence.once
	const isLinked = meterSheetGuid !== ''
	const selectableSheets = sheets.filter((sh) => !sh.archived || sh.guid === meterSheetGuid)
	// Only an electricity sheet can be priced by a supplier.
	const isElectricity = sheets.find((sh) => sh.guid === meterSheetGuid)?.utility === UtilityType.electricity
	const bySupplier = isElectricity && supplierGuid !== ''

	const handleSheetChange = (guid: string) => {
		setMeterSheetGuid(guid)
		if (!guid) return
		// A meter-linked expense is computed every month.
		setRecurrence(ExpenseRecurrence.monthly)
		const sheet = sheets.find((sh) => sh.guid === guid)
		if (sheet && !name.trim()) setName(sheet.name)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const parsedAmount = isLinked ? 0 : parseNumberInput(amount)
		if (parsedAmount === undefined || parsedAmount < 0) {
			setError('Zadejte částku (nezáporné číslo).')
			return
		}
		const body: SaveExpense = {
			name: name.trim(),
			category,
			amount: Math.round(parsedAmount * 100) / 100,
			recurrence,
			startMonth,
			endMonth: isOnce || !endMonth ? null : endMonth,
			note: note.trim() || null,
			meterSheetGuid: isLinked ? meterSheetGuid : null,
			electricitySupplierGuid: bySupplier ? supplierGuid : null,
			electricityPriceWithVat: priceWithVat,
			payeeGuid: payeeGuid || null,
		}
		setSubmitting(true)
		setError(undefined)
		try {
			if (expense) await updateExpense(accountGuid, expense.guid, body)
			else await createExpense(accountGuid, body)
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
					<label htmlFor="expense-name">Název</label>
					<input id="expense-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Internet" maxLength={100} required />
				</div>
				<div>
					<label htmlFor="expense-category">Kategorie</label>
					<select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
						{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
					</select>
				</div>
				<div>
					<label htmlFor="expense-sheet">Napojit na odečty</label>
					<select id="expense-sheet" value={meterSheetGuid} onChange={(e) => handleSheetChange(e.target.value)}>
						<option value="">— nenapojeno —</option>
						{selectableSheets.map((sh) => (
							<option key={sh.guid} value={sh.guid}>{sh.name} ({UTILITY_META[sh.utility].label}){sh.archived ? ' – archivovaný' : ''}</option>
						))}
					</select>
				</div>
				{isElectricity && (
					<div>
						<label htmlFor="expense-supplier">Cena elektřiny</label>
						<select id="expense-supplier" value={supplierGuid} onChange={(e) => setSupplierGuid(e.target.value)}>
							<option value="">— ruční měsíční ceny —</option>
							{suppliers.map((su) => <option key={su.guid} value={su.guid}>{su.label}</option>)}
						</select>
					</div>
				)}
				{bySupplier && (
					<div>
						<label className="CheckboxLabel" style={{ marginBottom: 8 }}>
							<input type="checkbox" checked={priceWithVat} onChange={(e) => setPriceWithVat(e.target.checked)} />
							Účtovat cenu s DPH
						</label>
					</div>
				)}
				<div>
					<label htmlFor="expense-payee">Příjemce platby</label>
					<select id="expense-payee" value={payeeGuid} onChange={(e) => setPayeeGuid(e.target.value)}>
						<option value="">— neurčeno —</option>
						{payees.map((p) => <option key={p.guid} value={p.guid}>{p.name}</option>)}
					</select>
				</div>
				{!isLinked && (
					<div>
						<label htmlFor="expense-amount">Částka (Kč)</label>
						<input id="expense-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required style={{ width: 130 }} />
					</div>
				)}
				<div>
					<label htmlFor="expense-recurrence">Opakování</label>
					<select id="expense-recurrence" value={recurrence} disabled={isLinked} onChange={(e) => setRecurrence(e.target.value as ExpenseRecurrence)}>
						{RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
					</select>
				</div>
				<div>
					<label htmlFor="expense-start">{isOnce ? 'Měsíc' : 'Od měsíce'}</label>
					<input id="expense-start" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
				</div>
				{!isOnce && (
					<div>
						<label htmlFor="expense-end">Do měsíce (včetně)</label>
						<input id="expense-end" type="month" value={endMonth} min={startMonth} onChange={(e) => setEndMonth(e.target.value)} />
					</div>
				)}
				<div>
					<label htmlFor="expense-note">Poznámka</label>
					<input id="expense-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
				</div>
			</div>
			{!isOnce && <p className="SubText" style={{ paddingTop: 0 }}>Bez měsíce ukončení se náklad opakuje bez omezení.</p>}
			{isLinked && !bySupplier && (
				<p className="SubText" style={{ paddingTop: 0 }}>
					Částka se každý měsíc spočítá ze spotřeby na listu × ceny (+ stálé platby). Ceny se zadávají v měsíčním přehledu;
					když pro měsíc chybí, převezme se poslední dřívější.
				</p>
			)}
			{bySupplier && (
				<p className="SubText" style={{ paddingTop: 0 }}>
					Částka = spotřeba (VT + NT) × cena za kWh {priceWithVat ? 's DPH' : 'bez DPH'} z <Link to={AppPaths.ElectricityPrices}>Cen elektřiny</Link>. Spotřeba měsíce se rozdělí
					rovnoměrně do dnů, každý den se ocení cenou, která pro něj platí. Dny bez ceny se odhadnou nejbližší cenou a cena měsíce pak
					není potvrzená. Stálé platby se nepřičítají.
				</p>
			)}
			{error && <p className="ErrorText">{error}</p>}
			<div className="FormActions">
				<button type="submit" disabled={submitting}>{expense ? 'Uložit změny' : 'Přidat náklad'}</button>
				{expense && <button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>}
			</div>
		</form>
	)
}
