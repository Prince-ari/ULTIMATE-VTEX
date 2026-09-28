"use client"

import * as React from "react"
import { canConvert, convert, CURRENCY_SYMBOLS, EUR_XPF_RATE, format, fromMajorUnits, toMajorUnits, type Currency } from "@vtex/money"

/**
 * Devise d'AFFICHAGE de Wallet Pro (€ ou ₣). Les comptes de l'entreprise restent stockés dans leur devise : seul
 * l'affichage (et la saisie des montants) suit ce choix, à la parité fixe 1 € = 119,3317 ₣. Le dollar n'est jamais converti.
 */
export type DisplayCurrency = "EUR" | "XPF"

const STORAGE_KEY = "vtex-business-display-currency"

type Value = {
  display: DisplayCurrency
  setDisplay: (next: DisplayCurrency) => void
  /** Montant stocké (centimes, ou francs pour XPF) → texte dans la devise d'affichage. */
  money: (cents: number, currency?: string) => string
  /** Idem, sans le symbole (« 1 234,56 ») — pour les gros affichages avec symbole séparé. */
  numeric: (cents: number, currency?: string) => string
  symbol: string
}

const Ctx = React.createContext<Value | null>(null)

function normalise(currency: string): Currency {
  return currency === "USD" || currency === "XPF" ? currency : "EUR"
}

/** Devise dans laquelle un montant d'un compte de cette devise est présenté. */
export function targetCurrency(accountCurrency: string, display: DisplayCurrency): Currency {
  const from = normalise(accountCurrency)
  return from === "USD" ? "USD" : display
}

/** Conversion d'affichage pure (testable hors React). */
export function displayMoney(cents: number, currency: string, display: DisplayCurrency): string {
  const from = normalise(currency)
  const to = targetCurrency(currency, display)
  return format(canConvert(from, to) ? convert(Math.round(cents), from, to) : Math.round(cents), canConvert(from, to) ? to : from)
}

export function displayNumeric(cents: number, currency: string, display: DisplayCurrency): string {
  const text = displayMoney(cents, currency, display)
  return text.replace(/\s?[€$₣]$/u, "").replace(/ $/u, "")
}

/** Saisie « 2 000,50 » ou « 238663 » dans la devise de saisie → unité stockée du compte (`null` si invalide). */
export function parseToStored(value: string, inputCurrency: Currency, accountCurrency: string): number | null {
  const major = Number(value.trim().replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(major)) return null
  const account = normalise(accountCurrency)
  if (!canConvert(inputCurrency, account)) return null
  return convert(fromMajorUnits(major, inputCurrency), inputCurrency, account)
}

/** Unité stockée du compte → texte de champ de saisie dans la devise d'affichage. */
export function storedToInput(cents: number, accountCurrency: string, display: DisplayCurrency): string {
  const from = normalise(accountCurrency)
  const to = targetCurrency(accountCurrency, display)
  const ok = canConvert(from, to)
  return String(toMajorUnits(ok ? convert(Math.round(cents), from, to) : Math.round(cents), ok ? to : from))
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [display, setDisplayState] = React.useState<DisplayCurrency>("EUR")

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

  const value = React.useMemo<Value>(() => ({
    display,
    setDisplay,
    money: (cents, currency = "EUR") => displayMoney(cents, currency, display),
    numeric: (cents, currency = "EUR") => displayNumeric(cents, currency, display),
    symbol: CURRENCY_SYMBOLS[display],
  }), [display, setDisplay])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDisplayCurrency(): Value {
  const value = React.useContext(Ctx)
  if (value) return value
  return {
    display: "EUR",
    setDisplay: () => undefined,
    money: (cents, currency = "EUR") => displayMoney(cents, currency, "EUR"),
    numeric: (cents, currency = "EUR") => displayNumeric(cents, currency, "EUR"),
    symbol: "€",
  }
}

/** Sélecteur € / ₣ (Topbar et page de recharge). */
export function CurrencySwitch({ className = "" }: { className?: string }) {
  const { display, setDisplay } = useDisplayCurrency()
  const options: { key: DisplayCurrency; symbol: string; label: string }[] = [
    { key: "EUR", symbol: "€", label: "Euro" },
    { key: "XPF", symbol: "₣", label: "Franc Pacifique" },
  ]
  return (
    <div className={`inline-flex rounded-full border border-white/10 bg-[var(--c-s2)] p-[3px] ${className}`} role="group" aria-label="Devise d’affichage">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={display === option.key}
          onClick={() => setDisplay(option.key)}
          title={option.key === "XPF" ? `Parité fixe : 1 € = ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(EUR_XPF_RATE)} ₣` : "Euro"}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors legday-focus ${display === option.key ? "bg-white text-[#0a0d1e]" : "text-[var(--c-t2)] hover:text-[var(--c-t1)]"}`}
        >
          <b className="text-[13px]">{option.symbol}</b>
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  )
}
