"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { ApiKeyDrawer } from "@/components/admin/apikeys/ApiKeyDrawer"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegPill, LegSocle } from "@/components/ui/legkit"
import { KEY_STATE_LABEL, KEY_STATE_TONE, MODE_LABEL, needsRenewal, sinceLabel, usedWithin } from "@/lib/apiKeyFormat"
import { socleFor } from "@/lib/paymentLinkFormat"
import type { PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type KeyRow = Outputs["admin"]["apiKeys"]["list"][number]

export default function ClesApiPage() {
  const { show } = useToast()
  const [keys, setKeys] = React.useState<KeyRow[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [state, setState] = React.useState("all")
  const [mode, setMode] = React.useState("all")
  const [selected, setSelected] = React.useState<number | null>(null)

  const refetch = React.useCallback(async () => { setKeys(await api.admin.apiKeys.list.query()) }, [])

  React.useEffect(() => {
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
  }, [])
  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les clés d'API.", "error")).finally(() => setLoading(false))
  }, [refetch, show])
  // Lien direct depuis une autre fiche : /cles-api?cle=12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("cle")
    if (param && /^\d+$/.test(param)) setSelected(Number(param))
  }, [])

  const needle = search.trim().toLowerCase()
  const filtered = keys
    .filter((key) => state === "all" || key.state === state)
    .filter((key) => mode === "all" || key.mode === mode)
    .filter((key) => !needle || [key.label, key.keyPrefix, key.business.brandName, key.createdBy, key.lastUsedIp ?? ""].some((value) => value.toLowerCase().includes(needle)))

  const active = keys.filter((key) => key.state === "active").length
  const recent = keys.filter((key) => usedWithin(key, 24)).length
  const renew = keys.filter((key) => needsRenewal(key)).length
  const writers = keys.filter((key) => key.state === "active" && key.scopes.some((scope) => scope.endsWith(":write"))).length
  const current = keys.find((key) => key.id === selected) ?? null

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Développeurs · Wallet Pro</p>
          <h1>Clés d'API</h1>
          <p>Toutes les clés créées par les entreprises pour l'API <span className="lg-mono">/api/v1</span>. Vous ne voyez jamais un secret : seulement son préfixe, ses droits et son usage. Une clé compromise se révoque ici, avec un motif journalisé.</p>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs clés d'API">
        <Kpi tone="violet" icon="key" label="Clés" value={keys.length} detail="Toutes entreprises" onClick={() => { setState("all"); setMode("all") }} />
        <Kpi tone="green" icon="check" label="Actives" value={active} detail={`${recent} utilisée${recent > 1 ? "s" : ""} sur 24 h`} onClick={() => setState("active")} />
        <Kpi tone="amber" icon="pencil" label="Avec écriture" value={writers} detail="Peuvent créer des liens" onClick={() => setState("active")} />
        <Kpi tone="brick" icon="clock" label="À renouveler" value={renew} detail="Expirent sous 14 jours" onClick={() => setState("active")} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Nom, entreprise, préfixe, adresse…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher une clé" />
        </div>
        <select className="lg-input" value={state} onChange={(event) => setState(event.target.value)} aria-label="État de la clé">
          <option value="all">Tous les états</option>
          <option value="active">Actives</option>
          <option value="expired">Expirées</option>
          <option value="revoked">Révoquées</option>
          <option value="legacy">À recréer</option>
        </select>
        <select className="lg-input" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Environnement">
          <option value="all">Test et production</option>
          <option value="sandbox">Test</option>
          <option value="live">Production</option>
        </select>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} clé${filtered.length > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Clés d'API</p><strong>Chargement…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="key" size="lg" tone="platinum" />
          <strong>{keys.length === 0 ? "Aucune clé pour l'instant" : "Aucune clé ne correspond"}</strong>
          <span>{keys.length === 0 ? "Les clés apparaissent ici dès qu'une entreprise en crée une depuis Wallet Pro › Développeurs." : "Modifiez la recherche ou les filtres."}</span>
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="Clés d'API">
          {filtered.map((key, index) => (
            <button key={key.id} type="button" role="listitem" className={`pl-row${key.state === "active" ? "" : " is-off"}`} onClick={() => setSelected(key.id)}>
              <LegSocle icon="key" tone={socleFor(index)} size="md" />
              <span className="pl-row-main"><strong>{key.label}</strong><small>{key.state !== "active" ? `${KEY_STATE_LABEL[key.state]} · ` : ""}{key.business.brandName} · <span className="lg-mono">{key.keyPrefix}…</span></small></span>
              <span className="pl-row-amount">{MODE_LABEL[key.mode]}<small>{key.scopes.length} droit{key.scopes.length > 1 ? "s" : ""}{key.scopes.some((scope) => scope.endsWith(":write")) ? " · écriture" : ""}</small></span>
              <LegPill tone={KEY_STATE_TONE[key.state]} className="lg-pill--status">{KEY_STATE_LABEL[key.state]}</LegPill>
              <span className="pl-row-total pl-row-when">{sinceLabel(key.lastUsedAt)}<small className="lg-mono">{key.lastUsedIp ?? "aucun appel"}</small></span>
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      {me ? <ApiKeyDrawer keyRow={current} me={me} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "amber" | "brick"; icon: "key" | "check" | "pencil" | "clock"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
