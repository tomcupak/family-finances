import { IncomeModule as DomainIncomeModule } from '@family-finances/domains/income'
import { Module } from '@nestjs/common'

import { IncomeControllerV1 } from './income.controller.v1'

@Module({
	imports: [DomainIncomeModule],
	controllers: [IncomeControllerV1],
})
export class IncomeModule {}
