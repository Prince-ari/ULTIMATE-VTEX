"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegSocle } from "@/components/ui/legkit"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type PickableHolder = Outputs["admin"]["banking"]["holders"][number]
export interface HolderSelection { holder: PickableHolder; accountId: number | null }

/**
 * Choix d'un titulaire (personne ou société) puis d'un de ses comptes crédités. La liste vient du serveur (recherche) ; le serveur revérifie
 * de toute façon que le compte appartient bien au titulaire (jamais confiance au sélecteur).
 * `currency` : ne propose que les comptes de cette devise (un sous-RIB garde sa devise).
 */
export function HolderPicker({ value, onChange, currency, idPrefix = "hp" }: { value: HolderSelection | null; onChange: (next: HolderSelection | null) => void; currency?: string; idPrefix?: string }) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<PickableHolder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (value) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      api.admin.banking.holders.query({ query }).then((rows) => { if (!cancelled) setResults(rows) }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Recherche impossible.") }).finally(() => { if (!cancelled) setLoading(false) })
    }, query ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, value])

  if (value) {
    const accounts = value.holder.accounts.filter((account) => !currency || account.currency === currency)
    return (
      <div className="lg-stack">
        <div className="lg-choice" style={{ cursor: "default" }} aria-live="polite">
          <LegSocle icon={value.holder.walletType === "PERSONAL" ? "user" : "building"} tone={value.holder.walletType === "PERSONAL" ? "violet" : "teal"} size="md" />
          <span><strong>{value.holder.name}</strong><small>{value.holder.walletType === "PERSONAL" ? "Wallet personnel" : "Wallet Pro"}{value.holder.subtitle ? ` · ${value.holder.subtitle}` : ""}</small></span>
        </div>
        <div>
          <label className="lg-label" htmlFor={`${idPrefix}-account`}>Compte crédité</label>
          <select id={`${idPrefix}-account`} className="lg-input" value={value.accountId ?? ""} onChange={(event) => onChange({ holder: value.holder, accountId: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Choisir un compte…</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}{account.hasMain ? " · a un RIB principal" : ""}</option>)}
          </select>
          {accounts.length === 0 ? <p className="lg-hint" role="alert">Aucun compte en {currency} chez ce titulaire.</p> : null}
        </div>
        <LegButton variant="ghost" icon="close" onClick={() => onChange(null)}>Changer de titulaire</LegButton>
      </div>
    )
  }

  return (
    <div className="lg-stack">
      <div className="relative">
        <LegIcon name="search" className="lg-input-lead" />
        <input id={`${idPrefix}-search`} type="search" className="lg-input lg-input-icon" placeholder="Nom, e-mail ou société…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Rechercher un titulaire" autoComplete="off" />
      </div>
      {error ? <p className="lg-error" role="alert">{error}</p> : null}
      <div className="lg-picker" role="listbox" aria-label="Titulaires" aria-busy={loading}>
        {results.length === 0 && !loading ? <p className="lg-hint">Aucun titulaire ne correspond.</p> : null}
        {results.map((holder) => (
          <button key={`${holder.walletType}-${holder.holderId}`} type="button" role="option" aria-selected={false} className="lg-choice" onClick={() => onChange({ holder, accountId: holder.accounts.filter((account) => !currency || account.currency === currency)[0]?.id ?? null })}>
            <LegSocle icon={holder.walletType === "PERSONAL" ? "user" : "building"} tone={holder.walletType === "PERSONAL" ? "violet" : "teal"} size="md" />
            <span><strong>{holder.name}</strong><small>{holder.walletType === "PERSONAL" ? "Personnel" : "Pro"} · {holder.subtitle ?? "—"} · {holder.accounts.map((account) => account.currency).join(", ")}</small></span>
          </button>
        ))}
      </div>
    </div>
  )
}
