import { ApiProperty } from '@nestjs/swagger'

export namespace AuthDto {
	export class VerifyResponse {
		@ApiProperty({ type: 'boolean' })
		declare ok: boolean
	}
}
