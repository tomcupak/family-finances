import { Module } from '@nestjs/common'

import { ExpensesModule } from '../expenses/expenses.module'
import { IncomeModule } from '../income/income.module'
import { SavingsModule } from '../savings/savings.module'
import { OverviewService } from './overview.service'

@Module({
	imports: [ExpensesModule, IncomeModule, SavingsModule],
	providers: [OverviewService],
	exports: [OverviewService],
})
export class OverviewModule {}
