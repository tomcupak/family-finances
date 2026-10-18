import { AccountsModule as DomainAccountsModule } from '@family-finances/domains/accounts'
import { Module } from '@nestjs/common'

import { AccountsControllerV1 } from './accounts.controller.v1'

@Module({
	imports: [DomainAccountsModule],
	controllers: [AccountsControllerV1],
})
export class AccountsModule {}
