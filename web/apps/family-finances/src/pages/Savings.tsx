import React, { useCallback, useEffect, useState } from 'react'

import type { SaveSavingsGoal, SavingsGoal } from '../api/schema/models'
import { getSavings } from '../api/schema/savings/savings'
import { Layout } from '../components/Layout'
import { useAccount } from '../store/account'
import { apiErrorMessage } from '../utils/apiError'
import { currentMonth, formatMoney, formatMonth } from '../utils/expenses'
import { formatDate, parseNumberInput, todayIso } from '../utils/meters'

const { listSavingsGoals, createSavingsGoal, updateSavingsGoal, updateSavingsBalance, removeSavingsGoal } = getSavings()

export const SavingsPage = () => {
	const { account } = useAccount()

	return (
		<Layout title="Spoření">
			{account && <Goals key={account.guid} accountGuid={account.guid} />}
		</Layout>
	)
}

const Goals: React.FC<{ accountGuid: string }> = ({ accountGuid }) => {
	const [goals, setGoals] = useState<SavingsGoal[] | undefined>()
	const [editing, setEditing] = useState<SavingsGoal | null>(null)
	// Bumped after every save so the (otherwise same-keyed) "new" form remounts empty instead of keeping the previous values
	const [formKey, setFormKey] = useState(0)
	const [balanceEditing, setBalanceEditing] = useState<string | null>(null)
	const [error, setError] = useState<string | undefined>()

	const load = useCallback(() => {
		listSavingsGoals(accountGuid)
			.then((list) => { setGoals(list); setError(undefined) })
			.catch((err: unknown) => setError(apiErrorMessage(err, 'Nepodařilo se načíst cíle spoření.')))
	}, [accountGuid])

	useEffect(() => {
		load()
	}, [load])

	const handleRemove = async (goal: SavingsGoal) => {
		if (!window.confirm(`Smazat cíl „${goal.name}"?`)) return
		try {
			await removeSavingsGoal(accountGuid, goal.guid)
			if (editing?.guid === goal.guid) setEditing(null)
			load()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	const month = currentMonth()
	const totalContribution = goals?.reduce((sum, g) => sum + g.contributionInMonth, 0) ?? 0

	return (
		<>
			<div className="Card" style={{ marginBottom: 24 }}>
				<div className="CardHeader">
					<h2 className="SectionTitle">Cíle spoření</h2>
					{goals && goals.length > 0 && (
						<div className="SubText">Vklady v měsíci {formatMonth(month)}: <strong>{formatMoney(totalContribution)}</strong></div>
					)}
				</div>
				{error && <p className="ErrorText">{error}</p>}
				<div className="TableScroll">
					<table>
						<thead>
							<tr>
								<th>Název</th>
								<th className="NumberCell">Stav</th>
								<th className="NumberCell">Cíl</th>
								<th>Termín</th>
								<th className="NumberCell">Měsíční vklad</th>
								<th className="NumberCell">Očekávaný stav</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{goals?.map((goal) => (
								<React.Fragment key={goal.guid}>
									<GoalRow
										goal={goal}
										onUpdateBalance={() => setBalanceEditing(balanceEditing === goal.guid ? null : goal.guid)}
										onEdit={() => setEditing(goal)}
										onRemove={() => { void handleRemove(goal) }}
									/>
									{balanceEditing === goal.guid && (
										<tr className="PriceFormRow">
											<td colSpan={7}>
												<BalanceForm
													accountGuid={accountGuid}
													goal={goal}
													onSaved={() => { setBalanceEditing(null); load() }}
													onCancel={() => setBalanceEditing(null)}
												/>
											</td>
										</tr>
									)}
								</React.Fragment>
							))}
							{goals?.length === 0 && <tr><td colSpan={7}>Zatím žádné cíle spoření.</td></tr>}
							{!goals && !error && <tr><td colSpan={7}>Načítám…</td></tr>}
						</tbody>
					</table>
				</div>
				<p className="SubText">
					Měsíční vklad = (cíl − stav) / počet měsíců do termínu včetně. Počítá se od měsíce, ke kterému stav platí, pokud je to
					aktuální měsíc, jinak od následujícího. Očekávaný stav je ke konci aktuálního měsíce. Úroky se nepočítají – stav aktualizujte ručně.
				</p>
			</div>

			<div className="Card">
				<h2 className="SectionTitle">{editing ? `Upravit „${editing.name}"` : 'Nový cíl'}</h2>
				<GoalForm
					key={editing?.guid ?? `new-${formKey}`}
					accountGuid={accountGuid}
					goal={editing}
					onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load() }}
					onCancel={() => setEditing(null)}
				/>
			</div>
		</>
	)
}

