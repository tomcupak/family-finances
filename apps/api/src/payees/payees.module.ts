import { PayeesModule as DomainPayeesModule } from '@family-finances/domains/payees'
import { Module } from '@nestjs/common'

import { PayeesControllerV1 } from './payees.controller.v1'

@Module({
	imports: [DomainPayeesModule],
	controllers: [PayeesControllerV1],
})
export class PayeesModule {}
