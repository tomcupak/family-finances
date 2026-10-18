import { sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

// Truncate all application tables between tests. CASCADE handles FK ordering.
// Excludes drizzle's internal migrations bookkeeping table.
export async function truncateTestDb(db: NodePgDatabase<Record<string, unknown>>) {
	await db.execute(sql`
		DO $$
		DECLARE r RECORD;
		BEGIN
			FOR r IN
				SELECT schemaname, tablename
				FROM pg_tables
				WHERE schemaname = 'public'
				  AND tablename != '__drizzle_migrations'
			LOOP
				EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename);
			END LOOP;
		END $$
	`)
}
