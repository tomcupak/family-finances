import { Module } from '@nestjs/common'

import { AccountsModule } from '../accounts/accounts.module'
import { MetersModule } from '../meters/meters.module'
import { PayeesModule } from '../payees/payees.module'
import { TaxesModule } from '../taxes/taxes.module'
import { ExpensesService } from './expenses.service'

@Module({
	imports: [AccountsModule, MetersModule, PayeesModule, TaxesModule],
	providers: [ExpensesService],
	exports: [ExpensesService],
})
export class ExpensesModule {}
