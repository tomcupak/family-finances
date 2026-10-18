import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { SavingsDto, SavingsService, SavingsTypes } from '@family-finances/domains/savings'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'savings', version: '1' })
@ApiTags('Savings')
@ApiBearerAuth()
export class SavingsControllerV1 {
	constructor(private savingsService: SavingsService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'listSavingsGoals', summary: 'Savings goals with their plan and expected balance at the end of the current month' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal, isArray: true })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async list(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.savingsService.list(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/month/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-10', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'getSavingsMonth', summary: 'Contributions paid in the month and expected balances at its end' })
	@ApiOkResponse({ type: SavingsDto.MonthSavings })
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async getMonth(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			return await this.savingsService.getMonth(accountGuid, month)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Post(':accountGuid')
	@ApiOperation({ operationId: 'createSavingsGoal' })
	@ApiCreatedResponse({ type: SavingsDto.SavingsGoal })
	@ApiBadRequestResponse({ type: SavingsDto.InvalidSavingsGoalError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@HttpCode(HttpStatus.CREATED)
	async create(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Body() body: SavingsDto.SaveSavingsGoal,
	) {
		try {
			return await this.savingsService.create(accountGuid, body)
		} catch (err) {
			if (err instanceof SavingsTypes.InvalidSavingsGoalNameError)
				throw Api.gatewayException(BadRequestException, SavingsDto.ErrorCodes.InvalidSavingsGoalName)
			if (err instanceof SavingsTypes.InvalidSavingsGoalTargetError)
				throw Api.gatewayException(BadRequestException, SavingsDto.ErrorCodes.InvalidSavingsGoalTarget)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/:guid')
	@ApiOperation({ operationId: 'getSavingsGoal' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal })
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	async get(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.savingsService.get(accountGuid, guid)
		} catch (err) {
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid')
	@ApiOperation({ operationId: 'updateSavingsGoal' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal })
	@ApiBadRequestResponse({ type: SavingsDto.InvalidSavingsGoalError })
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	async update(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: SavingsDto.SaveSavingsGoal,
	) {
		try {
			return await this.savingsService.update(accountGuid, guid, body)
		} catch (err) {
			if (err instanceof SavingsTypes.InvalidSavingsGoalNameError)
				throw Api.gatewayException(BadRequestException, SavingsDto.ErrorCodes.InvalidSavingsGoalName)
			if (err instanceof SavingsTypes.InvalidSavingsGoalTargetError)
				throw Api.gatewayException(BadRequestException, SavingsDto.ErrorCodes.InvalidSavingsGoalTarget)
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid/balance')
	@ApiOperation({ operationId: 'updateSavingsBalance', summary: 'Quick balance update - balanceDate defaults to today' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal })
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	async updateBalance(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: SavingsDto.UpdateSavingsBalance,
	) {
		try {
			return await this.savingsService.updateBalance(accountGuid, guid, body)
		} catch (err) {
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}

	@Post(':accountGuid/:guid/confirm')
	@ApiOperation({ operationId: 'confirmSavingsContribution', summary: 'Confirm the current month\'s contribution as deposited - the balance becomes the planned one' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal })
	@ApiConflictResponse({ type: SavingsDto.SavingsContributionNotDueError })
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	@HttpCode(HttpStatus.OK)
	async confirmContribution(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.savingsService.confirmContribution(accountGuid, guid)
		} catch (err) {
			if (err instanceof SavingsTypes.SavingsContributionNotDueError)
				throw Api.gatewayException(ConflictException, SavingsDto.ErrorCodes.SavingsContributionNotDue)
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid/confirm')
	@ApiOperation({ operationId: 'revertSavingsContribution', summary: 'Revert the current month\'s confirmation - the contribution is due again' })
	@ApiOkResponse({ type: SavingsDto.SavingsGoal })
	@ApiConflictResponse({ type: SavingsDto.SavingsContributionNotConfirmedError })
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	async revertContribution(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.savingsService.revertContribution(accountGuid, guid)
		} catch (err) {
			if (err instanceof SavingsTypes.SavingsContributionNotConfirmedError)
				throw Api.gatewayException(ConflictException, SavingsDto.ErrorCodes.SavingsContributionNotConfirmed)
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid')
	@ApiOperation({ operationId: 'removeSavingsGoal' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: SavingsDto.SavingsGoalNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			await this.savingsService.remove(accountGuid, guid)
		} catch (err) {
			if (err instanceof SavingsTypes.SavingsGoalNotFoundError)
				throw Api.gatewayException(NotFoundException, SavingsDto.ErrorCodes.SavingsGoalNotFound)
			throw err
		}
	}
}
