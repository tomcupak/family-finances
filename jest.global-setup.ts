import { dropAndCreateTestDb, migrateTestDb } from './libs/database/src/testing/migrate-test-db'

export default async function () {
	await dropAndCreateTestDb()
	await migrateTestDb()
}
