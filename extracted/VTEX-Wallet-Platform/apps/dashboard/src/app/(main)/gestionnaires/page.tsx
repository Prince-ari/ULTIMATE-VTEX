"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { ManagerDrawer } from "@/components/admin/managers/ManagerDrawer"
import { NewManagerDialog } from "@/components/admin/managers/NewManagerDialog"
import { useToast } from "@/components/admin/Toast"
import { TemporaryPasswordDialog } from "@/components/admin/users/TemporaryPasswordDialog"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegPill, LegSocle } from "@/components/ui/legkit"
import { MANAGER_ROLE_LABEL, MANAGER_STATUS_LABEL, MANAGER_STATUS_TONE, activityLabel, walletCountLabel } from "@/lib/managerFormat"
import { socleFor } from "@/lib/paymentLinkFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type ManagerRow = Outputs["admin"]["managers"]["list"][number]

export default function GestionnairesPage() {
  const { show } = useToast()
  const [managers, setManagers] = React.useState<ManagerRow[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [role, setRole] = React.useState("all")
  const [status, setStatus] = React.useState("all")
  const [selected, setSelected] = React.useState<number | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [temporary, setTemporary] = React.useState<{ email: string; password: string; expiresAt: Date } | null>(null)

  const refetch = React.useCallback(async () => { setManagers(await api.admin.managers.list.query()) }, [])

  React.useEffect(() => {
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
  }, [])
  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les gestionnaires.", "error")).finally(() => setLoading(false))
  }, [refetch, show])
  // Lien direct depuis une autre fiche : /gestionnaires?gestionnaire=12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("gestionnaire")
    if (param && /^\d+$/.test(param)) setSelected(Number(param))
  }, [])

  const needle = search.trim().toLowerCase()
  const filtered = managers
    .filter((manager) => role === "all" || manager.role === role)
    .filter((manager) => status === "all" || manager.status === status)
    .filter((manager) => !needle || [manager.name, manager.email, ...manager.wallets.map((wallet) => wallet.name)].some((value) => value.toLowerCase().includes(needle)))

  const active = managers.filter((manager) => manager.status === "active").length
  const followed = managers.reduce((sum, manager) => sum + manager.walletCount, 0)
  const idle = managers.filter((manager) => manager.status === "active" && manager.walletCount === 0).length
  const canManage = isAdmin(me?.role)

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Support · Équipe</p>
          <h1>Gestionnaires</h1>
          <p>Le support et les gestionnaires de compte, et les wallets confiés à chacun. Un gestionnaire de compte ne voit que son portefeuille ; chaque attribution et chaque retrait est journalisé sur le wallet concerné.</p>
        </div>
        <div className="dashboard-header-actions">
          {canManage ? <LegButton icon="plus" onClick={() => setCreateOpen(true)}>Nouveau gestionnaire</LegButton> : null}
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs gestionnaires">
        <Kpi tone="violet" icon="user" label="Gestionnaires" value={managers.length} detail="Support et gestionnaires de compte" onClick={() => { setRole("all"); setStatus("all") }} />
        <Kpi tone="green" icon="check" label="Actifs" value={active} detail="Peuvent se connecter" onClick={() => setStatus("active")} />
        <Kpi tone="teal" icon="wallet" label="Wallets suivis" value={followed} detail="Attributions en cours" onClick={() => setStatus("all")} />
        <Kpi tone="amber" icon="alert" label="Sans wallet" value={idle} detail="Actifs, rien à suivre" onClick={() => setStatus("active")} />
      </section>

      <div className="cards-toolbar">
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder="Nom, e-mail, wallet suivi…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un gestionnaire" />
        </div>
        <select className="lg-input" value={role} onChange={(event) => setRole(event.target.value)} aria-label="Rôle">
          <option value="all">Tous les rôles</option>
          <option value="account_manager">Gestionnaires de compte</option>
          <option value="agent">Support</option>
        </select>
        <select className="lg-input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Statut">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
        </select>
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${filtered.length} gestionnaire${filtered.length > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Gestionnaires</p><strong>Chargement…</strong></div></section>
      ) : filtered.length === 0 ? (
        <div className="cards-empty" role="status">
          <LegSocle icon="user" size="lg" tone="platinum" />
          <strong>{managers.length === 0 ? "Aucun gestionnaire pour l'instant" : "Aucun gestionnaire ne correspond"}</strong>
          <span>{managers.length === 0 ? "Créez un compte de support ou de gestionnaire de compte, puis confiez-lui des wallets." : "Modifiez la recherche ou les filtres."}</span>
        </div>
      ) : (
        <div className="cards-list" role="list" aria-label="Gestionnaires">
          {filtered.map((manager, index) => (
            <button key={manager.id} type="button" role="listitem" className={`pl-row${manager.status === "active" ? "" : " is-off"}`} onClick={() => setSelected(manager.id)}>
              <LegSocle icon={manager.role === "agent" ? "shield" : "user"} tone={socleFor(index)} size="md" />
              <span className="pl-row-main"><strong>{manager.name}</strong><small>{manager.status !== "active" ? "Suspendu · " : ""}{manager.email}</small></span>
              <span className="pl-row-amount">{MANAGER_ROLE_LABEL[manager.role]}<small>{walletCountLabel(manager.walletCount)}{manager.wallets.length > 0 ? ` · ${manager.wallets.map((wallet) => wallet.name).slice(0, 2).join(", ")}${manager.walletCount > 2 ? "…" : ""}` : ""}</small></span>
              <LegPill tone={MANAGER_STATUS_TONE[manager.status as "active" | "suspended"] ?? "neutral"} className="lg-pill--status">{MANAGER_STATUS_LABEL[manager.status as "active" | "suspended"] ?? manager.status}</LegPill>
              <span className="pl-row-total pl-row-when">{activityLabel(manager.lastActiveAt)}<small>dernière connexion</small></span>
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      {me ? <ManagerDrawer managerId={selected} me={me} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
      {canManage ? (
        <NewManagerDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={async (created, email) => {
            await refetch().catch(() => undefined)
            setTemporary({ email, password: created.temporaryPassword, expiresAt: created.expiresAt })
            setSelected(created.id)
            show("Gestionnaire créé et journalisé.")
          }}
        />
      ) : null}
      {temporary ? <TemporaryPasswordDialog open onClose={() => setTemporary(null)} title="Compte créé" email={temporary.email} password={temporary.password} expiresAt={temporary.expiresAt} /> : null}
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "teal" | "amber"; icon: "user" | "check" | "wallet" | "alert"; label: string; value: number; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
