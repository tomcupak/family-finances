const STORAGE_KEY = 'family-finances:token'

export const authToken = {
	get: (): string | null => localStorage.getItem(STORAGE_KEY),
	set: (token: string): void => localStorage.setItem(STORAGE_KEY, token),
	clear: (): void => localStorage.removeItem(STORAGE_KEY),
}
