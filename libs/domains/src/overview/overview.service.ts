import { IncomeType } from '@family-finances/database'
import { Months } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'

import { ExpensesService } from '../expenses/expenses.service'
import { ExpensesTypes } from '../expenses/expenses.types'
import { IncomeService } from '../income/income.service'
import { IncomeTypes } from '../income/income.types'
import { SavingsService } from '../savings/savings.service'
import { OverviewTypes } from './overview.types'

/** Composes the month overview from the other domains' public readers - computes nothing they already do. */
@Injectable()
export class OverviewService {
	constructor(
		private expensesService: ExpensesService,
		private incomeService: IncomeService,
		private savingsService: SavingsService,
	) {}

	/**
	 * Overview of `month` (`YYYY-MM`, default the month of `today`) from the point of view of what is paid in it:
	 * the salary / invoice received in the month is the one **for the previous month** (and so is the OSVČ vacation
	 * saving / check, which is bound to it), while expenses (incl. tax advances) and savings contributions are those
	 * **of the month** itself. `today` (`YYYY-MM-DD`) is the day savings plans are computed as of.
	 */
	async getMonth(accountGuid: string, month?: string | null, today: string = Months.today()): Promise<OverviewTypes.MonthOverview> {
		const target = month || Months.fromDate(today)
		if (!Months.isValid(target)) throw new Error(`Invalid month "${target}", expected YYYY-MM`)
		const incomeMonth = Months.add(target, -1)
		const [expenses, incomeYear, savings] = await Promise.all([
			this.expensesService.getMonth(accountGuid, target),
			this.incomeService.findYear(accountGuid, Number(incomeMonth.slice(0, 4))),
			this.savingsService.getMonth(accountGuid, target, today),
		])
		const paidMonth = incomeYear?.months.find((m) => m.month === Number(incomeMonth.slice(5, 7))) ?? null
		const income = this.incomeOf(incomeYear?.type ?? null, incomeMonth, paidMonth)
		const selfEmployed = incomeYear?.type === IncomeType.self_employed && paidMonth !== null
		const vacationSaving = selfEmployed ? paidMonth.vacationSaving : null
		return {
			month: target,
			expenses: this.expensesOf(expenses),
			advances: expenses.taxAdvances,
			income,
			savings,
			vacationSaving,
			vacationBalance: selfEmployed ? paidMonth.vacationBalance : null,
			// Tax advances are already in `expenses.total`.
			remaining: this.roundMoney(income.amount - (vacationSaving ?? 0) - expenses.total - savings.totalContribution),
		}
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/** OSVČ: the real invoice (`earned`); HPP: net salary, gross when net isn't filled in; no plan: 0. */
	private incomeOf(type: IncomeType | null, forMonth: string, month: IncomeTypes.IncomeMonth | null): OverviewTypes.Income {
		if (type === null || month === null) return { type: null, forMonth, amount: 0 }
		const amount = type === IncomeType.self_employed ? month.earned : (month.netSalary ?? month.grossSalary)
		return { type, forMonth, amount }
	}

	private expensesOf(month: ExpensesTypes.MonthExpenses): OverviewTypes.Expenses {
		return {
			categories: month.categories,
			total: month.total,
			correctionsTotal: this.roundMoney(month.corrections.reduce((sum, c) => sum + c.amount, 0)),
			unconfirmedPrices: month.items.filter((i) => i.utility !== null && !i.utility.priceConfirmed).length,
		}
	}

	private roundMoney(value: number) {
		return Math.round(value * 100) / 100
	}
}
