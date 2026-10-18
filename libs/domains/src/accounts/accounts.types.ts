export namespace AccountsTypes {
	export class DuplicateAccountNameError extends Error { public code = 'duplicate_account_name' }
	export class AccountNotFoundError extends Error { public code = 'account_not_found' }
	export class InvalidAccountNameError extends Error { public code = 'invalid_account_name' }
}
