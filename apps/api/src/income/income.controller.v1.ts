import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { IncomeDto, IncomeService, IncomeTypes } from '@family-finances/domains/income'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'income', version: '1' })
@ApiTags('Income')
@ApiBearerAuth()
export class IncomeControllerV1 {
	constructor(private incomeService: IncomeService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'listIncomeYears', summary: 'Income years of the account (without months), newest first' })
	@ApiOkResponse({ type: IncomeDto.IncomeYearSummary, isArray: true })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async listYears(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.incomeService.listYears(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2026 })
	@ApiOperation({ operationId: 'getIncomeYear', summary: 'The year\'s 12 months with totals and the cumulative vacation check' })
	@ApiOkResponse({ type: IncomeDto.IncomeYear })
	@ApiNotFoundResponse({ type: IncomeDto.IncomeYearNotFoundError })
	async getYear(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			return await this.incomeService.getYear(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof IncomeTypes.IncomeYearNotFoundError)
				throw Api.gatewayException(NotFoundException, IncomeDto.ErrorCodes.IncomeYearNotFound)
			throw err
		}
	}

	@Post(':accountGuid')
	@ApiOperation({ operationId: 'createIncomeYear', summary: 'Creates the year with 12 months (working days by the Czech calendar)' })
	@ApiCreatedResponse({ type: IncomeDto.IncomeYear })
	@ApiBadRequestResponse({ type: IncomeDto.InvalidIncomeYearError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@ApiConflictResponse({ type: IncomeDto.DuplicateIncomeYearError })
	@HttpCode(HttpStatus.CREATED)
	async createYear(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Body() body: IncomeDto.CreateIncomeYear,
	) {
		try {
			return await this.incomeService.createYear(accountGuid, body)
		} catch (err) {
			if (err instanceof IncomeTypes.InvalidIncomeYearError)
				throw Api.gatewayException(BadRequestException, IncomeDto.ErrorCodes.InvalidIncomeYear)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof IncomeTypes.DuplicateIncomeYearError)
				throw Api.gatewayException(ConflictException, IncomeDto.ErrorCodes.DuplicateIncomeYear)
			if (err instanceof IncomeTypes.IncomeYearLockedError)
				throw Api.gatewayException(ConflictException, IncomeDto.ErrorCodes.IncomeYearLocked)
			throw err
		}
	}

	@Put(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2026 })
	@ApiOperation({ operationId: 'updateIncomeYear', summary: 'Changes the type / default hourly rate (months still on the previous default follow it)' })
	@ApiOkResponse({ type: IncomeDto.IncomeYear })
	@ApiNotFoundResponse({ type: IncomeDto.IncomeYearNotFoundError })
	@ApiConflictResponse({ type: IncomeDto.IncomeYearLockedError })
	async updateYear(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
		@Body() body: IncomeDto.SaveIncomeYearSettings,
	) {
		try {
			return await this.incomeService.updateYear(accountGuid, year, body)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof IncomeTypes.IncomeYearNotFoundError)
				throw Api.gatewayException(NotFoundException, IncomeDto.ErrorCodes.IncomeYearNotFound)
			if (err instanceof IncomeTypes.IncomeYearLockedError)
				throw Api.gatewayException(ConflictException, IncomeDto.ErrorCodes.IncomeYearLocked)
			throw err
		}
	}

	@Delete(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2026 })
	@ApiOperation({ operationId: 'removeIncomeYear' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: IncomeDto.IncomeYearNotFoundError })
	@ApiConflictResponse({ type: IncomeDto.IncomeYearLockedError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removeYear(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			await this.incomeService.removeYear(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof IncomeTypes.IncomeYearNotFoundError)
				throw Api.gatewayException(NotFoundException, IncomeDto.ErrorCodes.IncomeYearNotFound)
			if (err instanceof IncomeTypes.IncomeYearLockedError)
				throw Api.gatewayException(ConflictException, IncomeDto.ErrorCodes.IncomeYearLocked)
			throw err
		}
	}

	@Put(':accountGuid/:year/months/:month')
	@ApiParam({ name: 'year', type: 'integer', example: 2026 })
	@ApiParam({ name: 'month', type: 'integer', example: 9, description: 'Month number 1-12' })
	@ApiOperation({ operationId: 'updateIncomeMonth', summary: 'Overwrites one month; returns the whole year (totals and vacation check change)' })
	@ApiOkResponse({ type: IncomeDto.IncomeYear })
	@ApiBadRequestResponse({ type: IncomeDto.InvalidIncomeMonthError })
	@ApiNotFoundResponse({ type: IncomeDto.IncomeYearNotFoundError })
	@ApiConflictResponse({ type: IncomeDto.IncomeYearLockedError })
	async updateMonth(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
		@Param('month', ParseIntPipe) month: number,
		@Body() body: IncomeDto.SaveIncomeMonth,
	) {
		try {
			return await this.incomeService.updateMonth(accountGuid, year, month, body)
		} catch (err) {
			if (err instanceof IncomeTypes.InvalidIncomeMonthError)
				throw Api.gatewayException(BadRequestException, IncomeDto.ErrorCodes.InvalidIncomeMonth)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof IncomeTypes.IncomeYearNotFoundError)
				throw Api.gatewayException(NotFoundException, IncomeDto.ErrorCodes.IncomeYearNotFound)
			if (err instanceof IncomeTypes.IncomeYearLockedError)
				throw Api.gatewayException(ConflictException, IncomeDto.ErrorCodes.IncomeYearLocked)
			throw err
		}
	}
}