const GoalRow: React.FC<{
	goal: SavingsGoal
	onUpdateBalance: () => void
	onEdit: () => void
	onRemove: () => void
}> = ({ goal, onUpdateBalance, onEdit, onRemove }) => {
	const reached = goal.currentBalance >= goal.targetAmount
	const progress = Math.min(goal.currentBalance / goal.targetAmount, 1)

	return (
		<tr className={reached ? 'MutedRow' : undefined}>
			<td>
				{goal.name}
				{reached && <span className="Badge BadgeSuccess">splněno</span>}
				{!reached && goal.contributionMonths === 0 && <span className="Badge BadgeWarning">po termínu</span>}
				{goal.contributionConfirmed && <span className="Badge BadgeSuccess">vklad za {formatMonth(goal.month)} potvrzen</span>}
				<div className="SavingsProgress" title={`${Math.round(progress * 100)} %`}>
					<div style={{ width: `${progress * 100}%` }} />
				</div>
				{goal.note && <div className="SubText">{goal.note}</div>}
			</td>
			<td className="NumberCell">
				{formatMoney(goal.currentBalance)}
				<div className="SubText">k {formatDate(goal.balanceDate)}</div>
			</td>
			<td className="NumberCell">{formatMoney(goal.targetAmount)}</td>
			<td>{formatMonth(goal.targetMonth)}</td>
			<td className="NumberCell">
				{formatMoney(goal.monthlyContribution)}
				{goal.monthlyContribution > 0 && (
					<div className="SubText">{goal.contributionMonths} × od {formatMonth(goal.contributionStartMonth)}</div>
				)}
			</td>
			<td className="NumberCell">{formatMoney(goal.expectedBalance)}</td>
			<td className="RowActions">
				<button type="button" className="DeleteLink" onClick={onUpdateBalance}>Aktualizovat stav</button>
				<button type="button" className="DeleteLink" onClick={onEdit}>Upravit</button>
				<button type="button" className="DeleteLink" onClick={onRemove}>Smazat</button>
			</td>
		</tr>
	)
}

/** Quick balance update - the balance then applies as of today. */
const BalanceForm: React.FC<{
	accountGuid: string
	goal: SavingsGoal
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, goal, onSaved, onCancel }) => {
	const [balance, setBalance] = useState(String(goal.currentBalance))
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const parsed = parseNumberInput(balance)
		if (parsed === undefined || parsed < 0) {
			setError('Zadejte nezáporný stav.')
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			await updateSavingsBalance(accountGuid, goal.guid, { currentBalance: Math.round(parsed * 100) / 100, balanceDate: todayIso() })
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
					<label htmlFor={`balance-${goal.guid}`}>Stav k dnešku (Kč)</label>
					<input id={`balance-${goal.guid}`} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} required autoFocus style={{ width: 140 }} />
				</div>
				<div className="FormActions">
					<button type="submit" disabled={submitting}>Uložit stav</button>
					<button type="button" className="SecondaryButton" onClick={onCancel}>Zavřít</button>
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
		</form>
	)
}

const GoalForm: React.FC<{
	accountGuid: string
	goal: SavingsGoal | null
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, goal, onSaved, onCancel }) => {
	const [name, setName] = useState(goal?.name ?? '')
	const [balance, setBalance] = useState(goal ? String(goal.currentBalance) : '0')
	const [balanceDate, setBalanceDate] = useState(goal?.balanceDate ?? todayIso())
	const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '')
	const [targetMonth, setTargetMonth] = useState(goal?.targetMonth ?? '')
	const [note, setNote] = useState(goal?.note ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const parsedBalance = parseNumberInput(balance) ?? 0
		const parsedTarget = parseNumberInput(target)
		if (parsedBalance < 0 || parsedTarget === undefined || parsedTarget <= 0) {
			setError('Zadejte nezáporný stav a kladnou cílovou částku.')
			return
		}
		const body: SaveSavingsGoal = {
			name: name.trim(),
			currentBalance: Math.round(parsedBalance * 100) / 100,
			balanceDate: balanceDate || null,
			targetAmount: Math.round(parsedTarget * 100) / 100,
			targetMonth,
			note: note.trim() || null,
		}
		setSubmitting(true)
		setError(undefined)
		try {
			if (goal) await updateSavingsGoal(accountGuid, goal.guid, body)
			else await createSavingsGoal(accountGuid, body)
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
					<label htmlFor="goal-name">Název</label>
					<input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Dovolená" maxLength={100} required />
				</div>
				<div>
					<label htmlFor="goal-balance">Aktuální stav (Kč)</label>
					<input id="goal-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} style={{ width: 130 }} />
				</div>
				<div>
					<label htmlFor="goal-balance-date">Stav ke dni</label>
					<input id="goal-balance-date" type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} required />
				</div>
				<div>
					<label htmlFor="goal-target">Cílová částka (Kč)</label>
					<input id="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required style={{ width: 130 }} />
				</div>
				<div>
					<label htmlFor="goal-target-month">Termín (měsíc)</label>
					<input id="goal-target-month" type="month" value={targetMonth} min={balanceDate.slice(0, 7)} onChange={(e) => setTargetMonth(e.target.value)} required />
				</div>
				<div>
					<label htmlFor="goal-note">Poznámka</label>
					<input id="goal-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
			<div className="FormActions">
				<button type="submit" disabled={submitting}>{goal ? 'Uložit změny' : 'Přidat cíl'}</button>
				{goal && <button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>}
			</div>
		</form>
	)
}
