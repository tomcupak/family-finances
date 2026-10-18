import { Logger } from '@nestjs/common'
import * as path from 'path'
import { Client } from 'pg'

import { migrateDb } from '../utils'

const MIGRATIONS_PATH = path.resolve(__dirname, '../core/migrations')

export function getTestDbCredentials() {
	return {
		host: process.env.TEST_DB_HOST ?? 'localhost',
		port: parseInt(process.env.TEST_DB_PORT ?? '10400'),
		user: process.env.TEST_DB_USER ?? 'postgres',
		password: process.env.TEST_DB_PASSWORD ?? 'postgres',
		database: process.env.TEST_DB_NAME ?? 'family_finances_test',
	}
}

export async function dropAndCreateTestDb() {
	const creds = getTestDbCredentials()
	const client = new Client({
		host: creds.host,
		port: creds.port,
		user: creds.user,
		password: creds.password,
		database: 'postgres',
	})

	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(creds.database))
		throw new Error(`Unsafe database name in TEST_DB_NAME: "${creds.database}"`)

	await client.connect()

	try {
		await client.query(
			'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
			[creds.database],
		)
		await client.query(`DROP DATABASE IF EXISTS "${creds.database}"`)
		await client.query(`CREATE DATABASE "${creds.database}"`)
	} finally {
		await client.end()
	}
}

export async function migrateTestDb() {
	await migrateDb({
		logger: new Logger('TestMigration'),
		dbCredentials: getTestDbCredentials(),
		dbMigrationsPath: MIGRATIONS_PATH,
	})
}
