import type { TaxReturn } from '../api/schema/models'
import { TaxAdvanceKind } from '../api/schema/models'

export const ADVANCE_KIND_LABEL: Record<TaxAdvanceKind, string> = {
	social: 'Sociální',
	health: 'Zdravotní',
	tax: 'Daň',
}

export const ADVANCE_KINDS = Object.values(TaxAdvanceKind)

/** Editable constants of a tax return - the `SaveTaxReturn` fields without `incomeOverride`. */
export type TaxConstantKey =
	| 'expenseRatePct' | 'taxRatePct' | 'assessmentBasePct' | 'socialRatePct' | 'healthRatePct'
	| 'socialMin' | 'healthMin' | 'basicDiscount' | 'spouseDiscount' | 'childDiscount'

export const TAX_CONSTANT_FIELDS: { key: TaxConstantKey; label: string; unit: '%' | 'Kč' }[] = [
	{ key: 'expenseRatePct', label: 'Výdajový paušál', unit: '%' },
	{ key: 'taxRatePct', label: 'Sazba daně', unit: '%' },
	{ key: 'assessmentBasePct', label: 'Vyměřovací základ ze základu daně', unit: '%' },
	{ key: 'socialRatePct', label: 'Sazba sociálního', unit: '%' },
	{ key: 'healthRatePct', label: 'Sazba zdravotního', unit: '%' },
	{ key: 'socialMin', label: 'Minimální sociální (rok)', unit: 'Kč' },
	{ key: 'healthMin', label: 'Minimální zdravotní (rok)', unit: 'Kč' },
	{ key: 'basicDiscount', label: 'Sleva na poplatníka', unit: 'Kč' },
	{ key: 'spouseDiscount', label: 'Sleva na manželku/manžela', unit: 'Kč' },
	{ key: 'childDiscount', label: 'Sleva na děti (součet)', unit: 'Kč' },
]

/** + underpayment (doplatek), − overpayment (přeplatek), 0 = settled. */
export function settlementLabel(difference: number): string {
	if (difference > 0) return 'doplatek'
	if (difference < 0) return 'přeplatek'
	return 'vyrovnáno'
}

export function isClosed(data: TaxReturn): boolean {
	return data.closedAt !== null
}
