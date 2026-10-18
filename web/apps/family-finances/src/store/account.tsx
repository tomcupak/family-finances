import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { getAccounts } from '../api/schema/accounts/accounts'
import type { Account } from '../api/schema/models'
import { selectedAccount } from '../utils/selectedAccount'

const { listAccounts } = getAccounts()

interface AccountContextValue {
	/** `undefined` while the first load is in flight. */
	accounts: Account[] | undefined
	/** Currently selected account - `null` when no account exists yet. */
	account: Account | null
	error: string | undefined
	selectAccount: (guid: string) => void
	reload: () => Promise<Account[] | undefined>
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined)

export const AccountStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [accounts, setAccounts] = useState<Account[] | undefined>()
	const [selectedGuid, setSelectedGuid] = useState<string | null>(() => selectedAccount.get())
	const [error, setError] = useState<string | undefined>()

	const reload = useCallback(async () => {
		try {
			const list = await listAccounts()
			setAccounts(list)
			setError(undefined)
			return list
		} catch {
			setError('Nepodařilo se načíst účty.')
			return undefined
		}
	}, [])

	useEffect(() => {
		void reload()
	}, [reload])

	// Stored guid may point to a deleted account - fall back to the first one.
	const account = useMemo(
		() => accounts?.find((a) => a.guid === selectedGuid) ?? accounts?.[0] ?? null,
		[accounts, selectedGuid],
	)

	useEffect(() => {
		if (!accounts) return
		if (account) selectedAccount.set(account.guid)
		else selectedAccount.clear()
	}, [accounts, account])

	const selectAccount = useCallback((guid: string) => {
		selectedAccount.set(guid)
		setSelectedGuid(guid)
	}, [])

	return (
		<AccountContext.Provider value={{ accounts, account, error, selectAccount, reload }}>
			{children}
		</AccountContext.Provider>
	)
}

export function useAccount(): AccountContextValue {
	const ctx = useContext(AccountContext)
	if (!ctx) throw new Error('useAccount must be used within AccountStoreProvider')
	return ctx
}
