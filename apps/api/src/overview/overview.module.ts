import { OverviewModule as DomainOverviewModule } from '@family-finances/domains/overview'
import { Module } from '@nestjs/common'

import { OverviewControllerV1 } from './overview.controller.v1'

@Module({
	imports: [DomainOverviewModule],
	controllers: [OverviewControllerV1],
})
export class OverviewModule {}
