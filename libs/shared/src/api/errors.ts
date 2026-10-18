import { ForbiddenException } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'

export function gatewayException(Exception: typeof ForbiddenException, code: string) {
	return new Exception({ code })
}

export function createErrorDto<Codes extends string[]>(codes: Codes) {
	class ErrorDto {
		static readonly ErrorCodes = [...codes] as const

		@ApiProperty({
			enum: ErrorDto.ErrorCodes,
			example: ErrorDto.ErrorCodes[0]
		})
		@IsEnum(ErrorDto.ErrorCodes)
		declare code: (typeof ErrorDto.ErrorCodes)[number]
	}

	return ErrorDto
}
