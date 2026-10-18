import { BankAccount } from '..'

describe('BankAccount', () => {
	describe('parse', () => {
		it('converts a Czech account with a prefix to IBAN', () => {
			expect(BankAccount.parse('19-2000145399/0800')).toEqual({
				normalized: '19-2000145399/0800',
				iban: 'CZ6508000000192000145399',
			})
		})

		it('converts a Czech account without a prefix and ignores spaces', () => {
			expect(BankAccount.parse(' 2000145399 / 0800 ')).toEqual({
				normalized: '2000145399/0800',
				iban: 'CZ7908000000002000145399',
			})
		})

		it('rejects a Czech account with a wrong checksum', () => {
			expect(BankAccount.parse('2000145398/0800')).toBeNull()
			expect(BankAccount.parse('18-2000145399/0800')).toBeNull()
		})

		it('rejects malformed input', () => {
			expect(BankAccount.parse('')).toBeNull()
			expect(BankAccount.parse('2000145399')).toBeNull()
			expect(BankAccount.parse('2000145399/080')).toBeNull()
			expect(BankAccount.parse('00/0800')).toBeNull()
		})

		it('accepts an IBAN (any country, spaces, lower case) and validates its check digits', () => {
			expect(BankAccount.parse('cz65 0800 0000 1920 0014 5399')).toEqual({
				normalized: 'CZ6508000000192000145399',
				iban: 'CZ6508000000192000145399',
			})
			expect(BankAccount.parse('DE89 3704 0044 0532 0130 00')?.iban).toBe('DE89370400440532013000')
			expect(BankAccount.parse('CZ6608000000192000145399')).toBeNull()
		})
	})

	describe('spayd', () => {
		it('builds the payment string with amount, VS and message', () => {
			expect(BankAccount.spayd({ iban: 'CZ6508000000192000145399', amount: 1234.5, variableSymbol: '123456', message: 'Nájem 10/2026' }))
				.toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:1234.50*CC:CZK*X-VS:123456*MSG:Najem 10/2026')
		})

		it('omits empty optional fields', () => {
			expect(BankAccount.spayd({ iban: 'CZ6508000000192000145399', amount: 500 }))
				.toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK')
		})

		it('drops the separator and cuts the message to 60 characters', () => {
			const result = BankAccount.spayd({ iban: 'CZ6508000000192000145399', amount: 1, message: `a*b ${'x'.repeat(80)}` })

			expect(result).toBe(`SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:CZK*MSG:a b ${'x'.repeat(56)}`)
		})
	})
})
