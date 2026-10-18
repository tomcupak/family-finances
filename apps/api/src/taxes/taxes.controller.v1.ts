import { TaxAdvanceKind } from '@family-finances/database'
import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { TaxesDto, TaxesService, TaxesTypes } from '@family-finances/domains/taxes'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'taxes', version: '1' })
@ApiTags('Taxes')
@ApiBearerAuth()
export class TaxesControllerV1 {
	constructor(private taxesService: TaxesService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'listTaxReturns', summary: 'Tax returns of the account (without the calculation), newest first' })
	@ApiOkResponse({ type: TaxesDto.TaxReturnSummary, isArray: true })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async list(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.taxesService.list(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiOperation({ operationId: 'getTaxReturn', summary: 'The year\'s return with the calculation, 12 months of advances and the settlement' })
	@ApiOkResponse({ type: TaxesDto.TaxReturn })
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	async get(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			return await this.taxesService.get(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			throw err
		}
	}

	@Post(':accountGuid')
	@ApiOperation({ operationId: 'createTaxReturn', summary: 'Creates the year\'s return - constants copied from the nearest earlier return, else defaults' })
	@ApiCreatedResponse({ type: TaxesDto.TaxReturn })
	@ApiBadRequestResponse({ type: TaxesDto.InvalidTaxYearError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@ApiConflictResponse({ type: TaxesDto.DuplicateTaxReturnError })
	@HttpCode(HttpStatus.CREATED)
	async create(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Body() body: TaxesDto.CreateTaxReturn,
	) {
		try {
			return await this.taxesService.create(accountGuid, body.year)
		} catch (err) {
			if (err instanceof TaxesTypes.InvalidTaxYearError)
				throw Api.gatewayException(BadRequestException, TaxesDto.ErrorCodes.InvalidTaxYear)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.DuplicateTaxReturnError)
				throw Api.gatewayException(ConflictException, TaxesDto.ErrorCodes.DuplicateTaxReturn)
			throw err
		}
	}

	@Put(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiOperation({ operationId: 'updateTaxReturn', summary: 'Overwrites the year\'s constants and income override' })
	@ApiOkResponse({ type: TaxesDto.TaxReturn })
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	@ApiConflictResponse({ type: TaxesDto.TaxReturnClosedError })
	async update(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
		@Body() body: TaxesDto.SaveTaxReturn,
	) {
		try {
			return await this.taxesService.update(accountGuid, year, body)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			if (err instanceof TaxesTypes.TaxReturnClosedError)
				throw Api.gatewayException(ConflictException, TaxesDto.ErrorCodes.TaxReturnClosed)
			throw err
		}
	}

	@Delete(':accountGuid/:year')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiOperation({ operationId: 'removeTaxReturn', summary: 'Removes the return with its advances' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	@ApiConflictResponse({ type: TaxesDto.TaxReturnClosedError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			await this.taxesService.remove(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			if (err instanceof TaxesTypes.TaxReturnClosedError)
				throw Api.gatewayException(ConflictException, TaxesDto.ErrorCodes.TaxReturnClosed)
			throw err
		}
	}

	@Put(':accountGuid/:year/advances/:month/:kind')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiParam({ name: 'month', type: 'integer', example: 1, description: 'Month number 1-12' })
	@ApiParam({ name: 'kind', enum: TaxAdvanceKind, enumName: 'TaxAdvanceKind' })
	@ApiOperation({ operationId: 'setTaxAdvance', summary: 'Sets the month\'s advance (optionally also for all following months); returns the whole return' })
	@ApiOkResponse({ type: TaxesDto.TaxReturn })
	@ApiBadRequestResponse({ type: TaxesDto.InvalidTaxAdvanceMonthError })
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	@ApiConflictResponse({ type: TaxesDto.TaxReturnClosedError })
	async setAdvance(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
		@Param('month', ParseIntPipe) month: number,
		@Param('kind', new ParseEnumPipe(TaxAdvanceKind)) kind: TaxAdvanceKind,
		@Body() body: TaxesDto.SetTaxAdvance,
	) {
		try {
			return await this.taxesService.setAdvance(accountGuid, year, month, kind, body)
		} catch (err) {
			if (err instanceof TaxesTypes.InvalidTaxAdvanceMonthError)
				throw Api.gatewayException(BadRequestException, TaxesDto.ErrorCodes.InvalidTaxAdvanceMonth)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			if (err instanceof TaxesTypes.TaxReturnClosedError)
				throw Api.gatewayException(ConflictException, TaxesDto.ErrorCodes.TaxReturnClosed)
			throw err
		}
	}

	@Post(':accountGuid/:year/close')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiOperation({ operationId: 'closeTaxReturn', summary: 'Closes the year (only once it is entirely in the past) - locks the return, its advances and the year\'s income' })
	@ApiOkResponse({ type: TaxesDto.TaxReturn })
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	@ApiConflictResponse({ type: TaxesDto.TaxYearNotFinishedError })
	@HttpCode(HttpStatus.OK)
	async close(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			return await this.taxesService.close(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			if (err instanceof TaxesTypes.TaxYearNotFinishedError)
				throw Api.gatewayException(ConflictException, TaxesDto.ErrorCodes.TaxYearNotFinished)
			throw err
		}
	}

	@Post(':accountGuid/:year/reopen')
	@ApiParam({ name: 'year', type: 'integer', example: 2025 })
	@ApiOperation({ operationId: 'reopenTaxReturn', summary: 'Reopens a closed year' })
	@ApiOkResponse({ type: TaxesDto.TaxReturn })
	@ApiNotFoundResponse({ type: TaxesDto.TaxReturnNotFoundError })
	@HttpCode(HttpStatus.OK)
	async reopen(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('year', ParseIntPipe) year: number,
	) {
		try {
			return await this.taxesService.reopen(accountGuid, year)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof TaxesTypes.TaxReturnNotFoundError)
				throw Api.gatewayException(NotFoundException, TaxesDto.ErrorCodes.TaxReturnNotFound)
			throw err
		}
	}
}
