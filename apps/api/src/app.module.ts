import { DbModule } from '@family-finances/database'
import { Module } from '@nestjs/common'

import { AccountsModule } from './accounts/accounts.module'
import { config } from './app.config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { ExpensesModule } from './expenses/expenses.module'
import { IncomeModule } from './income/income.module'
import { MetersModule } from './meters/meters.module'
import { OverviewModule } from './overview/overview.module'
import { PayeesModule } from './payees/payees.module'
import { SavingsModule } from './savings/savings.module'
import { TaxesModule } from './taxes/taxes.module'

@Module({
	imports: [
		DbModule.forRoot({ core: config.db }),
		AuthModule,
		AccountsModule,
		MetersModule,
		PayeesModule,
		ExpensesModule,
		IncomeModule,
		SavingsModule,
		TaxesModule,
		OverviewModule,
	],
	controllers: [
		AppController,
	],
	providers: [
		AppService,
	],
})
export class AppModule {}
