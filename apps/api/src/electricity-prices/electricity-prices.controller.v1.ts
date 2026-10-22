import { ElectricityPricesDto, ElectricityPricesService, ElectricityPricesTypes } from '@family-finances/domains/electricity-prices'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'electricity-prices', version: '1' })
@ApiTags('ElectricityPrices')
@ApiBearerAuth()
export class ElectricityPricesControllerV1 {
	constructor(private electricityPricesService: ElectricityPricesService) {}

	// ── Suppliers ─────────────────────────────────────────────────────────────

	@Get('suppliers')
	@ApiOperation({ operationId: 'listElectricitySuppliers', summary: 'Suppliers ordered by name and location, each with its price periods (newest first)' })
	@ApiOkResponse({ type: ElectricityPricesDto.SupplierWithPeriods, isArray: true })
	list() {
		return this.electricityPricesService.list()
	}

	@Post('suppliers')
	@ApiOperation({ operationId: 'createElectricitySupplier' })
	@ApiCreatedResponse({ type: ElectricityPricesDto.Supplier })
	@ApiBadRequestResponse({ type: ElectricityPricesDto.InvalidSupplierError })
	@ApiConflictResponse({ type: ElectricityPricesDto.DuplicateSupplierError })
	@HttpCode(HttpStatus.CREATED)
	async create(@Body() body: ElectricityPricesDto.SaveSupplier) {
		try {
			return await this.electricityPricesService.create(body)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.InvalidSupplierNameError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidSupplierName)
			if (err instanceof ElectricityPricesTypes.DuplicateSupplierError)
				throw Api.gatewayException(ConflictException, ElectricityPricesDto.ErrorCodes.DuplicateSupplier)
			throw err
		}
	}

	@Put('suppliers/:guid')
	@ApiOperation({ operationId: 'updateElectricitySupplier' })
	@ApiOkResponse({ type: ElectricityPricesDto.Supplier })
	@ApiBadRequestResponse({ type: ElectricityPricesDto.InvalidSupplierError })
	@ApiNotFoundResponse({ type: ElectricityPricesDto.SupplierNotFoundError })
	@ApiConflictResponse({ type: ElectricityPricesDto.DuplicateSupplierError })
	async update(
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: ElectricityPricesDto.SaveSupplier,
	) {
		try {
			return await this.electricityPricesService.update(guid, body)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.InvalidSupplierNameError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidSupplierName)
			if (err instanceof ElectricityPricesTypes.DuplicateSupplierError)
				throw Api.gatewayException(ConflictException, ElectricityPricesDto.ErrorCodes.DuplicateSupplier)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			throw err
		}
	}

	@Delete('suppliers/:guid')
	@ApiOperation({ operationId: 'removeElectricitySupplier', summary: 'Deletes the supplier with its periods - linked expenses fall back to their own monthly prices' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: ElectricityPricesDto.SupplierNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(@Param('guid', ParseUUIDPipe) guid: string) {
		try {
			await this.electricityPricesService.remove(guid)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			throw err
		}
	}

	// ── Price periods ─────────────────────────────────────────────────────────

	@Post('suppliers/:guid/periods')
	@ApiOperation({ operationId: 'createElectricityPricePeriod', summary: 'Adds a fixed contract price or a SPOT invoice period' })
	@ApiCreatedResponse({ type: ElectricityPricesDto.PricePeriod })
	@ApiBadRequestResponse({ type: ElectricityPricesDto.InvalidPricePeriodError })
	@ApiNotFoundResponse({ type: ElectricityPricesDto.SupplierNotFoundError })
	@HttpCode(HttpStatus.CREATED)
	async createPeriod(
		@Param('guid', ParseUUIDPipe) guid: string,
		@Body() body: ElectricityPricesDto.SavePricePeriod,
	) {
		try {
			return await this.electricityPricesService.createPeriod(guid, body)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.InvalidPricePeriodRangeError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidPricePeriodRange)
			if (err instanceof ElectricityPricesTypes.InvalidPricePeriodValuesError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidPricePeriodValues)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			throw err
		}
	}

	@Put('suppliers/:guid/periods/:periodGuid')
	@ApiOperation({ operationId: 'updateElectricityPricePeriod' })
	@ApiOkResponse({ type: ElectricityPricesDto.PricePeriod })
	@ApiBadRequestResponse({ type: ElectricityPricesDto.InvalidPricePeriodError })
	@ApiNotFoundResponse({ type: ElectricityPricesDto.PricePeriodNotFoundError })
	async updatePeriod(
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('periodGuid', ParseUUIDPipe) periodGuid: string,
		@Body() body: ElectricityPricesDto.SavePricePeriod,
	) {
		try {
			return await this.electricityPricesService.updatePeriod(guid, periodGuid, body)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.InvalidPricePeriodRangeError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidPricePeriodRange)
			if (err instanceof ElectricityPricesTypes.InvalidPricePeriodValuesError)
				throw Api.gatewayException(BadRequestException, ElectricityPricesDto.ErrorCodes.InvalidPricePeriodValues)
			if (err instanceof ElectricityPricesTypes.PricePeriodNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.PricePeriodNotFound)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			throw err
		}
	}

	@Delete('suppliers/:guid/periods/:periodGuid')
	@ApiOperation({ operationId: 'removeElectricityPricePeriod' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: ElectricityPricesDto.PricePeriodNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removePeriod(
		@Param('guid', ParseUUIDPipe) guid: string,
		@Param('periodGuid', ParseUUIDPipe) periodGuid: string,
	) {
		try {
			await this.electricityPricesService.removePeriod(guid, periodGuid)
		} catch (err) {
			if (err instanceof ElectricityPricesTypes.PricePeriodNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.PricePeriodNotFound)
			if (err instanceof ElectricityPricesTypes.SupplierNotFoundError)
				throw Api.gatewayException(NotFoundException, ElectricityPricesDto.ErrorCodes.SupplierNotFound)
			throw err
		}
	}
}
