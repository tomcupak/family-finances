import '@nestjs/platform-express'

import { migrateDb } from '@family-finances/database'
import { TokenGuard } from '@family-finances/domains/auth'
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { config } from './app.config'
import { AppModule } from './app.module'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.enableVersioning({
		type: VersioningType.URI,
	})
	app.enableCors({ origin: config.cors })
	app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
	app.useGlobalGuards(new TokenGuard(app, config.apiToken))

	await migrateDb({
		dbCredentials: config.db,
		dbMigrationsPath: config.dbMigrationsPath,
		logger: new Logger('DB'),
	})

	const swaggerConfig = new DocumentBuilder()
		.setTitle(config.openApi.title)
		.setDescription(config.openApi.description)
		.setVersion(config.openApi.version)
		.addBearerAuth()
		.build()
	const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig)
	SwaggerModule.setup('swagger', app, documentFactory, {
		jsonDocumentUrl: 'swagger/json',
	})

	await app.listen(config.port, config.host, () => Logger.log(`App is listening on ${config.host}:${config.port}`, 'APP'))
}
void bootstrap()
