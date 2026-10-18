import React, { useState } from 'react'

import { getExpenses } from '../api/schema/expenses/expenses'
import type { MonthExpenses, MonthPayment, Payee } from '../api/schema/models'
import { getPayees } from '../api/schema/payees/payees'
import { QrCode } from '../components/QrCode'
import { apiErrorMessage } from '../utils/apiError'
import { formatMoney, formatMonth, formatSignedMoney } from '../utils/expenses'

const { markPaymentPaid, unmarkPaymentPaid } = getExpenses()
const { createPayee, updatePayee, removePayee } = getPayees()

// ── Month view: payments grouped by payee ───────────────────────────────────

/** The month's payments to payees - expenses of each payee summed up, QR code, paid checkbox. */
export const PaymentsCard: React.FC<{
	accountGuid: string
	data: MonthExpenses
	onChanged: () => void
}> = ({ accountGuid, data, onChanged }) => {
	if (data.payments.length === 0) return null
	const paidCount = data.payments.filter((p) => p.paidAt !== null).length

	return (
		<div className="Card PaymentsSection">
			<div className="CardHeader">
				<h2 className="SectionTitle">Platby příjemcům</h2>
				<span className="SubText">Zaplaceno {paidCount} z {data.payments.length}</span>
			</div>
			<div className="PaymentsGrid">
				{data.payments.map((payment) => (
					<PaymentCard key={payment.payee.guid} accountGuid={accountGuid} data={data} payment={payment} onChanged={onChanged} />
				))}
			</div>
		</div>
	)
}

