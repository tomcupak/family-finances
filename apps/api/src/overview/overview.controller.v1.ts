import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { OverviewDto, OverviewService } from '@family-finances/domains/overview'
import { Api } from '@family-finances/shared'
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'overview', version: '1' })
@ApiTags('Overview')
@ApiBearerAuth()
export class OverviewControllerV1 {
	constructor(private overviewService: OverviewService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'getCurrentOverview', summary: 'Overview of the current month' })
	@ApiOkResponse({ type: OverviewDto.MonthOverview })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async getCurrent(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.overviewService.getMonth(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-10', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'getOverview', summary: 'Expenses per category, advances, income, savings, vacation check and what is left to spend in the month' })
	@ApiOkResponse({ type: OverviewDto.MonthOverview })
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async getMonth(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			return await this.overviewService.getMonth(accountGuid, month)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}
}
