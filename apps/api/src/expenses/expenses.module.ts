import { ExpensesModule as DomainExpensesModule } from '@family-finances/domains/expenses'
import { Module } from '@nestjs/common'

import { ExpensesControllerV1 } from './expenses.controller.v1'

@Module({
	imports: [DomainExpensesModule],
	controllers: [ExpensesControllerV1],
})
export class ExpensesModule {}
