import { Module } from '@nestjs/common'

import { AccountsModule } from '../accounts/accounts.module'
import { PayeesService } from './payees.service'

@Module({
	imports: [AccountsModule],
	providers: [PayeesService],
	exports: [PayeesService],
})
export class PayeesModule {}
