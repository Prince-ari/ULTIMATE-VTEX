/**
 * @vtex/money
 *
 * Règle absolue du projet VTEX (Sprint 0 §6-7, Sprint 6) : toute somme
 * d'argent est un entier, jamais un flottant. Ce package est le SEUL
 * endroit où une conversion montant <-> entier stocké doit avoir lieu —
 * aucun autre module ne doit faire `montant * 100` de son côté.
 *
 * Multi-devises (EUR/USD/XPF) : XPF (franc Pacifique/CFP) n'a pas de
 * sous-unité — comme le yen japonais, "1 XPF" est la plus petite unité
 * réelle, il n'existe pas de "centime XPF" en usage courant. L'entier
 * stocké représente donc directement le montant XPF (facteur 1), alors
 * qu'il représente des centimes pour EUR/USD (facteur 100) — même
 * convention que les API de paiement du marché (Stripe, etc.) pour les
 * "devises à zéro décimale". `Intl.NumberFormat` connaît déjà nativement
 * cette règle pour le FORMATAGE (vérifié : XPF s'affiche sans décimale
 * automatiquement) — seul le facteur de stockage est à gérer ici.
 *
 * Portée volontairement limitée : ce package fait de l'arithmétique et du
 * formatage, jamais de règle métier (ex: "un wallet peut-il être négatif ?"
 * appartient au service Wallets du backend, pas ici).
 */

export type Cents = number

/** Codes ISO 4217 pris en charge. Source unique : les enums de validation, l'API publique et les interfaces en dérivent. */
export const CURRENCY_CODES = ["EUR", "USD", "XPF"] as const
export type Currency = (typeof CURRENCY_CODES)[number]

/**
 * Configuration centralisée d'une devise (wallet.currency → configuration → actif visuel).
 * Ajouter une devise = ajouter UNE entrée ici (et son code dans CURRENCY_CODES) ; aucune condition dispersée dans les interfaces.
 * L'icône est décrite par des données : `iconName` (icône Phosphor, sans préfixe) ou, à défaut, `glyph` (caractère à afficher).
 */
export interface CurrencyInfo {
  code: Currency
  /** Code numérique ISO 4217. */
  numeric: number
  name: string
  symbol: string
  /** Nombre de décimales de l'unité usuelle (0 : le montant stocké est déjà l'unité usuelle). */
  decimals: 0 | 2
  /** Nom de l'icône Phosphor (ex. « currency-eur »), ou null si aucune icône n'existe pour cette devise. */
  iconName: string | null
  /** Caractère de repli affiché quand il n'y a pas d'icône. */
  glyph: string
  /** Zone d'usage affichée dans les sélecteurs de devise. */
  region: string
  /**
   * Combien d'unités de cette devise pour 1 EUR à parité FIXE, ou null si aucune parité fixe n'existe (dollar) : seule une devise à parité
   * fixe peut servir de devise d'AFFICHAGE (les soldes restent stockés dans la devise du compte).
   */
  eurRate: number | null
  /** Teinte d'accent de l'actif visuel du wallet (nom de jeton de couleur, jamais une valeur en dur). */
  tone: "indigo" | "emerald" | "amber"
}

/**
 * Parité fixe EUR↔XPF : 1 000 XPF = 8,38 EUR, soit 1 EUR = 119,3317 XPF (même constante que le
 * backend, @vtex/core). Le dollar n'a pas de parité fixe : il n'est jamais converti.
 */
export const EUR_XPF_RATE = 119.3317

export const CURRENCY_CATALOG: Readonly<Record<Currency, CurrencyInfo>> = {
  EUR: { code: "EUR", numeric: 978, name: "Euro", symbol: "€", decimals: 2, iconName: "currency-eur", glyph: "€", region: "Zone euro", eurRate: 1, tone: "indigo" },
  USD: { code: "USD", numeric: 840, name: "Dollar américain", symbol: "$", decimals: 2, iconName: "currency-dollar", glyph: "$", region: "États-Unis", eurRate: null, tone: "emerald" },
  XPF: { code: "XPF", numeric: 953, name: "Franc Pacifique", symbol: "₣", decimals: 0, iconName: null, glyph: "₣", region: "Nouvelle-Calédonie, Polynésie", eurRate: EUR_XPF_RATE, tone: "amber" },
}

export function isCurrencyCode(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value)
}

/** Vrai si la devise peut servir de devise d'AFFICHAGE (parité fixe avec l'euro). */
export function isDisplayCurrency(value: unknown): value is Currency {
  return isCurrencyCode(value) && CURRENCY_CATALOG[value].eurRate !== null
}

