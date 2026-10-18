import { MetersDto, MetersService, MetersTypes } from '@family-finances/domains/meters'
import { Api } from '@family-finances/shared'
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

@Controller({ path: 'meters', version: '1' })
@ApiTags('Meters')
@ApiBearerAuth()
export class MetersControllerV1 {
	constructor(private metersService: MetersService) {}

	// ── Sheets ────────────────────────────────────────────────────────────────

	@Get('sheets')
	@ApiOperation({ operationId: 'listMeterSheets' })
	@ApiOkResponse({ type: MetersDto.MeterSheet, isArray: true })
	listSheets(@Query() query: MetersDto.ListSheetsQuery) {
		return this.metersService.listSheets(query.includeArchived ?? false)
	}

	@Post('sheets')
	@ApiOperation({ operationId: 'createMeterSheet' })
	@ApiCreatedResponse({ type: MetersDto.MeterSheet })
	@ApiBadRequestResponse({ type: MetersDto.InvalidSheetNameError })
	@ApiConflictResponse({ type: MetersDto.DuplicateSheetNameError })
	@HttpCode(HttpStatus.CREATED)
	async createSheet(@Body() body: MetersDto.CreateSheet) {
		try {
			return await this.metersService.createSheet(body.name, body.utility, body.entryMode)
		} catch (err) {
			if (err instanceof MetersTypes.InvalidSheetNameError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.InvalidSheetName)
			if (err instanceof MetersTypes.DuplicateSheetNameError)
				throw Api.gatewayException(ConflictException, MetersDto.ErrorCodes.DuplicateSheetName)
			throw err
		}
	}

	@Get('sheets/:sheetGuid')
	@ApiOperation({ operationId: 'getMeterSheet' })
	@ApiOkResponse({ type: MetersDto.MeterSheet })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	async getSheet(@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string) {
		try {
			return await this.metersService.getSheet(sheetGuid)
		} catch (err) {
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			throw err
		}
	}

	@Patch('sheets/:sheetGuid')
	@ApiOperation({ operationId: 'updateMeterSheet' })
	@ApiOkResponse({ type: MetersDto.MeterSheet })
	@ApiBadRequestResponse({ type: MetersDto.InvalidSheetNameError })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	@ApiConflictResponse({ type: MetersDto.DuplicateSheetNameError })
	async updateSheet(
		@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string,
		@Body() body: MetersDto.UpdateSheet,
	) {
		try {
			return await this.metersService.updateSheet(sheetGuid, body)
		} catch (err) {
			if (err instanceof MetersTypes.InvalidSheetNameError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.InvalidSheetName)
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			if (err instanceof MetersTypes.DuplicateSheetNameError)
				throw Api.gatewayException(ConflictException, MetersDto.ErrorCodes.DuplicateSheetName)
			throw err
		}
	}

	@Delete('sheets/:sheetGuid')
	@ApiOperation({ operationId: 'removeMeterSheet' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removeSheet(@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string) {
		try {
			await this.metersService.removeSheet(sheetGuid)
		} catch (err) {
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			throw err
		}
	}

	// ── Readings ──────────────────────────────────────────────────────────────

	@Get('sheets/:sheetGuid/readings')
	@ApiOperation({ operationId: 'listMeterReadings' })
	@ApiOkResponse({ type: MetersDto.MeterReadingWithDiff, isArray: true })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	async listReadings(@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string) {
		try {
			return await this.metersService.listReadings(sheetGuid)
		} catch (err) {
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			throw err
		}
	}

	@Post('sheets/:sheetGuid/readings')
	@ApiOperation({ operationId: 'createMeterReading' })
	@ApiCreatedResponse({ type: MetersDto.MeterReading })
	@ApiBadRequestResponse({ type: MetersDto.InvalidReadingValuesError })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	@ApiConflictResponse({ type: MetersDto.DuplicateReadingDateError })
	@HttpCode(HttpStatus.CREATED)
	async createReading(
		@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string,
		@Body() body: MetersDto.CreateReading,
	) {
		try {
			return await this.metersService.createReading(sheetGuid, body)
		} catch (err) {
			if (err instanceof MetersTypes.InvalidReadingValuesError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.InvalidReadingValues)
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			if (err instanceof MetersTypes.DuplicateReadingDateError)
				throw Api.gatewayException(ConflictException, MetersDto.ErrorCodes.DuplicateReadingDate)
			throw err
		}
	}

	@Post('readings/bulk')
	@ApiOperation({ operationId: 'createMeterReadingsBulk', summary: 'Same-dated readings for several sheets at once (all or nothing)' })
	@ApiCreatedResponse({ type: MetersDto.MeterReading, isArray: true })
	@ApiBadRequestResponse({ type: MetersDto.InvalidReadingValuesError })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	@ApiConflictResponse({ type: MetersDto.DuplicateReadingDateError })
	@HttpCode(HttpStatus.CREATED)
	async createReadingsBulk(@Body() body: MetersDto.CreateReadingsBulk) {
		try {
			return await this.metersService.createReadingsBulk(body.readingDate, body.entries)
		} catch (err) {
			if (err instanceof MetersTypes.InvalidReadingValuesError)
				throw Api.gatewayException(BadRequestException, MetersDto.ErrorCodes.InvalidReadingValues)
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			if (err instanceof MetersTypes.DuplicateReadingDateError)
				throw Api.gatewayException(ConflictException, MetersDto.ErrorCodes.DuplicateReadingDate)
			throw err
		}
	}

	@Delete('readings/:guid')
	@ApiOperation({ operationId: 'removeMeterReading' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ type: MetersDto.ReadingNotFoundError })
	@HttpCode(HttpStatus.NO_CONTENT)
	async removeReading(@Param('guid', ParseUUIDPipe) guid: string) {
		try {
			await this.metersService.removeReading(guid)
		} catch (err) {
			if (err instanceof MetersTypes.ReadingNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.ReadingNotFound)
			throw err
		}
	}

	// ── Consumption ───────────────────────────────────────────────────────────

	@Get('sheets/:sheetGuid/consumption')
	@ApiOperation({ operationId: 'getMeterConsumption' })
	@ApiOkResponse({ type: MetersDto.ConsumptionBucket, isArray: true })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	async getConsumption(
		@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string,
		@Query() query: MetersDto.ConsumptionQuery,
	) {
		try {
			return await this.metersService.getConsumption(sheetGuid, query.from, query.to, query.interval)
		} catch (err) {
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			throw err
		}
	}

	@Get('sheets/:sheetGuid/consumption/:month')
	@ApiParam({ name: 'month', type: 'string', example: '2026-09', description: 'YYYY-MM' })
	@ApiOperation({ operationId: 'getMeterMonthlyConsumption', summary: 'Sum of diffs of readings dated within the month' })
	@ApiOkResponse({ type: MetersDto.MonthlyConsumption })
	@ApiBadRequestResponse({ type: Api.InvalidMonthError })
	@ApiNotFoundResponse({ type: MetersDto.SheetNotFoundError })
	async getMonthlyConsumption(
		@Param('sheetGuid', ParseUUIDPipe) sheetGuid: string,
		@Param('month', Api.ParseMonthPipe) month: string,
	) {
		try {
			return await this.metersService.getMonthlyConsumption(sheetGuid, month)
		} catch (err) {
			if (err instanceof MetersTypes.SheetNotFoundError)
				throw Api.gatewayException(NotFoundException, MetersDto.ErrorCodes.SheetNotFound)
			throw err
		}
	}
}
