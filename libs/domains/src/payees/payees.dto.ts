import { Api } from '@family-finances/shared'
import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export namespace PayeesDto {
	export enum ErrorCodes {
		PayeeNotFound = 'payee_not_found',
		InvalidPayeeName = 'invalid_payee_name',
		DuplicatePayeeName = 'duplicate_payee_name',
		InvalidBankAccount = 'invalid_bank_account',
	}

	export class Payee {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'string' })
		declare name: string

		@ApiProperty({ type: 'string', nullable: true, example: '19-2000145399/0800', description: 'Czech account number or IBAN; null = no QR payment' })
		declare bankAccount: string | null

		@ApiProperty({ type: 'string', nullable: true, example: 'CZ6508000000192000145399', description: 'Computed from bankAccount' })
		declare iban: string | null

		@ApiProperty({ type: 'string', nullable: true, example: '1234567890' })
		declare variableSymbol: string | null

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SavePayee {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 50, example: '19-2000145399/0800', description: 'Czech `[prefix-]number/bank` (checksum validated) or IBAN; empty = none' })
		@IsOptional()
		@IsString()
		@MaxLength(50)
		declare bankAccount?: string | null

		@ApiProperty({ type: 'string', required: false, nullable: true, example: '1234567890', description: 'Up to 10 digits; empty = none' })
		@IsOptional()
		@Matches(/^\d{0,10}$/)
		declare variableSymbol?: string | null
	}

	export class PayeeNotFoundError extends Api.createErrorDto([ErrorCodes.PayeeNotFound]) {}
	export class InvalidPayeeError extends Api.createErrorDto([ErrorCodes.InvalidPayeeName, ErrorCodes.InvalidBankAccount]) {}
	export class DuplicatePayeeNameError extends Api.createErrorDto([ErrorCodes.DuplicatePayeeName]) {}
}
