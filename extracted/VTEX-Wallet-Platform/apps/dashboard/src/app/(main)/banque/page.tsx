"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { BankAccountDialog } from "@/components/admin/banking/BankAccountDialog"
import { BankAccountDrawer } from "@/components/admin/banking/BankAccountDrawer"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegPill, LegSocle } from "@/components/ui/legkit"
import { KIND_LABEL, STATUS_LABEL_BANK, toneForCurrency } from "@/lib/bankFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { cx } from "@/lib/utils"

type Outputs = inferRouterOutputs<AppRouter>
type BankRow = Outputs["admin"]["banking"]["list"][number]

export default function BanquePage() {
  const { show } = useToast()
  const [rows, setRows] = React.useState<BankRow[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [kind, setKind] = React.useState<"all" | "MAIN" | "SUB">("all")
  const [status, setStatus] = React.useState("all")
  const [assignment, setAssignment] = React.useState<"all" | "assigned" | "unassigned">("all")
  const [walletType, setWalletType] = React.useState<"all" | "PERSONAL" | "PROFESSIONAL">("all")
  const [selected, setSelected] = React.useState<number | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const refetch = React.useCallback(async () => { setRows(await api.admin.banking.list.query()) }, [])

  React.useEffect(() => {
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
  }, [])
  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les RIB.", "error")).finally(() => setLoading(false))
  }, [refetch, show])
  // Lien direct : /banque?rib=12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("rib")
    if (param && /^\d+$/.test(param)) setSelected(Number(param))
  }, [])

  const needle = search.trim().toLowerCase()
  const filtered = rows
    .filter((row) => kind === "all" || row.kind === kind)
    .filter((row) => status === "all" || row.status === status)
    .filter((row) => walletType === "all" || row.walletType === walletType)
    .filter((row) => assignment === "all" || (assignment === "assigned" ? row.holderId !== null : row.holderId === null))
    .filter((row) => !needle || [row.label, row.accountHolderName, row.bankName, row.ibanLast4, row.holder?.name ?? "", row.holder?.subtitle ?? "", row.ledger?.label ?? ""].some((value) => value.toLowerCase().includes(needle)))

  const mains = rows.filter((row) => row.kind === "MAIN" && row.status === "active").length
  const subs = rows.filter((row) => row.kind === "SUB" && row.status === "active").length
  const stock = rows.filter((row) => row.kind === "SUB" && row.status === "active" && row.holderId === null).length
  const disabled = rows.filter((row) => row.status === "disabled").length
  const canManage = isAdmin(me?.role)

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Wallet · Wallet Pro</p>
          <h1>Banque</h1>
          <p>RIB principaux et sous-RIB (IBAN virtuels) de la plateforme. L'IBAN est chiffré au repos et masqué par défaut ; l'afficher, l'attribuer ou le modifier est journalisé.</p>
        </div>
        <div className="dashboard-header-actions">
          {canManage ? <LegButton icon="plus" onClick={() => setCreateOpen(true)}>Nouveau RIB</LegButton> : null}
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs bancaires">
        <Kpi tone="violet" icon="bank" label="RIB principaux" value={mains} detail="Un par compte" onClick={() => { setKind("MAIN"); setStatus("active"); setAssignment("all") }} />
        <Kpi tone="teal" icon="hash" label="Sous-RIB" value={subs} detail="IBAN virtuels actifs" onClick={() => { setKind("SUB"); setStatus("active"); setAssignment("all") }} />
        <Kpi tone="amber" icon="link" label="Au stock" value={stock} detail="Sous-RIB non attribués" onClick={() => { setKind("SUB"); setStatus("active"); setAssignment("unassigned") }} />
        <Kpi tone="brick" icon="lock" label="Désactivés" value={disabled} detail="Conservés dans l'historique" onClick={() => { setKind("all"); setStatus("disabled"); setAssignment("all") }} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Titulaire, libellé, 4 derniers, IBAN complet…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un RIB" />
        </div>
        <div className="lg-seg" role="group" aria-label="Type de RIB">
          <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")}>Tous</button>
          <button type="button" aria-pressed={kind === "MAIN"} onClick={() => setKind("MAIN")}>Principaux</button>
          <button type="button" aria-pressed={kind === "SUB"} onClick={() => setKind("SUB")}>Sous-RIB</button>
        </div>
        <select className="lg-input" value={walletType} onChange={(event) => setWalletType(event.target.value as typeof walletType)} aria-label="Type de wallet">
          <option value="all">Tous les wallets</option>
          <option value="PERSONAL">Personnels</option>
          <option value="PROFESSIONAL">Professionnels</option>
        </select>
        <select className="lg-input" value={assignment} onChange={(event) => setAssignment(event.target.value as typeof assignment)} aria-label="Attribution">
          <option value="all">Attribués ou non</option>
          <option value="assigned">Attribués</option>
          <option value="unassigned">Au stock</option>
        </select>
        <select className="lg-input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Statut">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="disabled">Désactivés</option>
        </select>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} RIB`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Banque</p><strong>Chargement des RIB…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="bank" size="lg" tone="platinum" />
          <strong>{rows.length === 0 ? "Aucun RIB pour l'instant" : "Aucun RIB ne correspond"}</strong>
          <span>{rows.length === 0 ? "Créez un RIB principal ou un sous-RIB, ou lancez le rattrapage des coordonnées existantes." : "Modifiez la recherche ou les filtres."}</span>
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="RIB">
          {filtered.map((row) => (
            <button key={row.id} type="button" role="listitem" className={cx("bank-row", row.status === "disabled" && "is-disabled")} onClick={() => setSelected(row.id)}>
              <LegSocle icon={row.kind === "MAIN" ? "bank" : "hash"} tone={row.kind === "MAIN" ? "navy" : toneForCurrency(row.currency)} size="md" />
              <span className="bank-row-main"><strong>{row.label}</strong><small>{row.holder ? `${row.holder.name} · ${row.ledger?.label ?? ""}` : "Non attribué — au stock"}</small></span>
              <span className="bank-row-iban">{row.ibanMasked}<small>{KIND_LABEL[row.kind]} · {row.currency}{row.bic ? ` · ${row.bic}` : ""}</small></span>
              <LegPill tone={row.status === "active" ? "ok" : "danger"} className="lg-pill--status">{STATUS_LABEL_BANK[row.status]}</LegPill>
              {row.holder ? <LegPill tone="neutral" icon={row.walletType === "PERSONAL" ? "user" : "building"}>{row.walletType === "PERSONAL" ? "Personnel" : "Pro"}</LegPill> : <LegPill tone="warn" icon="hash">Au stock</LegPill>}
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      {me ? <BankAccountDrawer bankId={selected} me={me} onNavigate={setSelected} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
      {canManage ? <BankAccountDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={async (created) => { await refetch().catch(() => undefined); setSelected(created.account.id); show("RIB créé et journalisé.") }} /> : null}
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "teal" | "amber" | "brick"; icon: "bank" | "hash" | "link" | "lock"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
