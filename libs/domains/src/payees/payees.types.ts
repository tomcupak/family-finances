export namespace PayeesTypes {
	export class PayeeNotFoundError extends Error { public code = 'payee_not_found' }
	export class InvalidPayeeNameError extends Error { public code = 'invalid_payee_name' }
	export class DuplicatePayeeNameError extends Error { public code = 'duplicate_payee_name' }
	/** Neither a valid Czech account number (incl. checksum) nor a valid IBAN. */
	export class InvalidBankAccountError extends Error { public code = 'invalid_bank_account' }

	export interface PayeeInput {
		name: string
		/** Czech `[prefix-]number/bank` or IBAN; empty = no account (no QR code). */
		bankAccount?: string | null
		/** Up to 10 digits; empty = none. */
		variableSymbol?: string | null
	}

	export interface Payee {
		guid: string
		accountGuid: string
		name: string
		bankAccount: string | null
		/** Computed from `bankAccount` - what the QR payment uses. */
		iban: string | null
		variableSymbol: string | null
		createdAt: Date
	}
}
