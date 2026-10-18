import { coreSchema, DbProvider } from '@family-finances/database'
import { Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { AccountsTypes } from './accounts.types'

const UNIQUE_CONSTRAINT_VIOLATION = '23505'

@Injectable()
export class AccountsService {
	constructor(
		private db: DbProvider,
	) {}

	async list() {
		return this.db.core.select()
			.from(coreSchema.account)
			.orderBy(asc(coreSchema.account.name))
	}

	async get(guid: string) {
		const [row] = await this.db.core.select()
			.from(coreSchema.account)
			.where(eq(coreSchema.account.guid, guid))
		if (!row) throw new AccountsTypes.AccountNotFoundError()
		return row
	}

	async create(name: string) {
		const normalized = this.normalizeName(name)
		try {
			const [row] = await this.db.core.insert(coreSchema.account)
				.values({ name: normalized })
				.returning()
			return row
		} catch (err) {
			this.rethrowDuplicate(err)
		}
	}

	async rename(guid: string, name: string) {
		const normalized = this.normalizeName(name)
		let row: typeof coreSchema.account.$inferSelect | undefined
		try {
			[row] = await this.db.core.update(coreSchema.account)
				.set({ name: normalized })
				.where(eq(coreSchema.account.guid, guid))
				.returning()
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		if (!row) throw new AccountsTypes.AccountNotFoundError()
		return row
	}

	/** Deletes the account; everything referencing it (FK `on delete cascade`) goes with it. */
	async remove(guid: string) {
		const [row] = await this.db.core.delete(coreSchema.account)
			.where(eq(coreSchema.account.guid, guid))
			.returning()
		if (!row) throw new AccountsTypes.AccountNotFoundError()
	}

	private normalizeName(name: string) {
		const normalized = name.trim()
		if (!normalized) throw new AccountsTypes.InvalidAccountNameError()
		return normalized
	}

	private rethrowDuplicate(err: unknown): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
			throw new AccountsTypes.DuplicateAccountNameError()
		}
		throw err
	}
}
