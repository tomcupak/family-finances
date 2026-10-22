import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'

import { AppPaths } from '../appPaths'
import { useAccount } from '../store/account'
import { useAuth } from '../store/auth'

const NAV_ITEMS: { to: AppPaths; label: string }[] = [
	{ to: AppPaths.Overview, label: 'Přehled' },
	{ to: AppPaths.Readings, label: 'Odečty' },
	{ to: AppPaths.Expenses, label: 'Náklady' },
	{ to: AppPaths.ElectricityPrices, label: 'Ceny elektřiny' },
	{ to: AppPaths.Income, label: 'Příjmy' },
	{ to: AppPaths.Savings, label: 'Spoření' },
	{ to: AppPaths.Taxes, label: 'Daně' },
]

export const Layout: React.FC<{
	children: React.ReactNode
	title: string
}> = ({ children, title }) => {
	const { logout } = useAuth()
	const { accounts, account, selectAccount } = useAccount()
	const { pathname } = useLocation()
	// Off-canvas drawer state — only has a visual effect below the 860px breakpoint (see App.css), on desktop the sidebar is always shown
	const [navOpen, setNavOpen] = useState(false)

	useEffect(() => {
		document.title = `Family Finances - ${title}`
	})

	useEffect(() => {
		setNavOpen(false)
	}, [pathname, account?.guid])

	useEffect(() => {
		if (!navOpen) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setNavOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [navOpen])

	return (
		<div className={navOpen ? 'Layout LayoutNavOpen' : 'Layout'}>
			<div className="LayoutBackdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
			<aside id="layout-navigation" className="LayoutNavigation">
				<div className="LayoutBrand">
					<img className="LayoutBrandIcon" src="/favicon.svg" alt="" />
					<span className="LayoutBrandName">Family Finances</span>
				</div>
				{account && (
					<div className="LayoutAccount">
						<label htmlFor="layout-account">Účet</label>
						<select
							id="layout-account"
							value={account.guid}
							onChange={(e) => selectAccount(e.target.value)}
						>
							{accounts?.map((a) => <option key={a.guid} value={a.guid}>{a.name}</option>)}
						</select>
					</div>
				)}
				<nav className="LayoutNav">
					<ul className="LayoutLinks">
						{account && NAV_ITEMS.map((item) => (
							<li key={item.to}><NavLink to={item.to} end={item.to === AppPaths.Overview}>{item.label}</NavLink></li>
						))}
					</ul>
				</nav>
				<div className="LayoutNavFooter">
					{account && (
						<ul className="LayoutLinks">
							<li><NavLink to={AppPaths.Accounts}>Správa účtů</NavLink></li>
						</ul>
					)}
					<button className="LayoutLogout" onClick={logout}>Odhlásit</button>
				</div>
			</aside>
			<div className="LayoutContent">
				<div className="LayoutContentHeader">
					<div className="LayoutContentHeaderRow">
						<button
							type="button"
							className="LayoutBurger"
							aria-label={navOpen ? 'Zavřít menu' : 'Otevřít menu'}
							aria-expanded={navOpen}
							aria-controls="layout-navigation"
							onClick={() => setNavOpen((open) => !open)}
						>
							<span />
							<span />
							<span />
						</button>
						<h1 className="LayoutTitle">{title}</h1>
					</div>
				</div>
				<div className="LayoutContentBody">
					{children}
				</div>
			</div>
		</div>
	)
}
