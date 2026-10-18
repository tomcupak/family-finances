import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'

import type { MonthOverview, SavingsGoal } from '../api/schema/models'
import { IncomeType } from '../api/schema/models'
import { getOverview } from '../api/schema/overview/overview'
import { getSavings } from '../api/schema/savings/savings'
import { AppPaths } from '../appPaths'
import { Layout } from '../components/Layout'
import { MonthSwitcher } from '../components/MonthSwitcher'
import { useAccount } from '../store/account'
import { apiErrorMessage } from '../utils/apiError'
import { CATEGORY_LABEL, currentMonth, formatMoney, formatMonth, formatSignedMoney } from '../utils/expenses'
import { ADVANCE_KIND_LABEL, ADVANCE_KINDS } from '../utils/taxes'

const { getOverview: fetchOverview } = getOverview()
const { confirmSavingsContribution, revertSavingsContribution } = getSavings()

export const OverviewPage = () => {
	const { account } = useAccount()

	return (
		<Layout title="Přehled">
			{account && <MonthOverviewView key={account.guid} accountGuid={account.guid} />}
		</Layout>
	)
}

const MonthOverviewView: React.FC<{ accountGuid: string }> = ({ accountGuid }) => {
	const [month, setMonth] = useState(() => currentMonth())
	const [data, setData] = useState<MonthOverview | undefined>()
	const [error, setError] = useState<string | undefined>()
	const [reloadKey, setReloadKey] = useState(0)

	useEffect(() => {
		let cancelled = false
		fetchOverview(accountGuid, month)
			.then((result) => { if (!cancelled) { setData(result); setError(undefined) } })
			.catch((err: unknown) => { if (!cancelled) setError(apiErrorMessage(err, 'Nepodařilo se načíst přehled.')) })
		return () => { cancelled = true }
	}, [accountGuid, month, reloadKey])

	const changeMonth = (next: string) => {
		setData(undefined)
		setMonth(next)
	}

	return (
		<>
			<MonthSwitcher month={month} onChange={changeMonth} />
			{error && <p className="ErrorText">{error}</p>}
			{!data && !error && <p className="SubText">Načítám…</p>}
			{data && (
				<>
					{data.month === currentMonth() && (
						<QuickActions accountGuid={accountGuid} goals={data.savings.goals} onChanged={() => setReloadKey((k) => k + 1)} />
					)}
					<OverviewContent data={data} />
				</>
			)}
		</>
	)
}

const OverviewContent: React.FC<{ data: MonthOverview }> = ({ data }) => {
	const { income, expenses, advances, savings, vacationSaving, vacationBalance } = data

	return (
		<>
			<div className="OverviewTiles">
				<Tile label="Příjem" value={income.amount}>
					{income.type === null
						? <Link to={AppPaths.Income}>Bez plánu příjmů ({formatMonth(income.forMonth)})</Link>
						: `${income.type === IncomeType.self_employed ? 'faktura' : 'čistá mzda'} za ${formatMonth(income.forMonth)}`}
				</Tile>
				{vacationSaving !== null && vacationBalance !== null && (
					<Tile label="Spořák na dovolenou" value={vacationBalance}>
						stav po výplatě za {formatMonth(income.forMonth)};{' '}
						<strong className={vacationSaving < 0 ? 'NegativeValue' : undefined}>{formatSignedMoney(vacationSaving)}</strong>
						{vacationSaving < 0 ? ' (výběr)' : ' (vklad)'}
					</Tile>
				)}
				<Tile label="Náklady" value={expenses.total}>
					{advances.total !== 0 ? `vč. záloh ${formatMoney(advances.total)}` : 'vč. napojených na odečty'}
					{expenses.correctionsTotal !== 0 && ` a oprav ${formatSignedMoney(expenses.correctionsTotal)}`}
				</Tile>
				<Tile label="Zbývá na útratu" value={data.remaining} highlight>
					příjem za {formatMonth(income.forMonth)} − {vacationSaving !== null && 'dovolená − '}náklady a spoření za {formatMonth(data.month)}
				</Tile>
			</div>

			<div className="OverviewGrid">
				<div className="Card">
					<div className="CardHeader">
						<h2 className="SectionTitle">Náklady podle kategorií</h2>
						<Link className="SubText" to={AppPaths.Expenses}>Detail nákladů →</Link>
					</div>
					<div className="TableScroll">
						<table>
							<tbody>
								{expenses.categories.map((c) => (
									<tr key={c.category} className={c.total === 0 ? 'MutedRow' : undefined}>
										<td>{CATEGORY_LABEL[c.category]}</td>
										<td className="NumberCell">{formatMoney(c.total)}</td>
									</tr>
								))}
								<tr className="TotalRow">
									<td>Celkem</td>
									<td className="NumberCell">{formatMoney(expenses.total)}</td>
								</tr>
							</tbody>
						</table>
					</div>
					{expenses.correctionsTotal !== 0 && (
						<p className="SubText">Včetně oprav (přeplatky/nedoplatky) započtených v tomto měsíci: {formatSignedMoney(expenses.correctionsTotal)}.</p>
					)}
					{expenses.unconfirmedPrices > 0 && (
						<p className="SubText">
							<span className="Badge BadgeWarning" style={{ marginLeft: 0 }}>Nepotvrzené ceny: {expenses.unconfirmedPrices}</span>{' '}
							Částka napojených nákladů počítá s převzatou cenou – potvrďte ji v <Link to={AppPaths.Expenses}>Nákladech</Link>.
						</p>
					)}
				</div>

				<div className="OverviewSide">
					<div className="Card">
						<div className="CardHeader">
							<h2 className="SectionTitle">Zálohy</h2>
							<Link className="SubText" to={AppPaths.Taxes}>Daně →</Link>
						</div>
						<p className="SubText">Započtené v nákladech (kategorie {CATEGORY_LABEL.taxes}).</p>
						<table>
							<tbody>
								{ADVANCE_KINDS.map((kind) => (
									<tr key={kind}>
										<td>{ADVANCE_KIND_LABEL[kind]}</td>
										<td className="NumberCell">{formatMoney(advances[kind])}</td>
									</tr>
								))}
								<tr className="TotalRow">
									<td>Celkem</td>
									<td className="NumberCell">{formatMoney(advances.total)}</td>
								</tr>
							</tbody>
						</table>
					</div>

				</div>
			</div>

			<div className="Card" style={{ marginTop: 20 }}>
				<div className="CardHeader">
					<h2 className="SectionTitle">Spoření</h2>
					<Link className="SubText" to={AppPaths.Savings}>Cíle spoření →</Link>
				</div>
				{savings.goals.length === 0 ? (
					<p>Zatím žádné cíle spoření. <Link to={AppPaths.Savings}>Přidat cíl</Link></p>
				) : (
					<div className="TableScroll">
						<table>
							<thead>
								<tr>
									<th>Cíl</th>
									<th className="NumberCell">Vložit tento měsíc</th>
									<th className="NumberCell">Stav ke konci měsíce</th>
								</tr>
							</thead>
							<tbody>
								{savings.goals.map((goal) => {
									const progress = goal.targetAmount > 0 ? Math.min(goal.expectedBalance / goal.targetAmount, 1) : 1
									return (
										<tr key={goal.guid}>
											<td>
												<strong>{goal.name}</strong>
												<div className="SubText">{formatMoney(goal.targetAmount)} do {formatMonth(goal.targetMonth)}</div>
											</td>
											<td className="NumberCell">
												<strong>{formatMoney(goal.contributionInMonth)}</strong>
												{goal.contributionConfirmed && <div><span className="Badge BadgeSuccess" style={{ marginLeft: 0 }}>vloženo</span></div>}
											</td>
											<td className="NumberCell">
												{formatMoney(goal.expectedBalance)}
												<div className="SavingsProgress SavingsProgressRight" title={`${Math.round(progress * 100)} %`}>
													<div style={{ width: `${progress * 100}%` }} />
												</div>
												<div className="SubText">{Math.round(progress * 100)} % cíle</div>
											</td>
										</tr>
									)
								})}
								<tr className="TotalRow">
									<td>Celkem</td>
									<td className="NumberCell">{formatMoney(savings.totalContribution)}</td>
									<td className="NumberCell">{formatMoney(savings.totalExpectedBalance)}</td>
								</tr>
							</tbody>
						</table>
					</div>
				)}
			</div>
		</>
	)
}

