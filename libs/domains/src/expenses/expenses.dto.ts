import { ExpenseCategory, ExpenseRecurrence, UtilityType } from '@family-finances/database'
import { Api, Months } from '@family-finances/shared'
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger'
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator'

import { MetersDto } from '../meters/meters.dto'
import { PayeesDto } from '../payees/payees.dto'
import { TaxesDto } from '../taxes/taxes.dto'

export namespace ExpensesDto {
	export enum ErrorCodes {
		ExpenseNotFound = 'expense_not_found',
		InvalidExpenseName = 'invalid_expense_name',
		InvalidExpenseRange = 'invalid_expense_range',
		LinkedExpenseNotMonthly = 'linked_expense_not_monthly',
		ExpenseNotLinked = 'expense_not_linked',
		UtilityPriceNotFound = 'utility_price_not_found',
		CorrectionNotFound = 'correction_not_found',
		InvalidCorrectionRange = 'invalid_correction_range',
		InvalidCorrectionAmount = 'invalid_correction_amount',
		ExpenseNotInMonth = 'expense_not_in_month',
		PaymentNotInMonth = 'payment_not_in_month',
		PaymentNotFound = 'payment_not_found',
	}

	export class Expense {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare accountGuid: string

		@ApiProperty({ type: 'string' })
		declare name: string

		@ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
		declare category: ExpenseCategory

		@ApiProperty({ type: 'number', description: 'CZK per occurrence (0 for a meter-linked expense; in the month view the computed amount)' })
		declare amount: number

		@ApiProperty({ enum: ExpenseRecurrence, enumName: 'ExpenseRecurrence' })
		declare recurrence: ExpenseRecurrence

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM' })
		declare startMonth: string

		@ApiProperty({ type: 'string', nullable: true, example: '2027-08', description: 'YYYY-MM, inclusive; null = indefinitely (`once` = startMonth)' })
		declare endMonth: string | null

		@ApiProperty({ type: 'string', nullable: true })
		declare note: string | null

		@ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Linked meter sheet - the month amount is consumption × price' })
		declare meterSheetGuid: string | null

		@ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Who the expense is paid to - groups the month payments' })
		declare payeeGuid: string | null

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SaveExpense {
		@ApiProperty({ type: 'string', maxLength: 100 })
		@IsString()
		@MaxLength(100)
		declare name: string

		@ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
		@IsEnum(ExpenseCategory)
		declare category: ExpenseCategory

		@ApiProperty({ type: 'number', minimum: 0, description: 'CZK per occurrence' })
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare amount: number

		@ApiProperty({ enum: ExpenseRecurrence, enumName: 'ExpenseRecurrence' })
		@IsEnum(ExpenseRecurrence)
		declare recurrence: ExpenseRecurrence

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM' })
		@Matches(Months.PATTERN)
		declare startMonth: string

		@ApiProperty({ type: 'string', required: false, nullable: true, example: '2027-08', description: 'YYYY-MM, inclusive; empty = indefinitely. Ignored for `once`.' })
		@IsOptional()
		@Matches(Months.PATTERN)
		declare endMonth?: string | null

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null

		@ApiProperty({ type: 'string', format: 'uuid', required: false, nullable: true, description: 'Links the expense to a meter sheet: requires `monthly`, `amount` is then ignored (stored as 0)' })
		@IsOptional()
		@IsUUID()
		declare meterSheetGuid?: string | null

		@ApiProperty({ type: 'string', format: 'uuid', required: false, nullable: true, description: 'Payee of the same account; empty = nobody in particular' })
		@IsOptional()
		@IsUUID()
		declare payeeGuid?: string | null
	}

	// ── Utility prices (meter-linked expenses) ────────────────────────────────

	export class UtilityPrice {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare expenseGuid: string

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM' })
		declare month: string

		@ApiProperty({ type: 'number', description: 'CZK per unit - VT / the only price (water per m³, gas per m³, electricity per kWh)' })
		declare unitPriceHigh: number

		@ApiProperty({ type: 'number', nullable: true, description: 'CZK per kWh NT - electricity only; null = VT price' })
		declare unitPriceLow: number | null

