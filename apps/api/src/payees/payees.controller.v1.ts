import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { PayeesDto, PayeesService, PayeesTypes } from '@family-finances/domains/payees'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'payees', version: '1' })
@ApiTags('Payees')
@ApiBearerAuth()
export class PayeesControllerV1 {
	constructor(private payeesService: PayeesService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'listPayees', summary: 'Payees of the account ordered by name' })
	@ApiOkResponse({ type: PayeesDto.Payee, isArray: true })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async list(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.payeesService.list(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Post(':accountGuid')
	@ApiOperation({ operationId: 'createPayee' })
	@ApiCreatedResponse({ type: PayeesDto.Payee })
	@ApiBadRequestResponse({ type: PayeesDto.InvalidPayeeError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@ApiConflictResponse({ type: PayeesDto.DuplicatePayeeNameError })
	@HttpCode(HttpStatus.CREATED)
	async create(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Body() body: PayeesDto.SavePayee,
	) {
		try {
			return await this.payeesService.create(accountGuid, body)
		} catch (err) {
			if (err instanceof PayeesTypes.InvalidPayeeNameError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.InvalidPayeeName)
			if (err instanceof PayeesTypes.InvalidBankAccountError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.InvalidBankAccount)
			if (err instanceof PayeesTypes.DuplicatePayeeNameError)
				throw Api.gatewayException(ConflictException, PayeesDto.ErrorCodes.DuplicatePayeeName)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid')
	@ApiOperation({ operationId: 'updatePayee' })
	@ApiOkResponse({ type: PayeesDto.Payee })
	@ApiBadRequestResponse({ type: PayeesDto.InvalidPayeeError })
	@ApiNotFoundResponse({ type: PayeesDto.PayeeNotFoundError })
	@ApiConflictResponse({ type: PayeesDto.DuplicatePayeeNameError })
	async update(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: PayeesDto.SavePayee,
	) {
		try {
			return await this.payeesService.update(accountGuid, guid, body)
		} catch (err) {
			if (err instanceof PayeesTypes.InvalidPayeeNameError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.InvalidPayeeName)
			if (err instanceof PayeesTypes.InvalidBankAccountError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.InvalidBankAccount)
			if (err instanceof PayeesTypes.DuplicatePayeeNameError)
				throw Api.gatewayException(ConflictException, PayeesDto.ErrorCodes.DuplicatePayeeName)
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(NotFoundException, PayeesDto.ErrorCodes.PayeeNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid')
	@ApiOperation({ operationId: 'removePayee', summary: 'Deletes the payee - its expenses stay without a payee' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: PayeesDto.PayeeNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			await this.payeesService.remove(accountGuid, guid)
		} catch (err) {
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(NotFoundException, PayeesDto.ErrorCodes.PayeeNotFound)
			throw err
		}
	}
}
