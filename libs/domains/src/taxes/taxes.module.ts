import { Module } from '@nestjs/common'

import { AccountsModule } from '../accounts/accounts.module'
import { IncomeModule } from '../income/income.module'
import { TaxesService } from './taxes.service'

@Module({
	imports: [AccountsModule, IncomeModule],
	providers: [TaxesService],
	exports: [TaxesService],
})
export class TaxesModule {}
