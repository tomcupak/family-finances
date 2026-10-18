import { SavingsModule as DomainSavingsModule } from '@family-finances/domains/savings'
import { Module } from '@nestjs/common'

import { SavingsControllerV1 } from './savings.controller.v1'

@Module({
	imports: [DomainSavingsModule],
	controllers: [SavingsControllerV1],
})
export class SavingsModule {}
