import { IncomeType } from '@family-finances/database'

import { ExpensesTypes } from '../expenses/expenses.types'
import { SavingsTypes } from '../savings/savings.types'
import { TaxesTypes } from '../taxes/taxes.types'

export namespace OverviewTypes {
	/** Expenses of the month as `ExpensesService.getMonth` totals them (meter-linked amounts and applied corrections included). */
	export interface Expenses {
		/** All categories in `ExpensesTypes.CATEGORY_ORDER`, zero when nothing is paid. */
		categories: ExpensesTypes.CategoryTotal[]
		total: number
		/** Σ corrections applied in the month (already part of `categories`/`total`): + underpayment, − overpayment. */
		correctionsTotal: number
		/** Meter-linked expenses whose price for the month isn't confirmed yet (the amount uses an inherited price or 0). */
		unconfirmedPrices: number
	}

	export interface Income {
		/** Type of the year's income plan; `null` = no plan for the year (amount 0). */
		type: IncomeType | null
		/** `YYYY-MM` the income is for - the month before the overview's month (it is paid out a month later). */
		forMonth: string
		/** OSVČ: the real invoice (`earned`); HPP: netSalary ?? grossSalary. */
		amount: number
	}

	export interface MonthOverview {
		/** `YYYY-MM` */
		month: string
		expenses: Expenses
		/** Social / health / tax advances paid in the month - a separate item, not part of `expenses`. */
		advances: TaxesTypes.MonthAdvances
		/** Income received in the month = the one for the previous month (`forMonth`). */
		income: Income
		/** Contributions paid in the month and expected balances at its end. */
		savings: SavingsTypes.MonthSavings
		/** OSVČ transfer to the vacation savings account with the income (earned − expectedInvoice of `income.forMonth`, − = withdrawal); `null` for HPP / no income plan. */
		vacationSaving: number | null
		/** OSVČ vacation check from January up to `income.forMonth` incl. (Σ earned − Σ expectedInvoice); `null` for HPP / no income plan. */
		vacationBalance: number | null
		/** income − vacation saving − expenses − advances − savings contributions. */
		remaining: number
	}
}