		@ApiProperty({ type: 'number', description: 'CZK per month (fixed charges)' })
		declare fixedFee: number

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SaveUtilityPrice {
		@ApiProperty({ type: 'number', minimum: 0, description: 'CZK per unit - VT / the only price (water per m³)' })
		@IsNumber({ maxDecimalPlaces: 4 })
		@Min(0)
		declare unitPriceHigh: number

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'NT - electricity only (ignored otherwise); empty = VT price' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 4 })
		@Min(0)
		declare unitPriceLow?: number | null

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'CZK per month; empty = 0' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare fixedFee?: number | null
	}

	export class UtilityCost {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare sheetGuid: string

		@ApiProperty({ type: 'string' })
		declare sheetName: string

		@ApiProperty({ enum: UtilityType, enumName: 'UtilityType' })
		declare utility: UtilityType

		@ApiProperty({ type: 'number', description: 'VT / the only consumption (water in litres)' })
		declare consumptionHigh: number

		@ApiProperty({ type: 'number', nullable: true, description: 'NT - electricity only' })
		declare consumptionLow: number | null

		@ApiProperty({ type: 'number' })
		declare consumptionTotal: number

		@ApiProperty({ type: 'integer', description: 'Readings within the month with a previous one - 0 = no consumption known yet' })
		declare readingCount: number

		@ApiProperty({ type: 'string', nullable: true, example: '2026-08', description: 'Month the used price was set for; null = no price yet (amount 0)' })
		declare priceMonth: string | null

		@ApiProperty({ type: 'boolean', description: 'Price set for this month (otherwise inherited from priceMonth)' })
		declare priceConfirmed: boolean

		@ApiProperty({ type: 'number', nullable: true })
		declare unitPriceHigh: number | null

		@ApiProperty({ type: 'number', nullable: true })
		declare unitPriceLow: number | null

		@ApiProperty({ type: 'number', nullable: true })
		declare fixedFee: number | null
	}

	// ── Corrections (overpayment / underpayment) ──────────────────────────────

	export class Correction {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare guid: string

		@ApiProperty({ type: 'string', format: 'uuid' })
		declare expenseGuid: string

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM - the month the correction is for' })
		declare forMonth: string

		@ApiProperty({ type: 'string', example: '2026-10', description: 'YYYY-MM - the month whose expenses it is counted in' })
		declare applyMonth: string

		@ApiProperty({ type: 'number', description: 'CZK; + underpayment (pay extra), − overpayment (refund)' })
		declare amount: number

		@ApiProperty({ type: 'string', nullable: true })
		declare note: string | null

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare createdAt: Date
	}

	export class SaveCorrection {
		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM - the month the correction is for; the expense must be paid in it' })
		@Matches(Months.PATTERN)
		declare forMonth: string

		@ApiProperty({ type: 'string', required: false, nullable: true, example: '2026-10', description: 'YYYY-MM, not before forMonth; empty = forMonth + 1' })
		@IsOptional()
		@Matches(Months.PATTERN)
		declare applyMonth?: string | null

		@ApiProperty({ type: 'number', required: false, nullable: true, description: 'The difference itself (+ underpayment, − overpayment). Exactly one of amount / paidAmount.' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		declare amount?: number | null

		@ApiProperty({ type: 'number', minimum: 0, required: false, nullable: true, description: 'Really paid amount - the difference to the computed month amount is stored. Exactly one of amount / paidAmount.' })
		@IsOptional()
		@IsNumber({ maxDecimalPlaces: 2 })
		@Min(0)
		declare paidAmount?: number | null

		@ApiProperty({ type: 'string', required: false, nullable: true, maxLength: 500 })
		@IsOptional()
		@IsString()
		@MaxLength(500)
		declare note?: string | null
	}

	export class MonthCorrection extends Correction {
		@ApiProperty({ type: 'string' })
		declare expenseName: string

		@ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
		declare category: ExpenseCategory

		@ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'The expense\'s payee - the correction is part of its payment' })
		declare payeeGuid: string | null
	}

	// ── Payments (expenses grouped by payee) ──────────────────────────────────

	export class MonthPayment {
		@ApiProperty({ type: PayeesDto.Payee })
		declare payee: PayeesDto.Payee

		@ApiProperty({ type: 'string', format: 'uuid', isArray: true, description: 'The payee\'s expenses paid in the month' })
		declare expenseGuids: string[]

		@ApiProperty({ type: 'string', format: 'uuid', isArray: true, description: 'Corrections of the payee\'s expenses applied in the month' })
		declare correctionGuids: string[]

		@ApiProperty({ type: 'number', description: 'CZK - expenses + corrections' })
		declare amount: number

