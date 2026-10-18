import { DbProvider } from '@family-finances/database'
import { getTestDbCredentials, truncateTestDb } from '@family-finances/database/testing'
import { DatabaseError } from 'pg'

import { AccountsService } from './accounts.service'
import { AccountsTypes } from './accounts.types'

const mockReturning = jest.fn()
const mockDb = {
	core: {
		insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: mockReturning })) })),
	},
}

function makeUniqueViolation() {
	const cause = new DatabaseError('duplicate key value violates unique constraint', 0, 'error')
	cause.code = '23505'
	return Object.assign(new Error('Failed query'), { cause })
}

describe('AccountsService', () => {
	let service: AccountsService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new AccountsService(mockDb as never)
	})

	describe('create', () => {
		it('trims the name before inserting', async () => {
			mockReturning.mockResolvedValue([{ guid: 'g', name: 'Rodina' }])

			await service.create('  Rodina  ')

			const valuesFn = mockDb.core.insert.mock.results[0]?.value.values as jest.Mock
			expect(valuesFn).toHaveBeenCalledWith({ name: 'Rodina' })
		})

		it('rejects a blank name', async () => {
			await expect(service.create('   ')).rejects.toThrow(AccountsTypes.InvalidAccountNameError)
			expect(mockDb.core.insert).not.toHaveBeenCalled()
		})

		it('maps a unique violation to DuplicateAccountNameError', async () => {
			mockReturning.mockRejectedValue(makeUniqueViolation())

			await expect(service.create('Rodina')).rejects.toThrow(AccountsTypes.DuplicateAccountNameError)
		})

		it('re-throws unknown errors', async () => {
			mockReturning.mockRejectedValue(new Error('boom'))

			await expect(service.create('Rodina')).rejects.toThrow('boom')
		})
	})

	describe('DB', () => {
		let db: DbProvider

		beforeAll(async () => {
			db = new DbProvider({ core: getTestDbCredentials() })
			await db.onApplicationBootstrap()
		})

		beforeEach(async () => {
			jest.clearAllMocks()
			await truncateTestDb(db.core)
			service = new AccountsService(db)
		})

		it('creates and lists accounts ordered by name', async () => {
			await service.create('Rodina')
			await service.create('Firma')

			const list = await service.list()

			expect(list.map((a) => a.name)).toEqual(['Firma', 'Rodina'])
			expect(list[0]).toEqual(expect.objectContaining({ guid: expect.any(String), createdAt: expect.any(Date) }))
		})

		it('rejects a duplicate name on create', async () => {
			await service.create('Rodina')

			await expect(service.create('Rodina')).rejects.toThrow(AccountsTypes.DuplicateAccountNameError)
		})

		it('renames an account', async () => {
			const created = await service.create('Rodina')

			const renamed = await service.rename(created.guid, 'Domácnost')

			expect(renamed).toEqual(expect.objectContaining({ guid: created.guid, name: 'Domácnost' }))
			expect(await service.get(created.guid)).toEqual(expect.objectContaining({ name: 'Domácnost' }))
		})

		it('rejects renaming to an existing name', async () => {
			await service.create('Rodina')
			const firma = await service.create('Firma')

			await expect(service.rename(firma.guid, 'Rodina')).rejects.toThrow(AccountsTypes.DuplicateAccountNameError)
		})

		it('allows renaming an account to its own name', async () => {
			const created = await service.create('Rodina')

			await expect(service.rename(created.guid, 'Rodina')).resolves.toEqual(expect.objectContaining({ name: 'Rodina' }))
		})

		it('throws AccountNotFoundError for unknown guid on get/rename/remove', async () => {
			const unknown = '00000000-0000-0000-0000-000000000000'

			await expect(service.get(unknown)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.rename(unknown, 'X')).rejects.toThrow(AccountsTypes.AccountNotFoundError)
			await expect(service.remove(unknown)).rejects.toThrow(AccountsTypes.AccountNotFoundError)
		})

		it('removes an account', async () => {
			const created = await service.create('Rodina')

			await service.remove(created.guid)

			expect(await service.list()).toEqual([])
		})
	})
})
