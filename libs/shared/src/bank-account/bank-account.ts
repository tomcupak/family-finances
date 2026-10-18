/**
 * Bank account numbers and QR payments (SPAYD - "QR Platba" of the Czech Banking Association).
 * A Czech account is `[prefix-]number/bankCode` (prefix ≤ 6 digits, number 2-10 digits, both with the
 * mod-11 checksum); any other account is entered as an IBAN. QR payments need the IBAN.
 */

/** Weights of the Czech mod-11 checksum, from the rightmost digit. */
const CZECH_WEIGHTS = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]
const CZECH_PATTERN = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/
/** SPAYD `MSG` limit. */
const MESSAGE_MAX_LENGTH = 60

export interface ParsedAccount {
	/** As stored and displayed: `prefix-number/bank` without spaces, or the IBAN in upper case without spaces. */
	normalized: string
	iban: string
}

export interface PaymentInput {
	iban: string
	/** CZK, must be positive. */
	amount: number
	/** Up to 10 digits. */
	variableSymbol?: string | null
	/** Message for the recipient - diacritics and `*` are dropped, cut to 60 characters. */
	message?: string | null
}

/** Parses a Czech account number or an IBAN; `null` = not a valid account (format or checksum). */
export function parse(input: string): ParsedAccount | null {
	const compact = input.replace(/\s+/g, '').toUpperCase()
	const czech = CZECH_PATTERN.exec(compact)
	if (czech) {
		const [, prefix = '', number = '', bankCode = ''] = czech
		if (!hasCzechChecksum(prefix) || !hasCzechChecksum(number) || /^0+$/.test(number)) return null
		return { normalized: compact, iban: czechToIban(prefix, number, bankCode) }
	}
	if (IBAN_PATTERN.test(compact) && mod97(ibanDigits(compact)) === 1) return { normalized: compact, iban: compact }
	return null
}

/** SPAYD string for a QR payment in CZK: `SPD*1.0*ACC:…*AM:…*CC:CZK[*X-VS:…][*MSG:…]`. */
export function spayd(payment: PaymentInput): string {
	const parts = ['SPD', '1.0', `ACC:${payment.iban}`, `AM:${payment.amount.toFixed(2)}`, 'CC:CZK']
	if (payment.variableSymbol) parts.push(`X-VS:${payment.variableSymbol}`)
	const message = payment.message ? toPlainText(payment.message).slice(0, MESSAGE_MAX_LENGTH).trim() : ''
	if (message) parts.push(`MSG:${message}`)
	return parts.join('*')
}

function hasCzechChecksum(digits: string): boolean {
	let sum = 0
	for (let i = 0; i < digits.length; i++) {
		sum += Number(digits[digits.length - 1 - i]) * (CZECH_WEIGHTS[i] ?? 0)
	}
	return sum % 11 === 0
}

function czechToIban(prefix: string, number: string, bankCode: string): string {
	const bban = bankCode + prefix.padStart(6, '0') + number.padStart(10, '0')
	const check = 98 - mod97(ibanDigits(`CZ00${bban}`))
	return `CZ${String(check).padStart(2, '0')}${bban}`
}

/** IBAN as the digit string for the mod-97 check: country + check digits moved to the end, letters → 10-35. */
function ibanDigits(iban: string): string {
	const rearranged = iban.slice(4) + iban.slice(0, 4)
	return rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))
}

/** Remainder of a long digit string modulo 97, computed piecewise. */
function mod97(digits: string): number {
	let remainder = 0
	for (let i = 0; i < digits.length; i += 7) {
		remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97
	}
	return remainder
}

/** Strips diacritics and the SPAYD separator `*`, collapses whitespace. */
function toPlainText(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
}