		@ApiProperty({ type: 'number', nullable: true, description: 'Amount when marked as paid; null = not paid. Differs from amount when the month changed since.' })
		declare paidAmount: number | null

		@ApiProperty({ type: 'string', format: 'date-time', nullable: true })
		declare paidAt: Date | null

		@ApiProperty({ type: 'string', nullable: true, description: 'QR payment string (SPAYD); null without a bank account or a positive amount' })
		declare spayd: string | null
	}

	export class PaidMark {
		@ApiProperty({ type: 'string', format: 'uuid' })
		declare payeeGuid: string

		@ApiProperty({ type: 'string', example: '2026-09', description: 'YYYY-MM' })
		declare month: string

		@ApiProperty({ type: 'number', description: 'CZK - the payment amount when marked' })
		declare amount: number

		@ApiProperty({ type: 'string', format: 'date-time' })
		declare paidAt: Date
	}

	@ApiExtraModels(UtilityCost)
	export class MonthExpense extends Expense {
		// `nullable` on a plain class-ref property isn't valid OpenAPI 3 - wrapped in `allOf`.
		@ApiProperty({ allOf: [{ $ref: getSchemaPath(UtilityCost) }], nullable: true, description: 'Meter-linked expenses only; `amount` is then computed' })
		declare utility: UtilityCost | null

		@ApiProperty({ type: Correction, isArray: true, description: 'Corrections of this month\'s amount (forMonth = the month), counted in their applyMonth' })
		declare corrections: Correction[]
	}

	export class CategoryTotal {
		@ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
		declare category: ExpenseCategory

		@ApiProperty({ type: 'number' })
		declare total: number
	}

	export class MonthExpenses {
		@ApiProperty({ type: 'string', example: '2026-09' })
		declare month: string

		@ApiProperty({ type: MonthExpense, isArray: true, description: 'Expenses paid in the month, ordered by category and name' })
		declare items: MonthExpense[]

		@ApiProperty({ type: MonthCorrection, isArray: true, description: 'Corrections counted in the month (applyMonth), included in categories and total' })
		declare corrections: MonthCorrection[]

		@ApiProperty({ type: MonthPayment, isArray: true, description: 'Payments to payees in the month (items + applied corrections grouped by payee), ordered by payee name' })
		declare payments: MonthPayment[]

		@ApiProperty({ type: TaxesDto.MonthAdvances, description: 'Tax return advances paid in the month, included in the taxes category and total' })
		declare taxAdvances: TaxesDto.MonthAdvances

		@ApiProperty({ type: CategoryTotal, isArray: true, description: 'All categories, zero when nothing is paid; corrections and tax advances included' })
		declare categories: CategoryTotal[]

		@ApiProperty({ type: 'number' })
		declare total: number
	}

	export class ExpenseNotFoundError extends Api.createErrorDto([ErrorCodes.ExpenseNotFound]) {}
	export class InvalidExpenseError extends Api.createErrorDto([
		ErrorCodes.InvalidExpenseName,
		ErrorCodes.InvalidExpenseRange,
		ErrorCodes.LinkedExpenseNotMonthly,
		MetersDto.ErrorCodes.SheetNotFound,
		PayeesDto.ErrorCodes.PayeeNotFound,
	]) {}
	export class InvalidUtilityPriceError extends Api.createErrorDto([ErrorCodes.ExpenseNotLinked, Api.MonthErrorCodes.InvalidMonth]) {}
	export class UtilityPriceNotFoundError extends Api.createErrorDto([ErrorCodes.UtilityPriceNotFound, ErrorCodes.ExpenseNotFound]) {}
	export class InvalidCorrectionError extends Api.createErrorDto([
		ErrorCodes.InvalidCorrectionRange,
		ErrorCodes.InvalidCorrectionAmount,
		ErrorCodes.ExpenseNotInMonth,
	]) {}
	export class CorrectionNotFoundError extends Api.createErrorDto([ErrorCodes.CorrectionNotFound, ErrorCodes.ExpenseNotFound]) {}
	export class PaymentNotInMonthError extends Api.createErrorDto([ErrorCodes.PaymentNotInMonth, Api.MonthErrorCodes.InvalidMonth]) {}
	export class PaymentNotFoundError extends Api.createErrorDto([ErrorCodes.PaymentNotFound, PayeesDto.ErrorCodes.PayeeNotFound]) {}
}
