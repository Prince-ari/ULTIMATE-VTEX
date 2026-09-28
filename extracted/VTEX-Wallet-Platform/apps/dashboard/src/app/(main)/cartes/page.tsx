"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { CardFace } from "@/components/admin/cards/CardFace"
import { CardVaultDrawer, type CardTarget } from "@/components/admin/cards/CardVaultDrawer"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegPill, LegSocle } from "@/components/ui/legkit"
import { NETWORK_LABEL, formatExpiry, maskedPan, themeFor } from "@/lib/cardFormat"
import type { PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { cx } from "@/lib/utils"

type Outputs = inferRouterOutputs<AppRouter>
type CardRow = Outputs["admin"]["cards"]["list"][number]
type View = "gallery" | "list"

const STATUS_LABEL = { active: "Active", frozen: "Gelée", expired: "Expirée", cancelled: "Annulée" } as const
const STATUS_TONE = { active: "ok", frozen: "warn", expired: "neutral", cancelled: "danger" } as const
const VIEW_KEY = "vtex.cards.view"

function expiryOf(card: CardRow) {
  const date = new Date(card.expiresAt)
  return formatExpiry(date.getUTCMonth() + 1, date.getUTCFullYear())
}

const kindOf = (card: CardRow) => (card.walletType === "PERSONAL" ? "Carte personnelle" : "Carte entreprise")
const keyOf = (card: CardRow) => `${card.walletType}:${card.id}`

export default function CartesPage() {
  const { show } = useToast()
  const [cards, setCards] = React.useState<CardRow[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [type, setType] = React.useState<"all" | "PERSONAL" | "PROFESSIONAL">("all")
  const [status, setStatus] = React.useState("all")
  const [vault, setVault] = React.useState<"all" | "filled" | "empty">("all")
  const [view, setView] = React.useState<View>("gallery")
  const [selected, setSelected] = React.useState<CardTarget | null>(null)

  const refetch = React.useCallback(async () => { setCards(await api.admin.cards.list.query()) }, [])

  React.useEffect(() => {
    try { const saved = window.localStorage.getItem(VIEW_KEY); if (saved === "list" || saved === "gallery") setView(saved) } catch { /* stockage indisponible : la vue par défaut convient */ }
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
  }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les cartes.", "error")).finally(() => setLoading(false))
  }, [refetch, show])

  // Lien direct depuis une autre fiche : /cartes?card=PERSONAL-12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("card")
    const match = param?.match(/^(PERSONAL|PROFESSIONAL)-(\d+)$/)
    if (match) setSelected({ walletType: match[1] as CardTarget["walletType"], cardId: Number(match[2]) })
  }, [])

  function chooseView(next: View) {
    setView(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch { /* préférence non conservée : sans conséquence */ }
  }

  const needle = search.trim().toLowerCase()
  const filtered = cards
    .filter((card) => type === "all" || card.walletType === type)
    .filter((card) => status === "all" || card.status === status)
    .filter((card) => vault === "all" || (vault === "filled" ? card.vault.hasPan : !card.vault.hasPan))
    .filter((card) => !needle || [card.holder.name, card.holder.email ?? "", card.label, card.lastFour, card.cardholderName, card.assignee?.name ?? ""].some((value) => value.toLowerCase().includes(needle)))

  const active = cards.filter((card) => card.status === "active").length
  const filled = cards.filter((card) => card.vault.hasPan).length
  const toFill = cards.filter((card) => card.status !== "cancelled" && !card.vault.hasPan).length

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Wallet · Wallet Pro</p>
          <h1>Cartes</h1>
          <p>Toutes les cartes de la plateforme au même endroit. Les données de carte saisies par l'administration sont chiffrées, masquées par défaut et chaque affichage est journalisé.</p>
        </div>
        <div className="dashboard-header-actions">
          <div className="lg-seg" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={view === "gallery"} onClick={() => chooseView("gallery")}><LegIcon name="grid" />Galerie</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")}><LegIcon name="list" />Liste</button>
          </div>
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs cartes">
        <Kpi tone="violet" icon="card" label="Cartes" value={cards.length} detail="Wallet et Wallet Pro" onClick={() => { setStatus("all"); setVault("all"); setType("all") }} />
        <Kpi tone="green" icon="check" label="Actives" value={active} detail="Utilisables aujourd'hui" onClick={() => setStatus("active")} />
        <Kpi tone="teal" icon="lock" label="Données saisies" value={filled} detail="Numéro chiffré dans le coffre" onClick={() => setVault("filled")} />
        <Kpi tone="amber" icon="pencil" label="À renseigner" value={toFill} detail="Aucune donnée dans le coffre" onClick={() => setVault("empty")} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Titulaire, e-mail, libellé, 4 derniers chiffres…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher une carte" />
        </div>
        <div className="lg-seg" role="group" aria-label="Type de wallet">
          <button type="button" aria-pressed={type === "all"} onClick={() => setType("all")}>Toutes</button>
          <button type="button" aria-pressed={type === "PERSONAL"} onClick={() => setType("PERSONAL")}>Personnelles</button>
          <button type="button" aria-pressed={type === "PROFESSIONAL"} onClick={() => setType("PROFESSIONAL")}>Pro</button>
        </div>
        <select className="lg-input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut">
          <option value="all">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="frozen">Gelées</option>
          <option value="expired">Expirées</option>
          <option value="cancelled">Annulées</option>
        </select>
        <select className="lg-input" value={vault} onChange={(event) => setVault(event.target.value as typeof vault)} aria-label="Filtrer par coffre">
          <option value="all">Coffre : tous</option>
          <option value="filled">Données saisies</option>
          <option value="empty">À renseigner</option>
        </select>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} carte${filtered.length > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Cartes</p><strong>Chargement des cartes…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="card" size="lg" tone="platinum" />
          <strong>{cards.length === 0 ? "Aucune carte pour l'instant" : "Aucune carte ne correspond"}</strong>
          <span>{cards.length === 0 ? "Les cartes apparaissent ici dès qu'un wallet est ouvert." : "Modifiez la recherche ou les filtres."}</span>
        </div>
      ) : view === "gallery" ? (
        <div className="cards-gallery">
          {filtered.map((card) => (
            <button key={keyOf(card)} type="button" className="cards-tile" onClick={() => setSelected({ walletType: card.walletType, cardId: card.id })} aria-label={`Ouvrir la carte de ${card.holder.name}, se terminant par ${card.lastFour}`}>
              <CardFace theme={themeFor(card)} network={card.network} kind={kindOf(card)} lastFour={card.lastFour} holder={card.cardholderName} expiry={expiryOf(card)} status={card.status} />
              <span className="cards-tile-cap">
                <span><strong>{card.holder.name}</strong><small>{card.label} · {card.currency}</small></span>
                {card.vault.hasPan ? <LegPill tone="ok" icon="lock">Coffre rempli</LegPill> : <LegPill tone="warn" icon="pencil">À renseigner</LegPill>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="Cartes">
          {filtered.map((card) => (
            <button key={keyOf(card)} type="button" role="listitem" className="cards-row" onClick={() => setSelected({ walletType: card.walletType, cardId: card.id })}>
              <span className={cx("cards-swatch", card.theme === "teal" && "cards-swatch--teal", card.theme === "brick" && "cards-swatch--brick")} aria-hidden="true" />
              <span className="cards-row-main"><strong>{card.holder.name}</strong><small>{card.label} · {card.currency} · {kindOf(card)}</small></span>
              <span className="cards-row-num">{maskedPan(card.lastFour).slice(-9)}<small>{NETWORK_LABEL[card.network]} · exp. {expiryOf(card)}</small></span>
              <LegPill tone={STATUS_TONE[card.status]} className="lg-pill--status">{STATUS_LABEL[card.status]}</LegPill>
              {card.vault.hasPan ? <LegPill tone="ok" icon="lock">Coffre rempli</LegPill> : <LegPill tone="warn" icon="pencil">À renseigner</LegPill>}
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      {me ? <CardVaultDrawer target={selected} me={me} onNavigate={setSelected} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "teal" | "amber"; icon: "card" | "check" | "lock" | "pencil"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
