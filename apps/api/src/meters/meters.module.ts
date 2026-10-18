import { MetersModule as DomainMetersModule } from '@family-finances/domains/meters'
import { Module } from '@nestjs/common'

import { MetersControllerV1 } from './meters.controller.v1'

@Module({
	imports: [DomainMetersModule],
	controllers: [MetersControllerV1],
})
export class MetersModule {}
