"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { DocumentDrawer } from "@/components/admin/documents/DocumentDrawer"
import { SendDocumentDialog } from "@/components/admin/documents/SendDocumentDialog"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegPill, LegSocle } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"
import { CATEGORY_LABEL, documentState, formatSize, socleFor, type DocumentCategory } from "@/lib/documentFormat"
import { WALLET_TYPE_LABEL, activityLabel } from "@/lib/managerFormat"
import { isAdmin } from "@/lib/roles"
import { useSession } from "@/lib/session"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type DocumentRow = Outputs["admin"]["documents"]["list"][number]
type View = "all" | "pending" | "unviewed" | "viewed" | "archived"

const matchesView = (row: DocumentRow, view: View) => {
  const state = documentState(row).key
  switch (view) {
    case "pending": return state === "pending"
    case "unviewed": return state === "sent"
    case "viewed": return state === "viewed"
    case "archived": return state === "archived" || state === "revoked"
    default: return true
  }
}

export default function DocumentsPage() {
  const { show } = useToast()
  const session = useSession()
  const me = session ? { id: session.id, role: session.role } : null
  const canSend = me ? isAdmin(me.role) || me.role === "account_manager" : false
  const [rows, setRows] = React.useState<DocumentRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [view, setView] = React.useState<View>("all")
  const [category, setCategory] = React.useState<"all" | DocumentCategory>("all")
  const [sendOpen, setSendOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<number | null>(null)

  const refetch = React.useCallback(async () => { setRows(await api.admin.documents.list.query({ limit: 1000 })) }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les documents.", "error")).finally(() => setLoading(false))
  }, [refetch, show])

  // Temps réel : un titulaire remet une pièce, ou un document est attribué → la liste se met à jour sans rechargement.
  React.useEffect(() => {
    const stream = new EventSource("/api/events")
    const refresh = () => void refetch().catch(() => undefined)
    stream.addEventListener("transfer_proof.submitted", refresh)
    stream.addEventListener("document.assigned", refresh)
    return () => stream.close()
  }, [refetch])

  // Lien direct depuis une autre fiche : /documents?document=12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("document")
    if (param && /^\d+$/.test(param)) setSelected(Number(param))
  }, [])

  const needle = search.trim().toLowerCase()
  const filtered = rows
    .filter((row) => matchesView(row, view))
    .filter((row) => category === "all" || row.category === category)
    .filter((row) => !needle || [row.title, row.fileName, row.note ?? "", row.holder?.name ?? "", row.recipient.name, row.sender?.name ?? "", row.transactionReference ?? ""].some((value) => value.toLowerCase().includes(needle)))

  const available = rows.filter((row) => row.status === "active").length
  const pending = rows.filter((row) => matchesView(row, "pending")).length
  const unviewed = rows.filter((row) => matchesView(row, "unviewed")).length
  const touched = new Set(rows.map((row) => `${row.walletType}:${row.holderId}`)).size
  const isManager = me?.role === "account_manager"

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">{isManager ? "Portefeuille · Documents" : "Support · Documents"}</p>
          <h1>Documents</h1>
          <p>{isManager
            ? "Envoyez des documents aux wallets de votre portefeuille et suivez leur consultation. Chaque envoi est journalisé."
            : "Documents envoyés aux wallets et pièces remises par les titulaires. Le fichier reste privé : il ne s'ouvre qu'avec un droit, chaque ouverture est journalisée."}</p>
        </div>
        <div className="dashboard-header-actions">
          {canSend ? <LegButton icon="upload" onClick={() => setSendOpen(true)}>Envoyer un document</LegButton> : null}
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs documents">
        <Kpi tone="violet" icon="file" label="Disponibles" value={available} detail="Visibles par les titulaires" onClick={() => setView("all")} />
        <Kpi tone="amber" icon="clock" label="À examiner" value={pending} detail="Pièces remises par les titulaires" onClick={() => setView("pending")} />
        <Kpi tone="teal" icon="eye-off" label="Non ouverts" value={unviewed} detail="Envoyés, pas encore consultés" onClick={() => setView("unviewed")} />
        <Kpi tone="green" icon="wallet" label="Wallets concernés" value={touched} detail="Distincts" onClick={() => setView("all")} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Titre, fichier, wallet, destinataire…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un document" />
        </div>
        <div className="lg-seg lg-seg--scroll" role="group" aria-label="État du document">
          {([["all", "Tous"], ["pending", "À examiner"], ["unviewed", "Non ouverts"], ["viewed", "Ouverts"], ["archived", "Archivés"]] as Array<[View, string]>).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <select className="lg-input" value={category} onChange={(event) => setCategory(event.target.value as "all" | DocumentCategory)} aria-label="Catégorie">
          <option value="all">Toutes les catégories</option>
          {(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
        </select>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} document${filtered.length > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Documents</p><strong>Chargement…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="file" size="lg" tone="platinum" />
          <strong>{rows.length === 0 ? (isManager ? "Aucun document dans votre portefeuille" : "Aucun document pour l'instant") : "Aucun document ne correspond"}</strong>
          <span>{rows.length === 0 ? (canSend ? "Envoyez un premier document : il apparaît dans « Documents » du wallet choisi." : "Les documents envoyés et les pièces remises par les titulaires apparaissent ici.") : "Modifiez la recherche ou les filtres."}</span>
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="Documents">
          {filtered.map((row, index) => {
            const state = documentState(row)
            const off = state.key === "archived" || state.key === "revoked"
            return (
              <button key={row.id} type="button" role="listitem" className={off ? "pl-row is-off" : "pl-row"} onClick={() => setSelected(row.id)}>
                <LegSocle icon="file" tone={socleFor(index)} size="md" />
                <span className="pl-row-main"><strong>{row.title}</strong><small>{state.label} · {CATEGORY_LABEL[row.category]} · {row.holder?.name ?? row.recipient.name}{row.holder && row.recipient.name !== row.holder.name ? ` → ${row.recipient.name}` : ""}</small></span>
                <span className="pl-row-amount">{formatSize(row.sizeBytes)}<small>{row.mimeType === "application/pdf" ? "PDF" : "Image"}{row.walletType ? ` · ${WALLET_TYPE_LABEL[row.walletType]}` : ""}</small></span>
                <LegPill tone={state.pill} icon={state.icon} className="lg-pill--status">{state.label}</LegPill>
                <span className="pl-row-total pl-row-when" title={formatDateTime(row.createdAt)}>{activityLabel(row.createdAt)}<small>{row.sender?.name ?? "—"}</small></span>
                <LegIcon name="chevron" className="cards-row-chevron" />
              </button>
            )
          })}
        </div>
      )}

      {canSend ? <SendDocumentDialog open={sendOpen} onOpenChange={setSendOpen} onSent={() => refetch().catch(() => undefined)} /> : null}
      {me ? <DocumentDrawer documentId={selected} me={me} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "amber" | "teal"; icon: "file" | "clock" | "eye-off" | "wallet"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
