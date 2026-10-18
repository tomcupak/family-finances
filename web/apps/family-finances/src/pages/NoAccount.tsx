import { getAccounts } from '../api/schema/accounts/accounts'
import { AccountForm } from '../components/AccountForm'
import { Layout } from '../components/Layout'
import { useAccount } from '../store/account'

const { createAccount } = getAccounts()

/** Shown on every route until the first account exists. */
export const NoAccountPage = () => {
	const { reload, selectAccount } = useAccount()

	const handleCreate = async (name: string) => {
		const created = await createAccount({ name })
		await reload()
		selectAccount(created.guid)
	}

	return (
		<Layout title="Vítejte">
			<div className="Card EmptyState">
				<h2 className="SectionTitle">Založte první účet</h2>
				<p>Účet je rodina nebo rozpočet (např. „Rodina", „Firma"), pro který budete evidovat náklady, příjmy, spoření a daně. Později můžete založit další a přepínat mezi nimi v levém panelu.</p>
				<AccountForm submitLabel="Založit účet" onSubmit={handleCreate} autoFocus />
			</div>
		</Layout>
	)
}