const PaymentCard: React.FC<{
	accountGuid: string
	data: MonthExpenses
	payment: MonthPayment
	onChanged: () => void
}> = ({ accountGuid, data, payment, onChanged }) => {
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const { payee } = payment
	const paid = payment.paidAt !== null
	const changedSincePaid = paid && payment.paidAmount !== payment.amount
	const items = data.items.filter((i) => payment.expenseGuids.includes(i.guid))
	const corrections = data.corrections.filter((c) => payment.correctionGuids.includes(c.guid))

	const run = async (action: () => Promise<unknown>) => {
		setSubmitting(true)
		setError(undefined)
		try {
			await action()
			onChanged()
		} catch (err) {
			setError(apiErrorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	const togglePaid = () => {
		void run(() => paid
			? unmarkPaymentPaid(accountGuid, payee.guid, data.month)
			: markPaymentPaid(accountGuid, payee.guid, data.month))
	}

	return (
		<div className={`PaymentCard${paid ? ' PaymentCardPaid' : ''}`}>
			<div className="PaymentCardHeader">
				<label className="CheckboxLabel">
					<input type="checkbox" checked={paid} disabled={submitting} onChange={togglePaid} />
					<strong>{payee.name}</strong>
				</label>
				{paid && <span className="Badge BadgeSuccess">zaplaceno</span>}
			</div>
			<div className="SubText">
				{payee.bankAccount ? `Účet ${payee.bankAccount}` : 'Bez čísla účtu'}
				{payee.variableSymbol && ` · VS ${payee.variableSymbol}`}
			</div>

			<table className="PaymentItems">
				<tbody>
					{items.map((item) => (
						<tr key={item.guid}>
							<td>{item.name}</td>
							<td className="NumberCell">{formatMoney(item.amount)}</td>
						</tr>
					))}
					{corrections.map((c) => (
						<tr key={c.guid}>
							<td>Oprava {c.expenseName} {formatMonth(c.forMonth)}</td>
							<td className="NumberCell">{formatSignedMoney(c.amount)}</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="TotalRow">
						<td>K úhradě</td>
						<td className="NumberCell">{formatMoney(payment.amount)}</td>
					</tr>
				</tfoot>
			</table>

			{changedSincePaid && (
				<p className="SubText">
					<span className="Badge BadgeWarning" style={{ marginLeft: 0 }}>změna</span>{' '}
					Zaplaceno {formatMoney(payment.paidAmount ?? 0)}, nyní {formatMoney(payment.amount)}.
					<button type="button" className="DeleteLink" disabled={submitting} onClick={() => { void run(() => markPaymentPaid(accountGuid, payee.guid, data.month)) }}>
						Potvrdit novou částku
					</button>
				</p>
			)}

			{payment.spayd && !paid && (
				<div className="PaymentQr">
					<QrCode value={payment.spayd} title={`QR platba – ${payee.name}`} />
					<span className="SubText">QR Platba · {formatMoney(payment.amount)}</span>
				</div>
			)}
			{!payment.spayd && !paid && (
				<p className="SubText">
					{payment.amount <= 0 ? 'Nic k úhradě.' : 'QR kód nelze vytvořit – příjemce nemá číslo účtu.'}
				</p>
			)}
			{error && <p className="ErrorText">{error}</p>}
		</div>
	)
}

// ── Definitions: payees ─────────────────────────────────────────────────────

/** Who expenses are paid to - list + add/edit form. */
export const PayeesCard: React.FC<{
	accountGuid: string
	payees: Payee[] | undefined
	onChanged: () => void
}> = ({ accountGuid, payees, onChanged }) => {
	const [editing, setEditing] = useState<Payee | null>(null)
	// Bumped after every save so the "new" form remounts empty.
	const [formKey, setFormKey] = useState(0)
	const [error, setError] = useState<string | undefined>()

	const handleRemove = async (payee: Payee) => {
		if (!window.confirm(`Smazat příjemce „${payee.name}"? Jeho náklady zůstanou, jen bez příjemce.`)) return
		try {
			await removePayee(accountGuid, payee.guid)
			if (editing?.guid === payee.guid) setEditing(null)
			setError(undefined)
			onChanged()
		} catch (err) {
			setError(apiErrorMessage(err, 'Smazání se nezdařilo.'))
		}
	}

	return (
		<div className="Card" style={{ marginTop: 24 }}>
			<h2 className="SectionTitle">Příjemci plateb</h2>
			<p className="SubText" style={{ marginTop: 0 }}>
				Náklady stejného příjemce se v měsíčním přehledu sečtou do jedné platby; s číslem účtu i s QR kódem.
			</p>
			{error && <p className="ErrorText">{error}</p>}
			<div className="TableScroll">
				<table>
					<thead>
						<tr>
							<th>Jméno</th>
							<th>Účet</th>
							<th className="HideOnMobile">VS</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{payees?.map((payee) => (
							<tr key={payee.guid}>
								<td>{payee.name}</td>
								<td>{payee.bankAccount ?? '–'}</td>
								<td className="HideOnMobile">{payee.variableSymbol ?? '–'}</td>
								<td className="RowActions">
									<button type="button" className="DeleteLink" onClick={() => setEditing(payee)}>Upravit</button>
									<button type="button" className="DeleteLink" onClick={() => { void handleRemove(payee) }}>Smazat</button>
								</td>
							</tr>
						))}
						{payees?.length === 0 && <tr><td colSpan={4}>Zatím žádní příjemci.</td></tr>}
						{!payees && <tr><td colSpan={4}>Načítám…</td></tr>}
					</tbody>
				</table>
			</div>
			<h3 className="SectionTitle" style={{ marginTop: 16 }}>{editing ? `Upravit „${editing.name}"` : 'Nový příjemce'}</h3>
			<PayeeForm
				key={editing?.guid ?? `new-${formKey}`}
				accountGuid={accountGuid}
				payee={editing}
				onSaved={() => { setEditing(null); setFormKey((k) => k + 1); onChanged() }}
				onCancel={() => setEditing(null)}
			/>
		</div>
	)
}

const PayeeForm: React.FC<{
	accountGuid: string
	payee: Payee | null
	onSaved: () => void
	onCancel: () => void
}> = ({ accountGuid, payee, onSaved, onCancel }) => {
	const [name, setName] = useState(payee?.name ?? '')
	const [bankAccount, setBankAccount] = useState(payee?.bankAccount ?? '')
	const [variableSymbol, setVariableSymbol] = useState(payee?.variableSymbol ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const vs = variableSymbol.trim()
		if (vs && !/^\d{1,10}$/.test(vs)) {
			setError('Variabilní symbol může mít nejvýš 10 číslic.')
			return
		}
		const body = { name: name.trim(), bankAccount: bankAccount.trim() || null, variableSymbol: vs || null }
		setSubmitting(true)
		setError(undefined)
		try {
			if (payee) await updatePayee(accountGuid, payee.guid, body)
			else await createPayee(accountGuid, body)
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
					<label htmlFor="payee-name">Jméno</label>
					<input id="payee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Pronajímatel" maxLength={100} required />
				</div>
				<div>
					<label htmlFor="payee-account">Číslo účtu</label>
					<input id="payee-account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="např. 19-2000145399/0800 nebo IBAN" maxLength={50} />
				</div>
				<div>
					<label htmlFor="payee-vs">Variabilní symbol</label>
					<input id="payee-vs" inputMode="numeric" value={variableSymbol} onChange={(e) => setVariableSymbol(e.target.value)} maxLength={10} style={{ width: 130 }} />
				</div>
			</div>
			{error && <p className="ErrorText">{error}</p>}
			<div className="FormActions">
				<button type="submit" disabled={submitting}>{payee ? 'Uložit změny' : 'Přidat příjemce'}</button>
				{payee && <button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>}
			</div>
		</form>
	)
}
