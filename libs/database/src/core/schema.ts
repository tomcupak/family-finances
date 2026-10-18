import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, numeric, pgEnum, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { ExpenseCategory, ExpenseRecurrence, IncomeType, MeterEntryMode, TaxAdvanceKind, UtilityType } from './types'

export const utilityType = pgEnum('utility_type', UtilityType)
export const meterEntryMode = pgEnum('meter_entry_mode', MeterEntryMode)
export const expenseCategory = pgEnum('expense_category', ExpenseCategory)
export const expenseRecurrence = pgEnum('expense_recurrence', ExpenseRecurrence)
export const incomeType = pgEnum('income_type', IncomeType)
export const taxAdvanceKind = pgEnum('tax_advance_kind', TaxAdvanceKind)

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

/** A family / budget (e.g. "Rodina", "Firma") - NOT a user account; auth stays a single shared token. */
export const account = pgTable('account', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	name: varchar('name').notNull(),
	createdAt,
}, (t) => [
	uniqueIndex('unique_account_name').on(t.name),
])

/**
 * A named meter sheet ("Dům – elektřina", "Elektroauto", "Firma – voda") - global, not per account.
 * Units: electricity kWh, water litres, gas m³. `entryMode` (fixed after creation) says whether readings
 * are meter states or consumption increments - see `MeterEntryMode`.
 */
export const meterSheet = pgTable('meter_sheet', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	name: varchar('name').notNull(),
	utility: utilityType('utility').notNull(),
	entryMode: meterEntryMode('entry_mode').notNull().default(MeterEntryMode.state),
	archived: boolean('archived').notNull().default(false),
	createdAt,
}, (t) => [
	uniqueIndex('unique_meter_sheet_name').on(t.name),
])

/**
 * A meter state on a given day (or, for an `increment` sheet, the consumption up to that day). `valueHigh` is the high tariff (VT) for electricity and the only
 * state for water/gas; `valueLow` is the low tariff (NT) - electricity only, otherwise null.
 */
export const meterReading = pgTable('meter_reading', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	sheetGuid: uuid('sheet_guid').notNull().references(() => meterSheet.guid, { onDelete: 'cascade' }),
	readingDate: date('reading_date', { mode: 'string' }).notNull(),
	valueHigh: numeric('value_high', { precision: 12, scale: 3, mode: 'number' }).notNull(),
	valueLow: numeric('value_low', { precision: 12, scale: 3, mode: 'number' }),
	note: varchar('note'),
	createdAt,
}, (t) => [
	uniqueIndex('unique_meter_reading_date').on(t.sheetGuid, t.readingDate),
])

/**
 * Someone an account pays its expenses to (landlord, energy supplier, …). `bankAccount` is a Czech
 * `[prefix-]number/bank` or an IBAN (validated and normalized by the service), null = paid otherwise.
 * An expense has at most one payee; the expenses of a payee in a month make up one payment (QR code).
 */
export const payee = pgTable('payee', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	accountGuid: uuid('account_guid').notNull().references(() => account.guid, { onDelete: 'cascade' }),
	name: varchar('name').notNull(),
	bankAccount: varchar('bank_account'),
	variableSymbol: varchar('variable_symbol'),
	createdAt,
}, (t) => [
	uniqueIndex('unique_payee_name').on(t.accountGuid, t.name),
])

/**
 * A recurring (or one-off) expense of an account. Months are stored as the first day of the month.
 * Occurs every 1/3/12 months (by `recurrence`) from `startMonth` up to `endMonth` inclusive
 * (`null` = indefinitely); a `once` expense has `endMonth = startMonth`.
 * An expense linked to a meter sheet (`meterSheetGuid`) is always monthly with `amount = 0` - its
 * month amount is computed from the sheet's consumption and `expenseUtilityPrice`.
 */
