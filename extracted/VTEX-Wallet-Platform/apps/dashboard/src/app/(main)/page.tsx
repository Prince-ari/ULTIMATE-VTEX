"use client"

import * as React from "react"
import Link from "next/link"
import { ChartBar, Headset, BellRinging, ArrowsClockwise, GearSix, UserPlus, User } from "@phosphor-icons/react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { useToast } from "@/components/admin/Toast"
import { formatDateTime } from "@/lib/adminFormat"
import { api } from "@/lib/trpc"
import { siteConfig } from "../siteConfig"

type Outputs = inferRouterOutputs<AppRouter>
type ActivityItem = { id: string; label: string; date: string; href: string; tone: "violet" | "green" | "amber" }

export default function Accueil() {
  const { show } = useToast()
  const [users, setUsers] = React.useState<Outputs["users"]["list"]>([])
  const [tickets, setTickets] = React.useState<Outputs["support"]["list"]>([])
  const [leads, setLeads] = React.useState<Outputs["leads"]["list"]>([])
  const [funnel, setFunnel] = React.useState<Outputs["analytics"]["leadsFunnel"]>([])
  const [walletKpis, setWalletKpis] = React.useState<Outputs["walletAdmin"]["kpis"] | null>(null)
  const [activity, setActivity] = React.useState<ActivityItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [usersResult, ticketsResult, leadsResult, notificationsResult, funnelResult, walletKpisResult] = await Promise.allSettled([
        api.users.list.query(),
        api.support.list.query(),
        api.leads.list.query(),
        api.notifications.list.query(),
        api.analytics.leadsFunnel.query(),
        api.walletAdmin.kpis.query(),
      ])
      const nextUsers = usersResult.status === "fulfilled" ? usersResult.value : []
      const nextTickets = ticketsResult.status === "fulfilled" ? ticketsResult.value : []
      const nextLeads = leadsResult.status === "fulfilled" ? leadsResult.value : []
      const nextNotifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : []
      const nextFunnel = funnelResult.status === "fulfilled" ? funnelResult.value : []
      const nextWalletKpis = walletKpisResult.status === "fulfilled" ? walletKpisResult.value : null
      const unavailableSources = [usersResult, ticketsResult, leadsResult, notificationsResult, funnelResult, walletKpisResult].filter((result) => result.status === "rejected").length
      setUsers(nextUsers)
      setTickets(nextTickets)
      setLeads(nextLeads)
      setFunnel(nextFunnel)
      setWalletKpis(nextWalletKpis)
      if (unavailableSources > 0) {
        setLoadError(`${unavailableSources} source${unavailableSources > 1 ? "s" : ""} de données est temporairement indisponible.`)
        show("Certaines données du centre de pilotage sont temporairement indisponibles.", "error")
      }
      setActivity([
        ...nextLeads.slice(0, 4).map((item) => ({ id: `lead-${item.id}`, label: `Lead · ${item.firstName} ${item.lastName}`, date: String(item.createdAt), href: siteConfig.baseLinks.leads, tone: "violet" as const })),
        ...nextTickets.slice(0, 3).map((item) => ({ id: `ticket-${item.id}`, label: `Support · ${item.subject}`, date: String(item.createdAt), href: siteConfig.baseLinks.support, tone: "amber" as const })),
        ...nextNotifications.slice(0, 3).map((item) => ({ id: `notification-${item.id}`, label: `Notification · ${item.title}`, date: String(item.createdAt), href: siteConfig.baseLinks.notifications, tone: "green" as const })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8))
    } catch (error) {
      setLoadError("Le centre de pilotage ne peut pas être mis à jour pour le moment.")
      show(error instanceof Error ? error.message : "Impossible de charger le centre de pilotage.", "error")
    } finally {
      setLoading(false)
    }
  }, [show])

  React.useEffect(() => { void loadDashboard() }, [loadDashboard])

  const activeUsers = users.filter((user) => user.status === "active").length
  const openTickets = tickets.filter((ticket) => ticket.status !== "resolved").length
  const newLeads = leads.filter((lead) => lead.status === "new").length

  if (loading) return <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Centre de pilotage</p><strong>Chargement des données opérateur…</strong><p>Les modules s’afficheront dès que leurs sources seront disponibles.</p></div></section>

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">VTEX · Dashboard</p>
          <h1>Centre de pilotage</h1>
          <p>Une lecture compacte de l’identité, des opérations Wallet, du support et des services transversaux.</p>
        </div>
        <div className="dashboard-header-actions">
          <span className={`dashboard-sync-state ${loadError ? "is-degraded" : ""}`}><i />{loadError ? "Synchronisation partielle" : "Données à jour"}</span>
          <button className="dashboard-icon-button" onClick={() => void loadDashboard()} aria-label="Rafraîchir" title="Rafraîchir"><ArrowsClockwise /></button>
          <Link href={siteConfig.baseLinks.settings} className="dashboard-icon-button" aria-label="Paramètres"><GearSix /></Link>
        </div>
      </header>

      {loadError ? <section className="dashboard-page-state dashboard-page-state--warning" role="status" aria-live="polite"><div><strong>Lecture partielle des données</strong><p>{loadError} Les autres modules restent visibles ; aucune action n’est relancée automatiquement.</p></div><button type="button" onClick={() => void loadDashboard()}>Réessayer la synchronisation</button></section> : null}

      <section className="dashboard-hero-strip">
        <div><span>Cadence de travail</span><strong><i /> Services transversaux disponibles</strong></div>
        <div><span>File de traitement</span><strong>{newLeads + openTickets} élément{newLeads + openTickets > 1 ? "s" : ""} à suivre</strong></div>
        <Link href={siteConfig.baseLinks.analytics}>Ouvrir l’analyse <b>→</b></Link>
      </section>

      {/* Fix 7: Progress ring card — wallet goal-card pattern */}
      <section className="dashboard-goal-card">
        <span className="dashboard-goal-icon"><UserPlus /></span>
        <span className="dashboard-goal-body"><strong>Leads qualifiés</strong><small>{newLeads > 0 ? `${Math.max(0, newLeads - 3)} sur ${newLeads} traités` : "Aucun lead en attente"}</small></span>
        <span className="dashboard-goal-ring"><svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(37,43,91,0.06)" strokeWidth="3"/><circle cx="26" cy="26" r="22" fill="none" stroke="#E85820" strokeWidth="3" strokeDasharray="138.2" strokeDashoffset={String(138.2 * (1 - (newLeads > 0 ? (newLeads - 3) / newLeads : 0)))} strokeLinecap="round" style={{transform:'rotate(-90deg)',transformOrigin:'center'}}/></svg><span>{newLeads > 0 ? `${Math.round(((newLeads - 3) / newLeads) * 100)}%` : "—"}</span></span>
      </section>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs Core">
        <MetricCard label="Utilisateurs actifs" detail="Comptes habilités" value={String(activeUsers)} href={siteConfig.baseLinks.users} icon={<User />} tone="violet" />
        <MetricCard label="Tickets ouverts" detail="Support à traiter" value={String(openTickets)} href={siteConfig.baseLinks.support} icon={<Headset />} tone="amber" />
        <MetricCard label="Leads nouveaux" detail="À qualifier" value={String(newLeads)} href={siteConfig.baseLinks.leads} icon={<UserPlus />} tone="green" />
        <MetricCard label="Virements à valider" detail="Contrôles Wallet" value={String(walletKpis?.pendingTransactions ?? 0)} href={siteConfig.baseLinks.wallets} icon={<BellRinging />} tone="amber" />
      </section>

      <section className="dashboard-content-grid">
        <div className="dashboard-panel dashboard-activity-panel">
          <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Journal opérationnel</span><h2>Flux récent</h2><p>Derniers événements nécessitant une lecture opérateur.</p></div><Link href={siteConfig.baseLinks.journal}>Voir le journal <b>→</b></Link></div>
          <div className="dashboard-activity-list">
            {activity.length === 0 ? <p className="dashboard-empty">Aucune activité récente.</p> : activity.map((item) => <Link href={item.href} className="dashboard-activity-row" key={item.id}><span className={`dashboard-activity-dot ${item.tone}`} /><span><strong>{item.label}</strong><small>{formatDateTime(item.date)}</small></span><b>→</b></Link>)}
          </div>
        </div>

        <div className="dashboard-panel dashboard-actions-panel">
          <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Administration</span><h2>Interventions</h2><p>Accédez directement aux espaces de contrôle.</p></div></div>
          <div className="dashboard-action-grid">
            <ActionCard href={siteConfig.baseLinks.users} label="Gérer les utilisateurs" icon={<User />} tone="violet" />
            <ActionCard href={siteConfig.baseLinks.leads} label="Suivre les leads" icon={<UserPlus />} tone="green" />
            <ActionCard href={siteConfig.baseLinks.support} label="Ouvrir le support" icon={<Headset />} tone="amber" />
            <ActionCard href={siteConfig.baseLinks.notifications} label="Diffuser une alerte" icon={<BellRinging />} tone="violet" />
            <ActionCard href={siteConfig.baseLinks.wallets} label="Valider les virements" icon={<ChartBar />} tone="amber" />
            <ActionCard href={siteConfig.baseLinks.analytics} label="Analyser le funnel" icon={<ChartBar />} tone="green" />
            <ActionCard href={siteConfig.baseLinks.settings} label="Configurer le Core" icon={<GearSix />} tone="amber" />
          </div>
        </div>
      </section>

      <section className="dashboard-lower-grid">
        <Link href={siteConfig.baseLinks.analytics} className="dashboard-callout violet"><span>Analytics transverse</span><strong>{funnel.reduce((total, row) => total + row.count, 0)} leads dans le funnel →</strong><small>Suivez l’acquisition et la conversion sans dépendance financière.</small></Link>
        <Link href={siteConfig.baseLinks.users} className="dashboard-callout navy"><span>Identité et sécurité</span><strong>Un seul système d’accès →</strong><small>OTP, Passkeys, sessions, rôles et permissions restent fournis par le Core.</small></Link>
      </section>
    </div>
  )
}

function MetricCard({ label, detail, value, href, icon, tone }: { label: string; detail: string; value: string; href: string; icon: React.ReactNode; tone: "violet" | "amber" | "green" }) {
  return <Link href={href} className="dashboard-metric-card"><span className={`dashboard-metric-icon ${tone}`}>{icon}</span><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span><span className="dashboard-metric-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span></Link>
}

function ActionCard({ href, label, icon, tone }: { href: string; label: string; icon: React.ReactNode; tone: "violet" | "green" | "amber" }) {
  return <Link href={href} className="dashboard-action-card"><span className={`dashboard-action-icon ${tone}`}>{icon}</span><strong>{label}</strong><span className="dashboard-action-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span></Link>
}
