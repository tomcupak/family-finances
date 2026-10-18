import { useState } from 'react'

import { getAccounts } from '../api/schema/accounts/accounts'
import { AccountForm } from '../components/AccountForm'
import { Layout } from '../components/Layout'
import { useAccount } from '../store/account'

const { createAccount, renameAccount, removeAccount } = getAccounts()

export const AccountsPage = () => {
	const { accounts, account, error, selectAccount, reload } = useAccount()
	const [editingGuid, setEditingGuid] = useState<string | undefined>()
	const [removeError, setRemoveError] = useState<string | undefined>()

	const handleCreate = async (name: string) => {
		const created = await createAccount({ name })
		await reload()
		selectAccount(created.guid)
	}

	const handleRename = async (guid: string, name: string) => {
		await renameAccount(guid, { name })
		setEditingGuid(undefined)
		await reload()
	}

	const handleRemove = async (guid: string, name: string) => {
		if (!window.confirm(`Opravdu smazat účet „${name}"? Smažou se i všechna jeho data (náklady, příjmy, spoření, daně).`)) return
		setRemoveError(undefined)
		try {
			await removeAccount(guid)
		} catch {
			setRemoveError('Smazání se nezdařilo.')
		}
		await reload()
	}

	return (
		<Layout title="Účty">
			<p>Účet je rodina nebo rozpočet (např. „Rodina", „Firma"). Náklady, příjmy, spoření a daně se evidují zvlášť pro každý účet.</p>

			<h2 className="SectionTitle">Nový účet</h2>
			<AccountForm submitLabel="Založit účet" onSubmit={handleCreate} />

			{error && <p className="ErrorText">{error}</p>}
			{removeError && <p className="ErrorText">{removeError}</p>}

			<table>
				<thead>
					<tr>
						<th>Název</th>
						<th>Založen</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{accounts?.map((a) => (
						<tr key={a.guid}>
							<td>
								{editingGuid === a.guid ? (
									<AccountForm
										initialName={a.name}
										submitLabel="Uložit"
										onSubmit={(name) => handleRename(a.guid, name)}
										onCancel={() => setEditingGuid(undefined)}
										autoFocus
									/>
								) : (
									<>
										{a.name}
										{a.guid === account?.guid && <span className="Badge">vybraný</span>}
									</>
								)}
							</td>
							<td>{new Date(a.createdAt).toLocaleDateString('cs-CZ')}</td>
							<td className="RowActions">
								{a.guid !== account?.guid && (
									<button className="DeleteLink" onClick={() => selectAccount(a.guid)}>Vybrat</button>
								)}
								<button className="DeleteLink" onClick={() => setEditingGuid(a.guid)}>Přejmenovat</button>
								<button className="DeleteLink" onClick={() => { void handleRemove(a.guid, a.name) }}>Smazat</button>
							</td>
						</tr>
					))}
					{accounts?.length === 0 && (
						<tr><td colSpan={3}>Zatím žádné účty.</td></tr>
					)}
				</tbody>
			</table>
		</Layout>
	)
}
