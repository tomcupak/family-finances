import { DbProvider } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'

import { AccountsService } from '../accounts/accounts.service'
import { PayeesService } from './payees.service'
import { PayeesTypes } from './payees.types'

const mockAccountsService = {
	get: jest.fn(),
}

const mockReturning = jest.fn()
const mockValues = jest.fn(() => ({ returning: mockReturning }))
const mockDb = {
	core: {
		insert: jest.fn(() => ({ values: mockValues })),
	},
}

function makeInput(overrides: Partial<PayeesTypes.PayeeInput> = {}): PayeesTypes.PayeeInput {
	return { name: 'Pronajímatel', bankAccount: null, variableSymbol: null, ...overrides }
}

describe('PayeesService', () => {
	let service: PayeesService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new PayeesService(mockDb as never, mockAccountsService as never)
	})

	describe('create validation', () => {
		it('trims and normalizes the values', async () => {
			mockReturning.mockResolvedValue([{ guid: 'p', accountGuid: 'a', name: 'Pronajímatel', bankAccount: '19-2000145399/0800', variableSymbol: '123', createdAt: new Date() }])

			const payee = await service.create('a', makeInput({ name: ' Pronajímatel ', bankAccount: ' 19-2000145399 / 0800 ', variableSymbol: ' 123 ' }))

			expect(mockValues).toHaveBeenCalledWith({ accountGuid: 'a', name: 'Pronajímatel', bankAccount: '19-2000145399/0800', variableSymbol: '123' })
			expect(payee.iban).toBe('CZ6508000000192000145399')
		})

		it('stores empty bank account and variable symbol as null', async () => {
			mockReturning.mockResolvedValue([{ guid: 'p', accountGuid: 'a', name: 'Škola', bankAccount: null, variableSymbol: null, createdAt: new Date() }])

			const payee = await service.create('a', makeInput({ name: 'Škola', bankAccount: '  ', variableSymbol: '' }))

			expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ bankAccount: null, variableSymbol: null }))
			expect(payee.iban).toBeNull()
		})

		it('rejects a blank name', async () => {
			await expect(service.create('a', makeInput({ name: '  ' }))).rejects.toThrow(PayeesTypes.InvalidPayeeNameError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
		})

		it('rejects an invalid bank account', async () => {
			await expect(service.create('a', makeInput({ bankAccount: '2000145398/0800' }))).rejects.toThrow(PayeesTypes.InvalidBankAccountError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
		})
	})

	describe('DB', () => {
		let db: DbProvider
		let accounts: AccountsService

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			accounts = new AccountsService(db)
			service = new PayeesService(db, accounts)
		})

		async function createAccount(name = 'Rodina') {
			const account = await accounts.create(name)
			if (!account) throw new Error('Account not created')
			return account.guid
		}

		it('creates, lists (by name), updates and removes payees', async () => {
			const accountGuid = await createAccount()
			const landlord = await service.create(accountGuid, makeInput({ name: 'Pronajímatel', bankAccount: '19-2000145399/0800' }))
			await service.create(accountGuid, makeInput({ name: 'Dodavatel' }))

			expect((await service.list(accountGuid)).map((p) => p.name)).toEqual(['Dodavatel', 'Pronajímatel'])

			const updated = await service.update(accountGuid, landlord.guid, makeInput({ name: 'Pronajímatel', bankAccount: null, variableSymbol: '42' }))
			expect(updated).toEqual(expect.objectContaining({ bankAccount: null, iban: null, variableSymbol: '42' }))

			await service.remove(accountGuid, landlord.guid)
			expect((await service.list(accountGuid)).map((p) => p.name)).toEqual(['Dodavatel'])
		})

		it('rejects a duplicate name within the account, allows it in another account', async () => {
			const rodina = await createAccount('Rodina')
			const firma = await createAccount('Firma')
			await service.create(rodina, makeInput())

			await expect(service.create(rodina, makeInput())).rejects.toThrow(PayeesTypes.DuplicatePayeeNameError)
			await expect(service.create(firma, makeInput())).resolves.toEqual(expect.objectContaining({ accountGuid: firma }))
		})

		it('scopes payees to their account', async () => {
			const rodina = await createAccount('Rodina')
			const firma = await createAccount('Firma')
			const payee = await service.create(rodina, makeInput())

			await expect(service.get(firma, payee.guid)).rejects.toThrow(PayeesTypes.PayeeNotFoundError)
			await expect(service.update(firma, payee.guid, makeInput())).rejects.toThrow(PayeesTypes.PayeeNotFoundError)
			await expect(service.remove(firma, payee.guid)).rejects.toThrow(PayeesTypes.PayeeNotFoundError)
		})
	})
})
