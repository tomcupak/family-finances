import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

import * as Months from '../months/months'
import { createErrorDto, gatewayException } from './errors'

export enum MonthErrorCodes {
	InvalidMonth = 'invalid_month',
}

export class InvalidMonthError extends createErrorDto([MonthErrorCodes.InvalidMonth]) {}

/** Validates a `YYYY-MM` path/query param; responds 400 `{ code: 'invalid_month' }` otherwise. */
@Injectable()
export class ParseMonthPipe implements PipeTransform<string, string> {
	transform(value: string): string {
		if (typeof value !== 'string' || !Months.isValid(value))
			throw gatewayException(BadRequestException, MonthErrorCodes.InvalidMonth)
		return value
	}
}
