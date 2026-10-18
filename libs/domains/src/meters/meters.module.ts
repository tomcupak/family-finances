import { Module } from '@nestjs/common'

import { MetersService } from './meters.service'

@Module({
	providers: [MetersService],
	exports: [MetersService],
})
export class MetersModule {}
