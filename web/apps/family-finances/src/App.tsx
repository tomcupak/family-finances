import React, { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AppPaths } from './appPaths'
import { PrivacyCurtain } from './components/PrivacyCurtain'
import { AccountsPage } from './pages/Accounts'
import { ElectricityPricesPage } from './pages/ElectricityPrices'
import { ExpensesPage } from './pages/Expenses'
import { IncomePage } from './pages/Income'
import { LoginPage } from './pages/Login'
import { MeterSheetDetailPage } from './pages/MeterSheetDetail'
import { MeterSheetsPage } from './pages/MeterSheets'
import { NoAccountPage } from './pages/NoAccount'
import { OverviewPage } from './pages/Overview'
import { SavingsPage } from './pages/Savings'
import { TaxesPage } from './pages/Taxes'
import { AccountStoreProvider, useAccount } from './store/account'
import { AuthStoreProvider, useAuth } from './store/auth'

export default function App() {
	return (
		<AuthStoreProvider>
			<BrowserRouter>
				<Router />
			</BrowserRouter>
		</AuthStoreProvider>
	)
}

const Router: React.FC = () => {
	const { token, logout } = useAuth()

	useEffect(() => {
		const onUnauthorized = () => logout()
		window.addEventListener('family-finances:auth:unauthorized', onUnauthorized)
		return () => window.removeEventListener('family-finances:auth:unauthorized', onUnauthorized)
	}, [logout])

	if (!token) {
		return (
			<Routes>
				<Route path="*" element={<LoginPage />} />
			</Routes>
		)
	}

	return (
		<AccountStoreProvider>
			<AuthenticatedRouter />
			<PrivacyCurtain />
		</AccountStoreProvider>
	)
}

const AuthenticatedRouter: React.FC = () => {
	const { accounts, error } = useAccount()

	if (!accounts) {
		return <p className={error ? 'ErrorText' : undefined} style={{ padding: 28 }}>{error ?? 'Načítám…'}</p>
	}

	if (accounts.length === 0) {
		return (
			<Routes>
				<Route path="*" element={<NoAccountPage />} />
			</Routes>
		)
	}

	return (
		<Routes>
			<Route path={AppPaths.Overview} element={<OverviewPage />} />
			<Route path={AppPaths.Readings} element={<MeterSheetsPage />} />
			<Route path={`${AppPaths.Readings}/:sheetGuid`} element={<MeterSheetDetailPage />} />
			<Route path={AppPaths.Expenses} element={<ExpensesPage />} />
			<Route path={AppPaths.ElectricityPrices} element={<ElectricityPricesPage />} />
			<Route path={AppPaths.Income} element={<IncomePage />} />
			<Route path={AppPaths.Savings} element={<SavingsPage />} />
			<Route path={AppPaths.Taxes} element={<TaxesPage />} />
			<Route path={AppPaths.Accounts} element={<AccountsPage />} />
			<Route path="*" element={<Navigate to={AppPaths.Overview} replace />} />
		</Routes>
	)
}
