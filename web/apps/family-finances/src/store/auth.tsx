import React, { createContext, useCallback, useContext, useState } from 'react'

import { authToken } from '../utils/authToken'

interface AuthContextValue {
	token: string | null
	setToken: (token: string) => void
	logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [token, setTokenState] = useState<string | null>(() => authToken.get())

	const setToken = useCallback((value: string) => {
		authToken.set(value)
		setTokenState(value)
	}, [])

	const logout = useCallback(() => {
		authToken.clear()
		setTokenState(null)
	}, [])

	return <AuthContext.Provider value={{ token, setToken, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within AuthStoreProvider')
	return ctx
}
