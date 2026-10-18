import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'

export namespace AccountsDto {
	export enum ErrorCodes {
		DuplicateAccountName = 'duplicate_account_name',
		AccountNotFound = 'account_not_found',
		InvalidAccountName = 'invalid_account_name',
	}

	export class Account {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string' })
		declare name: string

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SaveAccount {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string
	}

	export class DuplicateAccountNameError extends Api.createErrorDto([ErrorCodes.DuplicateAccountName]) {}
	export class AccountNotFoundError extends Api.createErrorDto([ErrorCodes.AccountNotFound]) {}
	export class InvalidAccountNameError extends Api.createErrorDto([ErrorCodes.InvalidAccountName]) {}
}
