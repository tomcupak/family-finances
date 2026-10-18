const STORAGE_KEY = 'family-finances:account'

export const selectedAccount = {
	get: (): string | null => localStorage.getItem(STORAGE_KEY),
	set: (guid: string): void => localStorage.setItem(STORAGE_KEY, guid),
	clear: (): void => localStorage.removeItem(STORAGE_KEY),
}
