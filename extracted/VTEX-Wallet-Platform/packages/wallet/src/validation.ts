import { assertCents, isCurrencyCode, type Currency } from "@vtex/money"
import { ValidationError } from "@vtex/core"

export function assertPositiveCents(value: unknown, context = "amount"): asserts value is number {
  try {
    assertCents(value, context)
  } catch {
    throw new ValidationError(`${context} doit être un montant entier exprimé dans l’unité minimale de la devise.`)
  }
  if (value <= 0) throw new ValidationError(`${context} doit être strictement positif.`)
}

export function assertSupportedCurrency(value: string): asserts value is Currency {
  if (!isCurrencyCode(value)) {
    throw new ValidationError("Devise non prise en charge.")
  }
}

/** Date de valeur affichée au titulaire : jamais dans le futur (on ne fabrique pas une opération qui n'a pas encore eu lieu). */
export function assertValueDate(value: Date): asserts value is Date {
  if (Number.isNaN(value.getTime())) throw new ValidationError("Date de valeur invalide.")
  if (value.getTime() > Date.now() + 60_000) throw new ValidationError("La date de valeur ne peut pas être dans le futur.")
}

/** Validation IBAN/BIC partagée avec le Wallet Pro : voir `@vtex/core` (checksum ISO 13616 / MOD 97). */
export { normalizeAndValidateBic, normalizeAndValidateIban } from "@vtex/core"

export function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._:-]{16,100}$/.test(value)) {
    throw new ValidationError("La clé d’idempotence doit contenir 16 à 100 caractères sûrs.")
  }
}
