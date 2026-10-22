/**
 * Route paths. Kept out of `App.tsx` on purpose: `App.tsx` imports every page and the pages/`Layout`
 * import these paths back - with the enum in `App.tsx` that cycle made `AppPaths` undefined while
 * `Layout`'s module-level nav items were evaluated, crashing the app on load.
 */
export enum AppPaths {
	Overview = '/',
	Readings = '/readings',
	ElectricityPrices = '/electricity-prices',
	Expenses = '/expenses',
	Income = '/income',
	Savings = '/savings',
	Taxes = '/taxes',
	Accounts = '/accounts',
}
