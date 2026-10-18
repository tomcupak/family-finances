import React, { useState } from 'react'

import { getAuth } from '../api/schema/auth/auth'
import { useAuth } from '../store/auth'
import { authToken } from '../utils/authToken'

const { verifyToken } = getAuth()

export const LoginPage = () => {
	const { setToken } = useAuth()
	const [value, setValue] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const token = value.trim()
		if (!token) return

		setSubmitting(true)
		setError(undefined)
		// customInstance reads the token from storage at request time, so it has to be there
		// before `verifyToken()` fires - cleared again below if verification fails.
		authToken.set(token)
		try {
			await verifyToken()
			setToken(token)
		} catch {
			authToken.clear()
			setError('Neplatný token.')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--content-bg)' }}>
			<form className="Card" style={{ width: 320 }} onSubmit={(e) => { void handleSubmit(e) }}>
				<img src="/favicon.svg" alt="" width={56} height={56} style={{ display: 'block', margin: '0 auto 12px' }} />
				<h1 style={{ paddingTop: 0, textAlign: 'center' }}>Family Finances</h1>
				<label htmlFor="token">Přístupový token</label>
				<input
					id="token"
					type="password"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					autoFocus
					style={{ maxWidth: 'none', marginBottom: 12 }}
				/>
				{error && <p className="ErrorText">{error}</p>}
				<button type="submit" disabled={submitting} style={{ marginTop: 12 }}>Přihlásit</button>
			</form>
		</div>
	)
}
