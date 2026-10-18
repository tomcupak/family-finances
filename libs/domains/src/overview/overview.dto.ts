import { IncomeType } from '@family-finances/database'
import { ApiProperty } from '@nestjs/swagger'

import { ExpensesDto } from '../expenses/expenses.dto'
import { SavingsDto } from '../savings/savings.dto'
import { TaxesDto } from '../taxes/taxes.dto'

export namespace OverviewDto {
	export class OverviewExpenses {
		@ApiProperty({ type: ExpensesDto.CategoryTotal, isArray: true, description: 'All categories, zero when nothing is paid; meter-linked amounts, applied corrections and tax advances (taxes category) included' })
		declare categories: ExpensesDto.CategoryTotal[]

		@ApiProperty({ type: 'number' })
		declare total: number

		@ApiProperty({ type: 'number', description: 'Σ corrections applied in the month (already in categories/total): + underpayment, − overpayment' })
		declare correctionsTotal: number

		@ApiProperty({ type: 'integer', description: 'Meter-linked expenses whose price for the month is not confirmed yet' })
		declare unconfirmedPrices: number
	}

	export class OverviewIncome {
		@ApiProperty({ enum: IncomeType, enumName: 'IncomeType', nullable: true, description: 'null = no income plan for the year' })
		declare type: IncomeType | null

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM the income is for - the month before the overview month (paid out a month later)' })
		declare forMonth: string

		@ApiProperty({ type: 'number', description: 'OSVČ: the real invoice (earned); HPP: netSalary ?? grossSalary; 0 without a plan' })
		declare amount: number
	}

	export class MonthOverview {
		@ApiProperty({ type: 'string', example: '2026-10' })
		declare month: string

		@ApiProperty({ type: OverviewExpenses })
		declare expenses: OverviewExpenses

		@ApiProperty({ type: TaxesDto.MonthAdvances, description: 'Social / health / tax advances of the month - already included in expenses (taxes category)' })
		declare advances: TaxesDto.MonthAdvances

		@ApiProperty({ type: OverviewIncome, description: 'Income received in the month = the one for the previous month' })
		declare income: OverviewIncome

		@ApiProperty({ type: SavingsDto.MonthSavings, description: 'Contributions paid in the month and expected balances at its end' })
		declare savings: SavingsDto.MonthSavings

		@ApiProperty({ type: 'number', nullable: true, description: 'OSVČ transfer to the vacation savings account with the income (earned − expectedInvoice of income.forMonth, − = withdrawal); null for HPP / no plan' })
		declare vacationSaving: number | null

		@ApiProperty({ type: 'number', nullable: true, description: 'OSVČ vacation check from January up to income.forMonth incl. (Σ earned − Σ expectedInvoice); null for HPP / no plan' })
		declare vacationBalance: number | null

		@ApiProperty({ type: 'number', description: 'income − vacation saving − expenses (incl. advances) − savings contributions' })
		declare remaining: number
	}
}
