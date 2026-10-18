import Axios from 'axios'

/** Typed error code from an API error response body (`{ code: '...' }`), if any. */
export function apiErrorCode(err: unknown): string | undefined {
	if (!Axios.isAxiosError(err)) return undefined
	const data: unknown = err.response?.data
	if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string') return data.code
	return undefined
}

const MESSAGES: Record<string, string> = {
	sheet_not_found: 'List odečtů už neexistuje.',
	duplicate_sheet_name: 'List s tímto názvem už existuje.',
	invalid_sheet_name: 'Zadejte platný název listu.',
	reading_not_found: 'Odečet už neexistuje.',
	duplicate_reading_date: 'Pro toto datum už odečet existuje.',
	invalid_reading_values: 'Elektřina vyžaduje stav NT i VT, voda a plyn jen jeden stav.',
	invalid_month: 'Neplatný měsíc.',
	account_not_found: 'Účet už neexistuje.',
	expense_not_found: 'Náklad už neexistuje.',
	invalid_expense_name: 'Zadejte platný název nákladu.',
	invalid_expense_range: 'Měsíc ukončení nesmí být před měsícem začátku.',
	linked_expense_not_monthly: 'Náklad napojený na odečty se musí opakovat měsíčně.',
	expense_not_linked: 'Cenu lze nastavit jen u nákladu napojeného na odečty.',
	utility_price_not_found: 'Cena pro tento měsíc není nastavená.',
	correction_not_found: 'Oprava už neexistuje.',
	invalid_correction_range: 'Měsíc započtení nesmí být před opravovaným měsícem.',
	invalid_correction_amount: 'Oprava musí mít nenulový rozdíl.',
	expense_not_in_month: 'Náklad se v opravovaném měsíci neplatí.',
	payee_not_found: 'Příjemce už neexistuje.',
	invalid_payee_name: 'Zadejte platné jméno příjemce.',
	duplicate_payee_name: 'Příjemce s tímto jménem už existuje.',
	invalid_bank_account: 'Neplatné číslo účtu – zadejte český účet (např. 19-2000145399/0800) nebo IBAN.',
	payment_not_in_month: 'Příjemci se v tomto měsíci nic neplatí.',
	payment_not_found: 'Platba není označená jako zaplacená.',
	income_year_not_found: 'Pro tento rok není příjmový plán.',
	duplicate_income_year: 'Příjmový plán pro tento rok už existuje.',
	invalid_income_year: 'Neplatný rok.',
	invalid_income_month: 'Dovolená nesmí být delší než počet pracovních dnů.',
	savings_goal_not_found: 'Cíl spoření už neexistuje.',
	invalid_savings_goal_name: 'Zadejte platný název cíle.',
	invalid_savings_goal_target: 'Cílová částka musí být kladná a termín nesmí být před měsícem stavu.',
	savings_contribution_not_due: 'Vklad na tento měsíc už je potvrzený nebo žádný není.',
	savings_contribution_not_confirmed: 'Vklad na tento měsíc není potvrzený.',
	income_year_locked: 'Rok je uzavřený (daňové přiznání) – příjmy nelze měnit.',
	tax_return_not_found: 'Pro tento rok není daňové přiznání.',
	duplicate_tax_return: 'Daňové přiznání pro tento rok už existuje.',
	invalid_tax_year: 'Neplatný rok.',
	invalid_tax_advance_month: 'Neplatný měsíc zálohy.',
	tax_return_closed: 'Rok je uzavřený – přiznání ani zálohy nelze měnit.',
	tax_year_not_finished: 'Uzavřít lze jen rok, který už celý skončil.',
}

export function apiErrorMessage(err: unknown, fallback = 'Uložení se nezdařilo.'): string {
	const code = apiErrorCode(err)
	return (code && MESSAGES[code]) ?? fallback
}