export const expense = pgTable('expense', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	accountGuid: uuid('account_guid').notNull().references(() => account.guid, { onDelete: 'cascade' }),
	name: varchar('name').notNull(),
	category: expenseCategory('category').notNull(),
	amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
	recurrence: expenseRecurrence('recurrence').notNull(),
	/** Linked meter sheet - the month amount is then consumption × `expenseUtilityPrice` and `amount` is 0. */
	meterSheetGuid: uuid('meter_sheet_guid').references(() => meterSheet.guid, { onDelete: 'set null' }),
	/** Who the expense is paid to - groups the month's expenses into payments. */
	payeeGuid: uuid('payee_guid').references(() => payee.guid, { onDelete: 'set null' }),
	startMonth: date('start_month', { mode: 'string' }).notNull(),
	endMonth: date('end_month', { mode: 'string' }),
	note: varchar('note'),
	createdAt,
}, (t) => [
	index('expense_account_guid_idx').on(t.accountGuid),
])

/**
 * A payment to a payee for a month (`YYYY-MM-01`) marked as paid - covers all the payee's expenses (and
 * corrections) of that month. `amount` = the payment total when it was marked, to spot later changes.
 */
export const payeePayment = pgTable('payee_payment', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	payeeGuid: uuid('payee_guid').notNull().references(() => payee.guid, { onDelete: 'cascade' }),
	month: date('month', { mode: 'string' }).notNull(),
	amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
	paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	uniqueIndex('unique_payee_payment_month').on(t.payeeGuid, t.month),
])

/**
 * Unit prices of a meter-linked expense, set for a month (`YYYY-MM-01`). A month without its own row
 * inherits the latest earlier one. `unitPriceHigh` = VT / the only price (water per m³ - readings are
 * in litres), `unitPriceLow` = NT (electricity only, null = use VT), `fixedFee` = monthly fixed charges (CZK).
 */
export const expenseUtilityPrice = pgTable('expense_utility_price', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	expenseGuid: uuid('expense_guid').notNull().references(() => expense.guid, { onDelete: 'cascade' }),
	month: date('month', { mode: 'string' }).notNull(),
	unitPriceHigh: numeric('unit_price_high', { precision: 12, scale: 4, mode: 'number' }).notNull(),
	unitPriceLow: numeric('unit_price_low', { precision: 12, scale: 4, mode: 'number' }),
	fixedFee: numeric('fixed_fee', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
	createdAt,
}, (t) => [
	uniqueIndex('unique_expense_utility_price_month').on(t.expenseGuid, t.month),
])

/**
 * A correction of an expense's month amount - the SPOT-price overpayment / underpayment found out after
 * the month. `forMonth` = the month it corrects, `applyMonth` = the month whose expenses it is counted in
 * (default `forMonth` + 1). `amount` > 0 = underpayment (pay extra), < 0 = overpayment (refund).
 */
export const expenseCorrection = pgTable('expense_correction', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	expenseGuid: uuid('expense_guid').notNull().references(() => expense.guid, { onDelete: 'cascade' }),
	forMonth: date('for_month', { mode: 'string' }).notNull(),
	applyMonth: date('apply_month', { mode: 'string' }).notNull(),
	amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
	note: varchar('note'),
	createdAt,
}, (t) => [
	index('expense_correction_expense_guid_idx').on(t.expenseGuid),
	index('expense_correction_apply_month_idx').on(t.applyMonth),
])

/**
 * Income plan of an account for a calendar year - employment (HPP) or self-employment (OSVČ).
 * Creating a year creates its 12 `incomeMonth` rows; `defaultHourlyRate` prefills their `hourlyRate`.
 * `vacationAllowance` = OSVČ vacation days for the year to spread over the months' `vacationDays`.
 */
export const incomeYear = pgTable('income_year', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	accountGuid: uuid('account_guid').notNull().references(() => account.guid, { onDelete: 'cascade' }),
	year: integer('year').notNull(),
	type: incomeType('type').notNull(),
	defaultHourlyRate: numeric('default_hourly_rate', { precision: 12, scale: 2, mode: 'number' }),
	vacationAllowance: numeric('vacation_allowance', { precision: 4, scale: 1, mode: 'number' }).notNull().default(27),
	createdAt,
}, (t) => [
	uniqueIndex('unique_income_year').on(t.accountGuid, t.year),
])

/**
 * One month (1-12) of an income year. HPP uses `grossSalary` / `netSalary` (null = same as gross);
 * OSVČ uses `hourlyRate`, `workingDays`, `vacationDays` and `expectedInvoice`.
 */
