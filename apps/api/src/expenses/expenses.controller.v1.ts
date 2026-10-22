import { AccountsDto, AccountsTypes } from '@family-finances/domains/accounts'
import { ElectricityPricesDto, ElectricityPricesTypes } from '@family-finances/domains/electricity-prices'
import { ExpensesDto, ExpensesService, ExpensesTypes } from '@family-finances/domains/expenses'
import { MetersDto, MetersTypes } from '@family-finances/domains/meters'
import { PayeesDto, PayeesTypes } from '@family-finances/domains/payees'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'expenses', version: '1' })
@ApiTags('Expenses')
@ApiBearerAuth()
export class ExpensesControllerV1 {
	constructor(private expensesService: ExpensesService) {}

	@Get(':accountGuid')
	@ApiOperation({ operationId: 'listExpenses', summary: 'All expense definitions of the account, incl. ended ones' })
	@ApiOkResponse({ type: ExpensesDto.Expense, isArray: true })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async list(@Param('accountGuid', ParseUUIDPipe) accountGuid: string) {
		try {
			return await this.expensesService.list(accountGuid)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/month/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'getExpensesMonth', summary: 'Expenses paid in the month + totals per category' })
	@ApiOkResponse({ type: ExpensesDto.MonthExpenses })
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	async getMonth(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			return await this.expensesService.getMonth(accountGuid, month)
		} catch (err) {
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Post(':accountGuid')
	@ApiOperation({ operationId: 'createExpense' })
	@ApiCreatedResponse({ type: ExpensesDto.Expense })
	@ApiBadRequestResponse({ type: ExpensesDto.InvalidExpenseError })
	@ApiNotFoundResponse({ type: AccountsDto.AccountNotFoundError })
	@HttpCode(HttpStatus.CREATED)
	async create(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Body() body: ExpensesDto.SaveExpense,
	) {
		try {
			return await this.expensesService.create(accountGuid, body)
		} catch (err) {
			if (err instanceof ExpensesTypes.InvalidExpenseNameError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidExpenseName)
			if (err instanceof ExpensesTypes.InvalidExpenseRangeError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidExpenseRange)
			if (err instanceof ExpensesTypes.LinkedExpenseNotMonthlyError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.LinkedExpenseNotMonthly)
			if (err instanceof ExpensesTypes.SupplierRequiresElectricitySheetError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.SupplierRequiresElectricitySheet)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.SheetNotFound)
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.PayeeNotFound)
			if (err instanceof AccountsTypes.AccountNotFoundError)
				throw Api.gatewayException(NotFoundException, AccountsDto.ErrorCodes.AccountNotFound)
			throw err
		}
	}

	@Get(':accountGuid/:guid')
	@ApiOperation({ operationId: 'getExpense' })
	@ApiOkResponse({ type: ExpensesDto.Expense })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	async get(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.expensesService.get(accountGuid, guid)
		} catch (err) {
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid')
	@ApiOperation({ operationId: 'updateExpense' })
	@ApiOkResponse({ type: ExpensesDto.Expense })
	@ApiBadRequestResponse({ type: ExpensesDto.InvalidExpenseError })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	async update(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: ExpensesDto.SaveExpense,
	) {
		try {
			return await this.expensesService.update(accountGuid, guid, body)
		} catch (err) {
			if (err instanceof ExpensesTypes.InvalidExpenseNameError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidExpenseName)
			if (err instanceof ExpensesTypes.InvalidExpenseRangeError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidExpenseRange)
			if (err instanceof ExpensesTypes.LinkedExpenseNotMonthlyError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.LinkedExpenseNotMonthly)
			if (err instanceof ExpensesTypes.SupplierRequiresElectricitySheetError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.SupplierRequiresElectricitySheet)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.SheetNotFound)
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(BadRequestException, PayeesDto.ErrorCodes.PayeeNotFound)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid')
	@ApiOperation({ operationId: 'removeExpense' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			await this.expensesService.remove(accountGuid, guid)
		} catch (err) {
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	// ── Payments (expenses grouped by payee) ──────────────────────────────────

	@Put(':accountGuid/payees/:payeeGuid/payments/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'markPaymentPaid', summary: 'Marks the payee\'s payment of the month (all its expenses) as paid with its current amount' })
	@ApiOkResponse({ type: ExpensesDto.PaidMark })
	@ApiBadRequestResponse({ type: ExpensesDto.PaymentNotInMonthError })
	@ApiNotFoundResponse({ type: PayeesDto.PayeeNotFoundError })
	async markPaid(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('payeeGuid', ParseUUIDPipe) payeeGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			return await this.expensesService.markPaid(accountGuid, payeeGuid, month)
		} catch (err) {
			if (err instanceof ExpensesTypes.PaymentNotInMonthError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.PaymentNotInMonth)
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(NotFoundException, PayeesDto.ErrorCodes.PayeeNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/payees/:payeeGuid/payments/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'unmarkPaymentPaid', summary: 'Removes the paid mark of the payee\'s payment of the month' })
	@ApiNoContentResponse()
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: ExpensesDto.PaymentNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async unmarkPaid(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('payeeGuid', ParseUUIDPipe) payeeGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			await this.expensesService.unmarkPaid(accountGuid, payeeGuid, month)
		} catch (err) {
			if (err instanceof ExpensesTypes.PaymentNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.PaymentNotFound)
			if (err instanceof PayeesTypes.PayeeNotFoundError)
				throw Api.gatewayException(NotFoundException, PayeesDto.ErrorCodes.PayeeNotFound)
			throw err
		}
	}

	// ── Utility prices (meter-linked expenses) ────────────────────────────────

	@Get(':accountGuid/:guid/prices')
	@ApiOperation({ operationId: 'listExpenseUtilityPrices', summary: 'Prices set for a meter-linked expense, newest month first' })
	@ApiOkResponse({ type: ExpensesDto.UtilityPrice, isArray: true })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	async listPrices(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.expensesService.listPrices(accountGuid, guid)
		} catch (err) {
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid/prices/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'setExpenseUtilityPrice', summary: 'Sets (confirms) the price of a meter-linked expense for the month' })
	@ApiOkResponse({ type: ExpensesDto.UtilityPrice })
	@ApiBadRequestResponse({ type: ExpensesDto.InvalidUtilityPriceError })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	async setPrice(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
		@Body() body: ExpensesDto.SaveUtilityPrice,
	) {
		try {
			return await this.expensesService.setPrice(accountGuid, guid, month, body)
		} catch (err) {
			if (err instanceof ExpensesTypes.ExpenseNotLinkedError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.ExpenseNotLinked)
			if (err instanceof ExpensesTypes.ExpensePricedBySupplierError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.ExpensePricedBySupplier)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid/prices/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'removeExpenseUtilityPrice', summary: 'Removes the month\'s own price - it inherits the latest earlier one again' })
	@ApiNoContentResponse()
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: ExpensesDto.UtilityPriceNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removePrice(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			await this.expensesService.removePrice(accountGuid, guid, month)
		} catch (err) {
			if (err instanceof ExpensesTypes.UtilityPriceNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.UtilityPriceNotFound)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	// ── Corrections (overpayment / underpayment) ──────────────────────────────

	@Get(':accountGuid/:guid/corrections')
	@ApiOperation({ operationId: 'listExpenseCorrections', summary: 'Corrections of the expense, newest corrected month first' })
	@ApiOkResponse({ type: ExpensesDto.Correction, isArray: true })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	async listCorrections(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
	) {
		try {
			return await this.expensesService.listCorrections(accountGuid, guid)
		} catch (err) {
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Post(':accountGuid/:guid/corrections')
	@ApiOperation({ operationId: 'createExpenseCorrection', summary: 'Adds a correction (difference or really paid amount) of the expense\'s month amount' })
	@ApiCreatedResponse({ type: ExpensesDto.Correction })
	@ApiBadRequestResponse({ type: ExpensesDto.InvalidCorrectionError })
	@ApiNotFoundResponse({ type: ExpensesDto.ExpenseNotFoundError })
	@HttpCode(HttpStatus.CREATED)
	async createCorrection(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: ExpensesDto.SaveCorrection,
	) {
		try {
			return await this.expensesService.createCorrection(accountGuid, guid, body)
		} catch (err) {
			if (err instanceof ExpensesTypes.InvalidCorrectionRangeError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidCorrectionRange)
			if (err instanceof ExpensesTypes.InvalidCorrectionAmountError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidCorrectionAmount)
			if (err instanceof ExpensesTypes.ExpenseNotInMonthError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.ExpenseNotInMonth)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Put(':accountGuid/:guid/corrections/:correctionGuid')
	@ApiOperation({ operationId: 'updateExpenseCorrection' })
	@ApiOkResponse({ type: ExpensesDto.Correction })
	@ApiBadRequestResponse({ type: ExpensesDto.InvalidCorrectionError })
	@ApiNotFoundResponse({ type: ExpensesDto.CorrectionNotFoundError })
	async updateCorrection(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('correctionGuid', ParseUUIDPipe) correctionGuid: string,
		@Body() body: ExpensesDto.SaveCorrection,
	) {
		try {
			return await this.expensesService.updateCorrection(accountGuid, guid, correctionGuid, body)
		} catch (err) {
			if (err instanceof ExpensesTypes.InvalidCorrectionRangeError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidCorrectionRange)
			if (err instanceof ExpensesTypes.InvalidCorrectionAmountError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.InvalidCorrectionAmount)
			if (err instanceof ExpensesTypes.ExpenseNotInMonthError)
				throw Api.gatewayException(BadRequestException, ExpensesDto.ErrorCodes.ExpenseNotInMonth)
			if (err instanceof ExpensesTypes.CorrectionNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.CorrectionNotFound)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}

	@Delete(':accountGuid/:guid/corrections/:correctionGuid')
	@ApiOperation({ operationId: 'removeExpenseCorrection' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: ExpensesDto.CorrectionNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removeCorrection(
		@Param('accountGuid', ParseUUIDPipe) accountGuid: string,
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('correctionGuid', ParseUUIDPipe) correctionGuid: string,
	) {
		try {
			await this.expensesService.removeCorrection(accountGuid, guid, correctionGuid)
		} catch (err) {
			if (err instanceof ExpensesTypes.CorrectionNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.CorrectionNotFound)
			if (err instanceof ExpensesTypes.ExpenseNotFoundError)
				throw Api.gatewayException(NotFoundException, ExpensesDto.ErrorCodes.ExpenseNotFound)
			throw err
		}
	}
}
