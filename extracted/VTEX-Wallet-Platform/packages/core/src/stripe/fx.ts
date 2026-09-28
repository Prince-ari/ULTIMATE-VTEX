import { ValidationError } from "../auth/permissions"

/**
 * Le franc Pacifique (XPF) est arrimé à l'euro par une parité FIXE : 1 000 XPF = 8,38 EUR,
 * soit 1 EUR = 119,3317 XPF. Aucun risque de change : la conversion est déterministe,
 * ce qui permet de recharger un wallet en euros avec des francs Pacifique (et inversement).
 * Le dollar n'a pas de parité fixe : il n'est jamais converti.
 */
export const EUR_XPF_RATE = 119.3317

export type MoneyCurrency = "EUR" | "USD" | "XPF"

/** Symbole d'affichage : le franc Pacifique s'écrit « ₣ » (U+20A3), jamais « XPF » ni « F CFP ». */
export const CURRENCY_SYMBOLS: Record<MoneyCurrency, string> = { EUR: "€", USD: "$", XPF: "₣" }

/** XPF n'a pas de centimes : l'unité mineure est le franc lui-même. */
export const minorDivisor = (currency: string) => (currency === "XPF" ? 1 : 100)

export function canConvert(from: string, to: string) {
  return from === to || (from !== "USD" && to !== "USD")
}

/** Convertit un montant en unité mineure (centimes, ou francs pour XPF) au taux fixe EUR↔XPF. */
export function convertMinor(amountMinor: number, from: string, to: string): number {
  if (from === to) return amountMinor
  if (!canConvert(from, to)) throw new ValidationError(`Conversion ${from} → ${to} indisponible : ces devises n'ont pas de parité fixe.`)
  const major = amountMinor / minorDivisor(from)
  const converted = from === "EUR" ? major * EUR_XPF_RATE : major / EUR_XPF_RATE
  return Math.round(converted * minorDivisor(to))
}

/** Comme convertMinor mais arrondi VERS LE BAS : pour les plafonds, qui ne doivent jamais être dépassés par l'arrondi. */
export function floorConvertMinor(amountMinor: number, from: string, to: string): number {
  if (from === to) return amountMinor
  if (!canConvert(from, to)) throw new ValidationError(`Conversion ${from} → ${to} indisponible : ces devises n'ont pas de parité fixe.`)
  const major = amountMinor / minorDivisor(from)
  const converted = from === "EUR" ? major * EUR_XPF_RATE : major / EUR_XPF_RATE
  // 1e-6 : absorbe le bruit des flottants (596658.4999999999 vs 596658.5) sans jamais arrondir vers le haut.
  return Math.floor(converted * minorDivisor(to) + 1e-6)
}

/** Équivalent en centimes d'euro (le dollar est compté 1:1 : approximation prudente, jamais supérieure à l'euro). */
export function eurEquivalentMinor(amountMinor: number, currency: string): number {
  return currency === "XPF" ? convertMinor(amountMinor, "XPF", "EUR") : amountMinor
}

/** Affichage cohérent partout : « 1 234,56 € », « 119 000 ₣ », « 12,00 $ ». */
export function formatMinor(amountMinor: number, currency: string): string {
  const digits = currency === "XPF" ? 0 : 2
  const number = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amountMinor / minorDivisor(currency))
  return `${number} ${CURRENCY_SYMBOLS[currency as MoneyCurrency] ?? currency}`
}