export const incomeMonth = pgTable('income_month', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	incomeYearGuid: uuid('income_year_guid').notNull().references(() => incomeYear.guid, { onDelete: 'cascade' }),
	month: smallint('month').notNull(),
	grossSalary: numeric('gross_salary', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
	netSalary: numeric('net_salary', { precision: 12, scale: 2, mode: 'number' }),
	hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
	workingDays: smallint('working_days').notNull(),
	vacationDays: numeric('vacation_days', { precision: 4, scale: 1, mode: 'number' }).notNull().default(0),
	expectedInvoice: numeric('expected_invoice', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
}, (t) => [
	uniqueIndex('unique_income_month').on(t.incomeYearGuid, t.month),
	check('income_month_month_range', sql`${t.month} between 1 and 12`),
])

/**
 * A savings goal of an account. `currentBalance` is the saved amount as of `balanceDate` (updated by hand -
 * no interest is modelled); the monthly contribution needed to reach `targetAmount` by the end of
 * `targetMonth` (`YYYY-MM-01`) is computed, not stored.
 */
export const savingsGoal = pgTable('savings_goal', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	accountGuid: uuid('account_guid').notNull().references(() => account.guid, { onDelete: 'cascade' }),
	name: varchar('name').notNull(),
	currentBalance: numeric('current_balance', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
	balanceDate: date('balance_date', { mode: 'string' }).notNull(),
	targetAmount: numeric('target_amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
	targetMonth: date('target_month', { mode: 'string' }).notNull(),
	note: varchar('note'),
	/** Contribution of the `balanceDate` month confirmed as deposited (already part of `currentBalance`); `null` = that month's deposit is still due. */
	confirmedContribution: numeric('confirmed_contribution', { precision: 12, scale: 2, mode: 'number' }),
	createdAt,
}, (t) => [
	index('savings_goal_account_guid_idx').on(t.accountGuid),
])

/**
 * Tax return (OSVČ) of an account for a calendar year, with the year's constants (rates in %, amounts in CZK)
 * editable per year. Income = Σ `incomeMonth.expectedInvoice` of the year unless `incomeOverride` is set.
 * `closedAt` set = the year is closed: the return, its advances and the year's income can't be changed.
 */
export const taxReturn = pgTable('tax_return', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	accountGuid: uuid('account_guid').notNull().references(() => account.guid, { onDelete: 'cascade' }),
	year: integer('year').notNull(),
	closedAt: timestamp('closed_at', { withTimezone: true }),
	incomeOverride: numeric('income_override', { precision: 12, scale: 2, mode: 'number' }),
	expenseRatePct: numeric('expense_rate_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(60),
	taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(15),
	assessmentBasePct: numeric('assessment_base_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(55),
	socialRatePct: numeric('social_rate_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(29.2),
	healthRatePct: numeric('health_rate_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(13.5),
	socialMin: numeric('social_min', { precision: 12, scale: 2, mode: 'number' }).notNull().default(57108),
	healthMin: numeric('health_min', { precision: 12, scale: 2, mode: 'number' }).notNull().default(37716),
	basicDiscount: numeric('basic_discount', { precision: 12, scale: 2, mode: 'number' }).notNull().default(30840),
	spouseDiscount: numeric('spouse_discount', { precision: 12, scale: 2, mode: 'number' }).notNull().default(24840),
	/** Σ for all children. */
	childDiscount: numeric('child_discount', { precision: 12, scale: 2, mode: 'number' }).notNull().default(35664),
	createdAt,
}, (t) => [
	uniqueIndex('unique_tax_return').on(t.accountGuid, t.year),
])

/** A monthly advance (month 1-12) of a tax return - social / health insurance or income tax. A missing row = 0. */
export const taxAdvance = pgTable('tax_advance', {
	guid: uuid('guid').primaryKey().defaultRandom(),
	taxReturnGuid: uuid('tax_return_guid').notNull().references(() => taxReturn.guid, { onDelete: 'cascade' }),
	month: smallint('month').notNull(),
	kind: taxAdvanceKind('kind').notNull(),
	amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
}, (t) => [
	uniqueIndex('unique_tax_advance').on(t.taxReturnGuid, t.month, t.kind),
	check('tax_advance_month_range', sql`${t.month} between 1 and 12`),
])
