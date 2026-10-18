import { Module } from '@nestjs/common'

import { AccountsModule } from '../accounts/accounts.module'
import { IncomeService } from './income.service'

@Module({
	imports: [AccountsModule],
	providers: [IncomeService],
	exports: [IncomeService],
})
export class IncomeModule {}
