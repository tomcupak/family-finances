import { Module } from '@nestjs/common'

import { AccountsModule } from '../accounts/accounts.module'
import { SavingsService } from './savings.service'

@Module({
	imports: [AccountsModule],
	providers: [SavingsService],
	exports: [SavingsService],
})
export class SavingsModule {}
