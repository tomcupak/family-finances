import { DbProvider } from '@family-finances/database'
import { Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'

@Injectable()
export class AppService {
	private dbCheckInterval: NodeJS.Timeout
	private dbOk: boolean = false
	private logger = new Logger()

	constructor(
		private db: DbProvider,
	) {}

	onApplicationBootstrap() {
		void this.testDb()

		this.dbCheckInterval = setInterval(() => {
			void this.testDb()
		}, 10_000)
	}

	onModuleDestroy() {
		clearInterval(this.dbCheckInterval)
	}

	getStatus() {
		return {
			api: 'ok',
			db: this.dbOk ? 'ok' : 'failing',
		}
	}

	private async testDb() {
		try {
			await this.db.core.execute(sql`SELECT 1`)
			this.dbOk = true
		} catch (err) {
			this.logger.error(err)
			this.dbOk = false
		}
	}
}
