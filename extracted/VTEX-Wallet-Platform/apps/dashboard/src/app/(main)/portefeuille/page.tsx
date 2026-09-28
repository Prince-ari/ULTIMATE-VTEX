"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PortfolioDrawer, type WalletRef } from "@/components/admin/managers/PortfolioDrawer"
import { SuggestionDialog } from "@/components/admin/suggestions/SuggestionDialog"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegPill, LegSocle } from "@/components/ui/legkit"
import { WALLET_TYPE_LABEL, activityLabel, walletCountLabel } from "@/lib/managerFormat"
import { formatTotals, money, socleFor, sumByCurrency } from "@/lib/paymentLinkFormat"
import { useSession } from "@/lib/session"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type PortfolioRow = Outputs["admin"]["portfolio"]["list"][number]

const STATUS_LABEL: Record<string, string> = { active: "Actif", suspended: "Suspendu", closed: "Clôturé" }

export default function PortefeuillePage() {
  const { show } = useToast()
  const session = useSession()
  const [rows, setRows] = React.useState<PortfolioRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<WalletRef | null>(null)
  const [composeOpen, setComposeOpen] = React.useState(false)

  const refetch = React.useCallback(async () => { setRows(await api.admin.portfolio.list.query()) }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger votre portefeuille.", "error")).finally(() => setLoading(false))
  }, [refetch, show])

  const needle = search.trim().toLowerCase()
  const filtered = rows.filter((row) => !needle || `${row.name} ${row.subtitle ?? ""}`.toLowerCase().includes(needle))
  const totals = formatTotals(sumByCurrency(rows.flatMap((row) => row.balances.map((balance) => ({ currency: balance.currency, cents: balance.availableCents })))))
  const inactive = rows.filter((row) => row.status !== "active").length

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Gestionnaire de compte</p>
          <h1>{session ? `Bonjour ${session.firstName}` : "Portefeuille"}</h1>
          <p>Les wallets qui vous sont confiés, en lecture seule : soldes, activité récente, et un message en un clic. Vous ne voyez que ces wallets ; toute consultation est journalisée.</p>
        </div>
        <div className="dashboard-header-actions">
          {rows.length > 0 ? <LegButton icon="pencil" onClick={() => setComposeOpen(true)}>Nouvelle suggestion</LegButton> : null}
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs du portefeuille">
        <Kpi tone="violet" icon="wallet" label="Wallets suivis" value={String(rows.length)} detail={walletCountLabel(rows.length)} />
        <Kpi tone="teal" icon="bank" label="Encours" value={totals} detail="Soldes disponibles, par devise" />
        <Kpi tone="green" icon="user" label="Personnels" value={String(rows.filter((row) => row.walletType === "PERSONAL").length)} detail="Particuliers" />
        <Kpi tone="amber" icon="building" label="Pro" value={String(rows.filter((row) => row.walletType === "PROFESSIONAL").length)} detail={inactive > 0 ? `${inactive} à surveiller` : "Entreprises"} />
      </section>

      {rows.length > 0 ? (
        <div className="cards-toolbar">
          <div className="cards-search">
            <LegIcon name="search" className="lg-input-lead" />
            <input type="search" className="lg-input lg-input-icon" placeholder="Nom, e-mail, société…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher dans le portefeuille" />
          </div>
          <span className="cards-count" role="status">{filtered.length} wallet{filtered.length > 1 ? "s" : ""}</span>
        </div>
      ) : null}

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Portefeuille</p><strong>Chargement…</strong></div></section>
      ) : rows.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="wallet" size="lg" tone="platinum" />
          <strong>Aucun wallet ne vous est encore confié</strong>
          <span>Un administrateur vous attribue vos wallets : ils apparaîtront ici dès l'attribution, et vous serez notifié.</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status"><LegSocle icon="search" size="lg" tone="platinum" /><strong>Aucun wallet ne correspond</strong><span>Modifiez la recherche.</span></div>
      ) : (
        <div className="cards-list" role="list" aria-label="Wallets du portefeuille">
          {filtered.map((row, index) => (
            <button key={`${row.walletType}:${row.holderId}`} type="button" role="listitem" className={`pl-row${row.status === "active" ? "" : " is-off"}`} onClick={() => setSelected({ walletType: row.walletType, holderId: row.holderId })}>
              <LegSocle icon={row.walletType === "PERSONAL" ? "user" : "building"} tone={socleFor(index)} size="md" />
              <span className="pl-row-main"><strong>{row.name}</strong><small>{row.status !== "active" ? `${STATUS_LABEL[row.status] ?? row.status} · ` : ""}{WALLET_TYPE_LABEL[row.walletType]}{row.subtitle ? ` · ${row.subtitle}` : ""}</small></span>
              <span className="pl-row-amount">{row.balances.length === 0 ? "—" : row.balances.map((balance) => money(balance.availableCents, balance.currency)).join(" · ")}<small>solde disponible</small></span>
              <LegPill tone={row.status === "active" ? "ok" : "warn"} className="lg-pill--status">{STATUS_LABEL[row.status] ?? row.status}</LegPill>
              <span className="pl-row-total pl-row-when">{row.walletType === "PERSONAL" ? activityLabel(row.lastActiveAt) : "Entreprise"}<small>{row.walletType === "PERSONAL" ? "dernière connexion" : "Wallet Pro"}</small></span>
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      <PortfolioDrawer wallet={selected} onClose={() => setSelected(null)} />
      <SuggestionDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail }: { tone: "violet" | "teal" | "green" | "amber"; icon: "wallet" | "bank" | "user" | "building"; label: string; value: string; detail: string }) {
  return (
    <div className="dashboard-metric-card lg-kpi">
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </div>
  )
}
