import { Module } from '@nestjs/common'

import { ElectricityPricesService } from './electricity-prices.service'

@Module({
	providers: [ElectricityPricesService],
	exports: [ElectricityPricesService],
})
export class ElectricityPricesModule {}