/** Current month's to-dos: confirm that each savings goal got its planned contribution. */
const QuickActions: React.FC<{ accountGuid: string; goals: SavingsGoal[]; onChanged: () => void }> = ({ accountGuid, goals, onChanged }) => {
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()
	const due = goals.filter((g) => g.contributionInMonth > 0)
	const pending = due.filter((g) => !g.contributionConfirmed)
	if (due.length === 0) return null

	const run = async (action: () => Promise<unknown>) => {
		setSubmitting(true)
		setError(undefined)
		try {
			await action()
		} catch (err) {
			setError(apiErrorMessage(err, 'Nepodařilo se uložit stav spoření.'))
		} finally {
			setSubmitting(false)
			onChanged()
		}
	}
	const confirm = (goal: SavingsGoal) => run(() => confirmSavingsContribution(accountGuid, goal.guid))
	const confirmAll = () => run(async () => {
		for (const goal of pending) await confirmSavingsContribution(accountGuid, goal.guid)
	})
	const revert = (goal: SavingsGoal) => run(() => revertSavingsContribution(accountGuid, goal.guid))

	return (
		<div className="Card QuickActions">
			<div className="CardHeader">
				<h2 className="SectionTitle">Rychlé akce</h2>
				{pending.length > 1 && <button type="button" disabled={submitting} onClick={() => void confirmAll()}>Potvrdit vše ({pending.length})</button>}
			</div>
			<p className="SubText">Potvrďte, že je na spořácích tolik, kolik bylo naplánováno – stav se nastaví k dnešku.</p>
			{error && <p className="ErrorText">{error}</p>}
			<ul className="QuickActionList">
				{due.map((goal) => (
					<li key={goal.guid} className={goal.contributionConfirmed ? 'QuickActionDone' : undefined}>
						<div>
							<strong>{goal.name}</strong>
							<div className="SubText">
								vklad {formatMoney(goal.contributionInMonth)} → stav {formatMoney(goal.expectedBalance)}
							</div>
						</div>
						{goal.contributionConfirmed ? (
							<div className="RowActions">
								<span className="Badge BadgeSuccess">potvrzeno</span>
								<button type="button" className="DeleteLink" disabled={submitting} onClick={() => void revert(goal)}>Vrátit</button>
							</div>
						) : (
							<button type="button" disabled={submitting} onClick={() => void confirm(goal)}>Potvrdit</button>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}

const Tile: React.FC<{ label: string; value: number; highlight?: boolean; children?: React.ReactNode }> = ({ label, value, highlight, children }) => (
	<div className={`Card OverviewTile${highlight ? ' OverviewTileHighlight' : ''}`}>
		<div className="OverviewTileLabel">{label}</div>
		<div className={`OverviewTileValue ${value < 0 ? 'NegativeValue' : ''}`}>{formatMoney(value)}</div>
		{children && <div className="SubText">{children}</div>}
	</div>
)
