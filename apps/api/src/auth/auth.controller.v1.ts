import { AuthDto } from '@family-finances/domains/auth'
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'auth', version: '1' })
@ApiTags('Auth')
export class AuthControllerV1 {

	@Get('verify')
	@ApiBearerAuth()
	@ApiOperation({ operationId: 'verifyToken', description: 'Succeeds only if the caller sent a valid bearer token - used by the frontend to validate a pasted token before storing it.' })
	@ApiOkResponse({ type: AuthDto.VerifyResponse })
	@HttpCode(HttpStatus.OK)
	verify(): AuthDto.VerifyResponse {
		return { ok: true }
	}
}
