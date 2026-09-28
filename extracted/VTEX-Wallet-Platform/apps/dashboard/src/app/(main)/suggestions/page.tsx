"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { SuggestionDialog } from "@/components/admin/suggestions/SuggestionDialog"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegModal, LegPill, LegRow, LegSocle } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"
import { MANAGER_ROLE_LABEL, SUGGESTION_STATE_LABEL, SUGGESTION_STATE_TONE, WALLET_TYPE_LABEL, activityLabel } from "@/lib/managerFormat"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type SuggestionRow = Outputs["admin"]["suggestions"]["list"][number]

export default function SuggestionsPage() {
  const { show } = useToast()
  const [rows, setRows] = React.useState<SuggestionRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [state, setState] = React.useState<"all" | "read" | "unread">("all")
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [opened, setOpened] = React.useState<SuggestionRow | null>(null)

  const refetch = React.useCallback(async () => { setRows(await api.admin.suggestions.list.query()) }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les suggestions.", "error")).finally(() => setLoading(false))
  }, [refetch, show])

  const needle = search.trim().toLowerCase()
  const filtered = rows
    .filter((row) => state === "all" || (state === "read") === row.read)
    .filter((row) => !needle || [row.title, row.body, row.holder?.name ?? "", row.recipient?.name ?? "", row.sender?.name ?? ""].some((value) => value.toLowerCase().includes(needle)))

  const read = rows.filter((row) => row.read).length
  const wallets = new Set(rows.map((row) => `${row.walletType}:${row.holderId}`)).size

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Support · Messages</p>
          <h1>Suggestions</h1>
          <p>Écrivez à un ou plusieurs wallets : le message arrive dans « Notifications / Suggestions » du titulaire (ou des propriétaires d'une entreprise), avec votre prénom et votre rôle. Vous voyez ici s'il a été lu.</p>
        </div>
        <div className="dashboard-header-actions">
          <LegButton icon="plus" onClick={() => setComposeOpen(true)}>Nouvelle suggestion</LegButton>
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs suggestions">
        <Kpi tone="violet" icon="pencil" label="Envoyées" value={rows.length} detail="Remises aux destinataires" onClick={() => setState("all")} />
        <Kpi tone="green" icon="check" label="Lues" value={read} detail="Ouvertes par le destinataire" onClick={() => setState("read")} />
        <Kpi tone="amber" icon="clock" label="Non lues" value={rows.length - read} detail="En attente de lecture" onClick={() => setState("unread")} />
        <Kpi tone="teal" icon="wallet" label="Wallets touchés" value={wallets} detail="Distincts" onClick={() => setState("all")} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Titre, message, wallet, destinataire…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher une suggestion" />
        </div>
        <div className="lg-seg" role="group" aria-label="État de lecture">
          <button type="button" aria-pressed={state === "all"} onClick={() => setState("all")}>Toutes</button>
          <button type="button" aria-pressed={state === "unread"} onClick={() => setState("unread")}>Non lues</button>
          <button type="button" aria-pressed={state === "read"} onClick={() => setState("read")}>Lues</button>
        </div>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} suggestion${filtered.length > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Suggestions</p><strong>Chargement…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="pencil" size="lg" tone="platinum" />
          <strong>{rows.length === 0 ? "Aucune suggestion envoyée" : "Aucune suggestion ne correspond"}</strong>
          <span>{rows.length === 0 ? "Choisissez un ou plusieurs wallets et écrivez un message : il arrive dans leurs notifications." : "Modifiez la recherche ou le filtre."}</span>
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="Suggestions envoyées">
          {filtered.map((row) => (
            <button key={row.id} type="button" role="listitem" className="pl-row" onClick={() => setOpened(row)}>
              <LegSocle icon={row.read ? "check" : "pencil"} tone={row.read ? "green" : "amber"} size="md" />
              <span className="pl-row-main"><strong>{row.title}</strong><small>{row.holder?.name ?? "Wallet"}{row.recipient ? ` → ${row.recipient.name}` : ""} · {row.body}</small></span>
              <span className="pl-row-amount">{row.sender?.name ?? "—"}<small>{row.sender ? (MANAGER_ROLE_LABEL[row.sender.role as keyof typeof MANAGER_ROLE_LABEL] ?? "Administration") : ""}</small></span>
              <LegPill tone={SUGGESTION_STATE_TONE[row.read ? "read" : "unread"]} className="lg-pill--status">{SUGGESTION_STATE_LABEL[row.read ? "read" : "unread"]}</LegPill>
              <span className="pl-row-total pl-row-when">{activityLabel(row.createdAt)}<small>{row.walletType ? WALLET_TYPE_LABEL[row.walletType] : ""}</small></span>
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      <SuggestionDialog open={composeOpen} onOpenChange={setComposeOpen} onSent={() => refetch().catch(() => undefined)} />

      <LegModal
        open={opened !== null}
        onOpenChange={(open) => { if (!open) setOpened(null) }}
        icon="pencil"
        tone={opened?.read ? "green" : "amber"}
        title={opened?.title ?? "Suggestion"}
        description={opened?.body}
        footer={<LegButton onClick={() => setOpened(null)}>Fermer</LegButton>}
      >
        {opened ? (
          <div className="lg-panel">
            <LegRow label="Wallet" value={`${opened.holder?.name ?? "—"}${opened.walletType ? ` · ${WALLET_TYPE_LABEL[opened.walletType]}` : ""}`} />
            <LegRow label="Destinataire" value={opened.recipient?.name ?? "—"} />
            <LegRow label="Envoyée par" value={opened.sender ? `${opened.sender.name} · ${MANAGER_ROLE_LABEL[opened.sender.role as keyof typeof MANAGER_ROLE_LABEL] ?? "Administration"}` : "—"} />
            <LegRow label="Envoyée le" value={formatDateTime(opened.createdAt)} />
            <LegRow label="Lecture" value={opened.readAt ? `Lue le ${formatDateTime(opened.readAt)}` : "Pas encore lue"} />
          </div>
        ) : null}
      </LegModal>
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "amber" | "teal"; icon: "pencil" | "check" | "clock" | "wallet"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