/** Configuration d'une devise ; lève une erreur explicite pour un code non pris en charge. */
export function currencyInfo(code: string): CurrencyInfo {
  if (!isCurrencyCode(code)) throw new Error(`[@vtex/money] devise non prise en charge : ${String(code)}`)
  return CURRENCY_CATALOG[code]
}

const ZERO_DECIMAL_CURRENCIES: ReadonlySet<Currency> = new Set(CURRENCY_CODES.filter((code) => CURRENCY_CATALOG[code].decimals === 0))

function scaleFactor(currency: Currency): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100
}

/** Vrai si la valeur est un entier sûr — la seule forme valide de Cents. */
export function isValidCents(value: unknown): value is Cents {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value)
  )
}

/** Lève une erreur explicite si la valeur n'est pas un entier valide. */
export function assertCents(
  value: unknown,
  context = "amount",
): asserts value is Cents {
  if (!isValidCents(value)) {
    throw new Error(
      `[@vtex/money] ${context} doit être un entier, reçu : ${String(value)}`,
    )
  }
}

/**
 * Convertit un montant dans l'unité usuelle de sa devise (ex: saisie
 * utilisateur "19.99" en EUR, ou "1500" en XPF) vers l'entier stocké.
 * Utilise Math.round pour absorber les artefacts de flottant IEEE 754.
 */
export function fromMajorUnits(amount: number, currency: Currency = "EUR"): Cents {
  if (!Number.isFinite(amount)) {
    throw new Error(`[@vtex/money] fromMajorUnits: valeur invalide ${amount}`)
  }
  return Math.round(amount * scaleFactor(currency))
}

/** Convertit l'entier stocké vers le montant dans l'unité usuelle de sa devise, pour affichage/calcul non monétaire. */
export function toMajorUnits(cents: Cents, currency: Currency = "EUR"): number {
  assertCents(cents, "toMajorUnits")
  return cents / scaleFactor(currency)
}

/** @deprecated utiliser fromMajorUnits(amount, "EUR") — conservé pour compatibilité, EUR uniquement. */
export function fromEuros(euros: number): Cents {
  return fromMajorUnits(euros, "EUR")
}

/** @deprecated utiliser toMajorUnits(cents, "EUR") — conservé pour compatibilité, EUR uniquement. */
export function toEuros(cents: Cents): number {
  return toMajorUnits(cents, "EUR")
}

export function add(a: Cents, b: Cents): Cents {
  assertCents(a, "add:a")
  assertCents(b, "add:b")
  return a + b
}

export function subtract(a: Cents, b: Cents): Cents {
  assertCents(a, "subtract:a")
  assertCents(b, "subtract:b")
  return a - b
}

export function isPositive(cents: Cents): boolean {
  assertCents(cents, "isPositive")
  return cents > 0
}

export function isNegative(cents: Cents): boolean {
  assertCents(cents, "isNegative")
  return cents < 0
}

/** Symbole d'affichage : le franc Pacifique s'écrit « ₣ » (U+20A3), jamais « XPF », « FCFP » ni « F CFP ». */
export const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = { EUR: CURRENCY_CATALOG.EUR.symbol, USD: CURRENCY_CATALOG.USD.symbol, XPF: CURRENCY_CATALOG.XPF.symbol }

export function canConvert(from: Currency, to: Currency): boolean {
  return from === to || (from !== "USD" && to !== "USD")
}

/**
 * Convertit un montant stocké (centimes, ou francs pour XPF) d'une devise à l'autre à la parité
 * fixe. Pour l'AFFICHAGE uniquement : les soldes restent stockés dans la devise du compte.
 */
export function convert(cents: Cents, from: Currency, to: Currency): Cents {
  assertCents(cents, "convert")
  if (from === to) return cents
  if (!canConvert(from, to)) throw new Error(`[@vtex/money] convert: ${from} → ${to} sans parité fixe`)
  const major = toMajorUnits(cents, from)
  return fromMajorUnits(from === "EUR" ? major * EUR_XPF_RATE : major / EUR_XPF_RATE, to)
}

/**
 * Formatage affichage, ex: format(150000) -> "1 500,00 €",
 * format(1500, "XPF") -> "1 500 ₣" (zéro décimale, sous-unité inexistante).
 */
export function format(cents: Cents, currency: Currency = "EUR", locale = "fr-FR"): string {
  assertCents(cents, "format")
  const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toMajorUnits(cents, currency))
  return `${number} ${CURRENCY_SYMBOLS[currency]}`
}
