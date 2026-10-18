import Axios from 'axios'
import React, { useState } from 'react'

function errorMessage(err: unknown): string {
	if (Axios.isAxiosError(err)) {
		if (err.response?.status === 409) return 'Účet s tímto názvem už existuje.'
		if (err.response?.status === 400) return 'Zadejte platný název účtu.'
		if (err.response?.status === 404) return 'Účet už neexistuje.'
	}
	return 'Uložení se nezdařilo.'
}

/** Single-field name form shared by account creation and renaming. */
export const AccountForm: React.FC<{
	initialName?: string
	submitLabel: string
	onSubmit: (name: string) => Promise<unknown>
	onCancel?: () => void
	autoFocus?: boolean
}> = ({ initialName = '', submitLabel, onSubmit, onCancel, autoFocus }) => {
	const [name, setName] = useState(initialName)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const trimmed = name.trim()
		if (!trimmed) return

		setSubmitting(true)
		setError(undefined)
		try {
			await onSubmit(trimmed)
			if (!initialName) setName('')
		} catch (err) {
			setError(errorMessage(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<>
			<form className="ReadingForm" onSubmit={(e) => { void handleSubmit(e) }}>
				<div>
					<label htmlFor={`account-name-${initialName || 'new'}`}>Název účtu</label>
					<input
						id={`account-name-${initialName || 'new'}`}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="např. Rodina"
						maxLength={100}
						required
						autoFocus={autoFocus}
					/>
				</div>
				<button type="submit" disabled={submitting}>{submitLabel}</button>
				{onCancel && <button type="button" className="SecondaryButton" onClick={onCancel}>Zrušit</button>}
			</form>
			{error && <p className="ErrorText">{error}</p>}
		</>
	)
}
