export enum UtilityType {
	electricity = 'electricity',
	water = 'water',
	gas = 'gas',
}

/**
 * How readings of a meter sheet are entered: `state` = cumulative meter states (consumption = difference
 * to the previous reading), `increment` = the consumption itself (e.g. a car charger's kWh for the month).
 */
export enum MeterEntryMode {
	state = 'state',
	increment = 'increment',
}

export enum ExpenseCategory {
	taxes = 'taxes',
	services = 'services',
	car = 'car',
	kids = 'kids',
	other = 'other',
}

/** How often an expense repeats from its `startMonth`: once, every 1, 3 or 12 months. */
export enum ExpenseRecurrence {
	once = 'once',
	monthly = 'monthly',
	quarterly = 'quarterly',
	yearly = 'yearly',
}

/** Income kind of a year: employment (HPP - salary) or self-employment (OSVČ - invoices by hourly rate). */
export enum IncomeType {
	employee = 'employee',
	self_employed = 'self_employed',
}

/** Kind of a monthly tax advance of a self-employed person (OSVČ): social / health insurance or income tax. */
export enum TaxAdvanceKind {
	social = 'social',
	health = 'health',
	tax = 'tax',
}

/**
 * How an electricity price period is priced: `fixed` = a contract price per kWh, `spot` = an invoice for
 * a date range (price per kWh = invoice amount / consumption of the period).
 */
export enum ElectricityPriceMode {
	fixed = 'fixed',
	spot = 'spot',
}
