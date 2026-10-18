import { TaxesModule as DomainTaxesModule } from '@family-finances/domains/taxes'
import { Module } from '@nestjs/common'

import { TaxesControllerV1 } from './taxes.controller.v1'

@Module({
	imports: [DomainTaxesModule],
	controllers: [TaxesControllerV1],
})
export class TaxesModule {}
