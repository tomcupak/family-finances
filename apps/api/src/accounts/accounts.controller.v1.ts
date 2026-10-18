import { AccountsDto, AccountsService, AccountsTypes } from '@family-finances/domains/accounts'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'accounts', version: '1' })
@ApiTags('Accounts')
@ApiBearerAuth()
export class AccountsControllerV1 {
	constructor(private accountsService: AccountsService) {}

	@Get()
	@ApiOperation({ operationId: 'listAccounts' })
	@ApiOkResponse({ type: AccountsDto.Account, isArray: true })
	list() {
		return this.accountsService.list()
	}

	@Get(':guid')
	@ApiOperation({ operationId: 'getAccount' })
	@ApiOkResponse({ type: AccountsDto.Account })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async get(@Param('guid', ParseUUIDPipe) guid: string) {
		try {
			return await this.accountsService.get(guid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Post()
	@ApiOperation({ operationId: 'createAccount' })
	@ApiCreatedResponse({ type: AccountsDto.Account })
	@ApiBadRequestResponse({ type: AccountsDto.InvalidAccountNameError })
	@ApiConflictResponse({ type: AccountsDto.DuplicateAccountNameError })
	@HttpCode(HttpStatus.CREATED)
	async create(@Body() body: AccountsDto.SaveAccount) {
		try {
			return await this.accountsService.create(body.name)
		} catch (err) {
			if (err instanceof AccountsTypes.InvalidAccountNameError)
				throw Api.gatewayException(BadRequestException, AccountsDto.ErrorCodes.InvalidAccountName)
			if (err instanceof AccountsTypes.DuplicateAccountNameError)
				throw Api.gatewayException(ConflictException, AccountsDto.ErrorCodes.DuplicateAccountName)
			throw err
		}
	}

	@Patch(':guid')
	@ApiOperation({ operationId: 'renameAccount' })
	@ApiOkResponse({ type: AccountsDto.Account })
	@ApiBadRequestResponse({ type: AccountsDto.InvalidAccountNameError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@ApiConflictResponse({ type: AccountsDto.DuplicateAccountNameError })
	async rename(
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: AccountsDto.SaveAccount,
	) {
		try {
			return await this.accountsService.rename(guid, body.name)
		} catch (err) {
			if (err instanceof AccountsTypes.InvalidAccountNameError)
				throw Api.gatewayException(BadRequestException, AccountsDto.ErrorCodes.InvalidAccountName)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			if (err instanceof AccountsTypes.DuplicateAccountNameError)
				throw Api.gatewayException(ConflictException, AccountsDto.ErrorCodes.DuplicateAccountName)
			throw err
		}
	}

	@Delete(':guid')
	@ApiOperation({ operationId: 'removeAccount' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(@Param('guid', ParseUUIDPipe) guid: string) {
		try {
			await this.accountsService.remove(guid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}
}
