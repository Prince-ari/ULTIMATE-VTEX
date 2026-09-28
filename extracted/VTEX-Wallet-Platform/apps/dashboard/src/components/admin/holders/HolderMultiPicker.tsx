"use client"

import * as React from "react"

import { LegIcon } from "@/components/ui/LegIcon"
import { LegSocle } from "@/components/ui/legkit"

export interface HolderChoice {
  walletType: "PERSONAL" | "PROFESSIONAL"
  holderId: number
  name: string
  subtitle: string | null
}

export const choiceKey = (choice: Pick<HolderChoice, "walletType" | "holderId">) => `${choice.walletType}:${choice.holderId}`

/**
 * Choix de plusieurs wallets (personnes et entreprises) : recherche côté serveur, sélection en pastilles retirables.
 * La liste proposée vient du serveur ; le serveur revérifie de toute façon existence et périmètre à l'envoi (jamais confiance au sélecteur).
 */
export function HolderMultiPicker({ value, onChange, search, max = 50, idPrefix = "hmp", emptyLabel = "Aucun wallet ne correspond." }: {
  value: HolderChoice[]
  onChange: (next: HolderChoice[]) => void
  search: (query: string) => Promise<HolderChoice[]>
  max?: number
  idPrefix?: string
  emptyLabel?: string
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<HolderChoice[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const selected = React.useMemo(() => new Set(value.map(choiceKey)), [value])

  React.useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      search(query)
        .then((rows) => { if (!cancelled) setResults(rows) })
        .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Recherche impossible.") })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, query ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, search])

  function toggle(choice: HolderChoice) {
    const key = choiceKey(choice)
    if (selected.has(key)) onChange(value.filter((item) => choiceKey(item) !== key))
    else if (value.length < max) onChange([...value, choice])
  }

  return (
    <div className="lg-stack">
      {value.length > 0 ? (
        <ul className="lg-chips" aria-label={`${value.length} wallet${value.length > 1 ? "s" : ""} choisi${value.length > 1 ? "s" : ""}`}>
          {value.map((choice) => (
            <li key={choiceKey(choice)} className="lg-chip">
              <LegIcon name={choice.walletType === "PERSONAL" ? "user" : "building"} />
              <span>{choice.name}</span>
              <button type="button" onClick={() => toggle(choice)} aria-label={`Retirer ${choice.name}`}><LegIcon name="close" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <LegIcon name="search" className="lg-input-lead" />
        <input id={`${idPrefix}-search`} type="search" className="lg-input lg-input-icon" placeholder="Nom, e-mail ou société…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Rechercher un wallet" autoComplete="off" />
      </div>
      {error ? <p className="lg-error" role="alert">{error}</p> : null}
      <div className="lg-picker" role="listbox" aria-multiselectable="true" aria-label="Wallets" aria-busy={loading}>
        {results.length === 0 && !loading ? <p className="lg-hint">{emptyLabel}</p> : null}
        {results.map((choice) => {
          const on = selected.has(choiceKey(choice))
          return (
            <button key={choiceKey(choice)} type="button" role="option" aria-selected={on} className="lg-choice" data-selected={on || undefined} disabled={!on && value.length >= max} onClick={() => toggle(choice)}>
              <LegSocle icon={on ? "check" : choice.walletType === "PERSONAL" ? "user" : "building"} tone={on ? "green" : choice.walletType === "PERSONAL" ? "violet" : "teal"} size="md" />
              <span><strong>{choice.name}</strong><small>{choice.walletType === "PERSONAL" ? "Personnel" : "Pro"}{choice.subtitle ? ` · ${choice.subtitle}` : ""}</small></span>
            </button>
          )
        })}
      </div>
      {value.length >= max ? <p className="lg-hint">Maximum {max} wallets par envoi.</p> : null}
    </div>
  )
}
