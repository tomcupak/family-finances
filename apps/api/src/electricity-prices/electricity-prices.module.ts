import { ElectricityPricesModule as DomainElectricityPricesModule } from '@family-finances/domains/electricity-prices'
import { Module } from '@nestjs/common'

import { ElectricityPricesControllerV1 } from './electricity-prices.controller.v1'

@Module({
	imports: [DomainElectricityPricesModule],
	controllers: [ElectricityPricesControllerV1],
})
export class ElectricityPricesModule {}
