import { coreSchema, DbProvider } from '@family-finances/database'
import { BankAccount } from '@family-finances/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { AccountsService } from '../accounts/accounts.service'
import { PayeesTypes } from './payees.types'

type PayeeRow = typeof coreSchema.payee.$inferSelect

const UNIQUE_CONSTRAINT_VIOLATION = '23505'

@Injectable()
export class PayeesService {
	constructor(
		private db: DbProvider,
		private accountsService: AccountsService,
	) {}

	/** Payees of the account ordered by name. */
	async list(accountGuid: string): Promise<PayeesTypes.Payee[]> {
		await this.accountsService.get(accountGuid)
		const rows = await this.db.core.select()
			.from(coreSchema.payee)
			.where(eq(coreSchema.payee.accountGuid, accountGuid))
			.orderBy(asc(coreSchema.payee.name))
		return rows.map((row) => this.toPayee(row))
	}

	/** A payee of the account - one of another account is not found. */
	async get(accountGuid: string, guid: string): Promise<PayeesTypes.Payee> {
		const [row] = await this.db.core.select()
			.from(coreSchema.payee)
			.where(this.byGuid(accountGuid, guid))
		if (!row) throw new PayeesTypes.PayeeNotFoundError()
		return this.toPayee(row)
	}

	async create(accountGuid: string, input: PayeesTypes.PayeeInput): Promise<PayeesTypes.Payee> {
		const values = this.toValues(input)
		await this.accountsService.get(accountGuid)
		let row: PayeeRow | undefined
		try {
			[row] = await this.db.core.insert(coreSchema.payee)
				.values({ ...values, accountGuid })
				.returning()
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		if (!row) throw new Error('Insert into payee returned no row')
		return this.toPayee(row)
	}

	async update(accountGuid: string, guid: string, input: PayeesTypes.PayeeInput): Promise<PayeesTypes.Payee> {
		const values = this.toValues(input)
		let row: PayeeRow | undefined
		try {
			[row] = await this.db.core.update(coreSchema.payee)
				.set(values)
				.where(this.byGuid(accountGuid, guid))
				.returning()
		} catch (err) {
			this.rethrowDuplicate(err)
		}
		if (!row) throw new PayeesTypes.PayeeNotFoundError()
		return this.toPayee(row)
	}

	/** Deletes the payee - its expenses stay (without a payee), its paid marks go with it. */
	async remove(accountGuid: string, guid: string) {
		const [row] = await this.db.core.delete(coreSchema.payee)
			.where(this.byGuid(accountGuid, guid))
			.returning()
		if (!row) throw new PayeesTypes.PayeeNotFoundError()
	}

	private toValues(input: PayeesTypes.PayeeInput) {
		const name = input.name.trim()
		if (!name) throw new PayeesTypes.InvalidPayeeNameError()
		let bankAccount: string | null = null
		if (input.bankAccount?.trim()) {
			const parsed = BankAccount.parse(input.bankAccount)
			if (!parsed) throw new PayeesTypes.InvalidBankAccountError()
			bankAccount = parsed.normalized
		}
		return { name, bankAccount, variableSymbol: input.variableSymbol?.trim() || null }
	}

	private toPayee(row: PayeeRow): PayeesTypes.Payee {
		return { ...row, iban: row.bankAccount === null ? null : (BankAccount.parse(row.bankAccount)?.iban ?? null) }
	}

	private byGuid(accountGuid: string, guid: string) {
		return and(eq(coreSchema.payee.guid, guid), eq(coreSchema.payee.accountGuid, accountGuid))
	}

	private rethrowDuplicate(err: unknown): never {
		// drizzle wraps the driver error - the raw pg `DatabaseError` (with `.code`) is on `.cause`.
		// Cast needed: `Error.cause` typings require an ES2022 lib, which this project doesn't target.
		const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
		if (cause instanceof DatabaseError && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
			throw new PayeesTypes.DuplicatePayeeNameError()
		}
		throw err
	}
}
