"use client"

import * as React from "react"
import { canConvert, convert, CURRENCY_SYMBOLS, EUR_XPF_RATE, format, fromMajorUnits, toMajorUnits, type Currency } from "@vtex/money"

/**
 * Devise d'AFFICHAGE du Dashboard (€ ou ₣). Les comptes restent stockés dans leur devise : seul l'affichage est
 * converti, à la parité fixe 1 € = 119,3317 ₣. Le dollar n'a pas de parité fixe et n'est jamais converti.
 * Le choix est mémorisé dans le navigateur de l'opérateur.
 */
export type DisplayCurrency = "EUR" | "XPF"

const STORAGE_KEY = "vtex-dashboard-display-currency"

type DisplayCurrencyValue = {
  display: DisplayCurrency
  setDisplay: (next: DisplayCurrency) => void
  /** Montant stocké (centimes, ou francs pour XPF) → texte dans la devise d'affichage. */
  money: (cents: number, currency?: string) => string
  /** Montant saisi dans la devise d'affichage → unité stockée du compte cible (`null` si non convertible). */
  toStored: (value: string, accountCurrency: string) => number | null
  /** Devise dans laquelle l'opérateur saisit un montant destiné à un compte de cette devise. */
  inputCurrency: (accountCurrency: string) => Currency
}

const DisplayCurrencyContext = React.createContext<DisplayCurrencyValue | null>(null)

function normalise(currency: string): Currency {
  return currency === "USD" || currency === "XPF" ? currency : "EUR"
}

/** Conversion d'affichage pure (testable hors React). */
export function displayMoney(cents: number, currency: string, display: DisplayCurrency): string {
  const from = normalise(currency)
  const target: Currency = from === "USD" ? "USD" : display
  const value = canConvert(from, target) ? convert(Math.round(cents), from, target) : Math.round(cents)
  return format(value, canConvert(from, target) ? target : from)
}

/** Saisie « 2 000,50 » ou « 238663 » dans la devise de saisie → unité stockée du compte. */
export function parseToStored(value: string, inputCurrency: Currency, accountCurrency: string): number | null {
  const major = Number(value.trim().replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(major)) return null
  const account = normalise(accountCurrency)
  const entered = fromMajorUnits(major, inputCurrency)
  if (!canConvert(inputCurrency, account)) return null
  return convert(entered, inputCurrency, account)
}

/**
 * Devise d'affichage courante, lisible hors composant (gestionnaires de formulaires). Le Dashboard remonte ses pages
 * quand la devise change (voir DashboardShell) : les champs pré-remplis et les tableaux repartent toujours de la bonne devise.
 */
let activeDisplay: DisplayCurrency = "EUR"

/** Devise dans laquelle on saisit un montant destiné à un compte de cette devise (le dollar reste en dollars). */
function entryCurrency(accountCurrency: string): Currency {
  return normalise(accountCurrency) === "USD" ? "USD" : activeDisplay
}

export function entrySymbol(accountCurrency = "EUR"): string {
  return CURRENCY_SYMBOLS[entryCurrency(accountCurrency)]
}

/** Saisie de l'opérateur (devise d'affichage) → unité stockée du compte ; 0 si vide ou invalide. */
export function amountToCents(value: string, accountCurrency = "EUR"): number {
  const stored = parseToStored(value, entryCurrency(accountCurrency), accountCurrency)
  return stored === null ? 0 : stored
}

/** Unité stockée du compte → texte de champ de saisie dans la devise d'affichage (pré-remplissage). */
export function centsToInput(cents: number, accountCurrency = "EUR"): string {
  const from = normalise(accountCurrency)
  const to = entryCurrency(accountCurrency)
  return String(toMajorUnits(canConvert(from, to) ? convert(Math.round(cents), from, to) : Math.round(cents), canConvert(from, to) ? to : from))
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [display, setDisplayState] = React.useState<DisplayCurrency>("EUR")
  activeDisplay = display

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "EUR" || saved === "XPF") setDisplayState(saved)
    } catch { /* stockage indisponible : on garde l'euro */ }
  }, [])

  const setDisplay = React.useCallback((next: DisplayCurrency) => {
    setDisplayState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* choix non mémorisé */ }
  }, [])

  const value = React.useMemo<DisplayCurrencyValue>(() => ({
    display,
    setDisplay,
    money: (cents, currency = "EUR") => displayMoney(cents, currency, display),
    inputCurrency: (accountCurrency) => (normalise(accountCurrency) === "USD" ? "USD" : display),
    toStored: (input, accountCurrency) => parseToStored(input, normalise(accountCurrency) === "USD" ? "USD" : display, accountCurrency),
  }), [display, setDisplay])

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>
}

export function useMoney(): DisplayCurrencyValue {
  const value = React.useContext(DisplayCurrencyContext)
  if (value) return value
  // Hors provider (tests, pages isolées) : affichage en euros, sans mémorisation.
  return {
    display: "EUR",
    setDisplay: () => undefined,
    money: (cents, currency = "EUR") => displayMoney(cents, currency, "EUR"),
    inputCurrency: (accountCurrency) => normalise(accountCurrency),
    toStored: (input, accountCurrency) => parseToStored(input, normalise(accountCurrency), accountCurrency),
  }
}

/** Sélecteur € / ₣ affiché en tête du Dashboard. */
export function CurrencyToggle() {
  const { display, setDisplay } = useMoney()
  const options: { key: DisplayCurrency; symbol: string; label: string }[] = [
    { key: "EUR", symbol: "€", label: "Euro" },
    { key: "XPF", symbol: "₣", label: "Franc Pacifique" },
  ]
  return <div className="dashboard-currency-toggle" role="group" aria-label="Devise d’affichage">
    <span className="dashboard-currency-caption">Devise d’affichage</span>
    <div className="dashboard-currency-options">
      {options.map((option) => <button key={option.key} type="button" aria-pressed={display === option.key} onClick={() => setDisplay(option.key)} title={option.key === "XPF" ? `Parité fixe : 1 € = ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(EUR_XPF_RATE)} ₣` : "Euro"}><b>{option.symbol}</b> {option.label}</button>)}
    </div>
  </div>
}
