"use client"

import * as React from "react"
import Link from "next/link"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { DataTable } from "@/components/admin/DataTable"
import { DrawerRow, DrawerSection, ModuleDrawer } from "@/components/admin/ModuleDrawer"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { useToast } from "@/components/admin/Toast"
import { canUseDashboard, isAdmin } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { amountToCents, centsToInput, entrySymbol, useMoney } from "@/lib/displayCurrency"

type Outputs = inferRouterOutputs<AppRouter>
type AdminBusiness = Outputs["businessAdmin"]["listBusinesses"][number]
type AdminUser = Outputs["users"]["list"][number]
type AdminKpis = Outputs["businessAdmin"]["kpis"]
type BusinessDetail = Outputs["businessAdmin"]["detail"]
type BusinessStatus = AdminBusiness["status"]
type RoleMatrix = Outputs["team"]["roleMatrix"]

type Tab = "apercu" | "equipe" | "ventes" | "paiements" | "resolution" | "developers" | "parametres"

/* Les montants passent par `useMoney()` : devise d'affichage € / ₣ choisie en haut du Dashboard (parité fixe 1 € = 119,3317 ₣). */
/** Montants saisis dans la devise d'affichage (€ ou ₣), convertis vers l'unité stockée du compte de l'entreprise (euro par défaut). */
function asCents(value: string, accountCurrency = "EUR") {
  return amountToCents(value, accountCurrency)
}
function date(value: Date | string | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}
function apiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (["active", "completed", "paid", "won", "accepted", "approved", "fulfilled"].includes(status)) return "success"
  if (["pending", "pending_approval", "frozen", "draft", "invited", "processing", "under_review", "open", "sent", "viewed", "partial"].includes(status)) return "warning"
  if (["rejected", "closed", "cancelled", "expired", "suspended", "overdue", "lost", "disabled", "revoked", "blocked", "declined", "failed"].includes(status)) return "error"
  return "neutral"
}

const TABS: { key: Tab; label: string; tone: "violet" | "amber" | "green" | "teal" | "brick" }[] = [
  { key: "apercu", label: "Aperçu", tone: "violet" },
  { key: "equipe", label: "Équipe", tone: "teal" },
  { key: "ventes", label: "Ventes", tone: "green" },
  { key: "paiements", label: "Paiements", tone: "amber" },
  { key: "resolution", label: "Résolution", tone: "brick" },
  { key: "developers", label: "Developers", tone: "violet" },
  { key: "parametres", label: "Paramètres", tone: "teal" },
]

export default function BusinessAdminPage() {
  const { show } = useToast()
  const { money } = useMoney()
  const [kpis, setKpis] = React.useState<AdminKpis | null>(null)
  const [businesses, setBusinesses] = React.useState<AdminBusiness[]>([])
  const [roleMatrix, setRoleMatrix] = React.useState<RoleMatrix>([])
  const [pendingPayouts, setPendingPayouts] = React.useState<Outputs["businessAdmin"]["listPendingPayouts"]>([])
  const [transactions, setTransactions] = React.useState<Outputs["businessAdmin"]["listTransactions"]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [currentUser, setCurrentUser] = React.useState<Outputs["users"]["getMe"] | null>(null)
  const [selected, setSelected] = React.useState<AdminBusiness | null>(null)
  const [detail, setDetail] = React.useState<BusinessDetail | null>(null)
  const [tab, setTab] = React.useState<Tab>("apercu")
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    const [nextKpis, nextBusinesses, nextRoleMatrix, nextPending, nextTransactions, nextUsers] = await Promise.all([
      api.businessAdmin.kpis.query(),
      api.businessAdmin.listBusinesses.query(),
      api.team.roleMatrix.query(),
      api.businessAdmin.listPendingPayouts.query(),
      api.businessAdmin.listTransactions.query({ limit: 50 }),
      api.users.list.query().catch(() => []),
    ])
    setKpis(nextKpis)
    setBusinesses(nextBusinesses)
    setRoleMatrix(nextRoleMatrix)
    setPendingPayouts(nextPending)
    setTransactions(nextTransactions)
    setUsers(nextUsers)
  }, [])

  const refreshDetail = React.useCallback(async (businessId: number) => {
    const nextDetail = await api.businessAdmin.detail.query({ businessId })
    setDetail(nextDetail)
  }, [])

  React.useEffect(() => {
    setLoading(true)
    api.users.getMe.query().then((user) => {
      setCurrentUser(user)
      if (user.role === "user") return
      return refresh()
    }).catch((error) => show(apiError(error, "Impossible de charger le module Wallet Pro."), "error")).finally(() => setLoading(false))
  }, [refresh, show])

  const canOperate = canUseDashboard(currentUser?.role ?? "user")

  async function openBusiness(business: AdminBusiness) {
    setSelected(business)
    setDetail(null)
    setTab("apercu")
    try { await refreshDetail(business.id) } catch (error) { show(apiError(error, "Impossible de charger le détail de l’entreprise."), "error") }
  }

  async function refreshEverything(businessId?: number) {
    try { await refresh(); if (businessId) await refreshDetail(businessId) } catch (error) { show(apiError(error, "Rafraîchissement impossible."), "error") }
  }

  if (!loading && currentUser?.role === "user") {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"><h1 className="text-lg font-semibold">Accès restreint</h1><p className="mt-2">Le pilotage Wallet Pro est réservé aux rôles opérateur et administrateur.</p></div>
  }

  return <div className="dashboard-home">
    <header className="dashboard-page-header">
      <div className="dashboard-page-intro">
        <p className="dashboard-kicker">VTEX · Dashboard</p>
        <h1>Wallet Pro</h1>
        <p>Chaque entreprise, son équipe, son wallet, ses cartes, ses ventes et ses paramètres — piloté et journalisé depuis un seul espace.</p>
      </div>
      <div className="dashboard-header-actions">
        <Button variant="secondary" onClick={() => void refreshEverything(selected?.id)}>Rafraîchir</Button>
      </div>
    </header>

    <section className="dashboard-kpi-grid" aria-label="Indicateurs Wallet Pro">
      <MetricTile label="Entreprises" value={String(kpis?.businessCount ?? 0)} detail="Comptes Business actifs" tone="violet" />
      <MetricTile label="Solde total" value={money(kpis?.totalAvailableBalanceCents ?? 0)} detail="Tous wallets Pro" tone="green" />
      <MetricTile label="Payouts en attente" value={String(kpis?.pendingPayoutsCount ?? 0)} detail={money(kpis?.pendingPayoutsAmountCents ?? 0)} tone="amber" />
      <MetricTile label="Litiges ouverts" value={String(kpis?.openDisputesCount ?? 0)} detail="Résolution à traiter" tone="brick" />
    </section>

    {pendingPayouts.length > 0 ? <section className="space-y-3">
      <div className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Vue consolidée</span><h2>Payouts en attente — toutes entreprises</h2><p>Décision immédiate sans ouvrir chaque entreprise individuellement.</p></div></div>
        <DataTable mobileBreakpoint="lg" columns={[
          { header: "Entreprise", render: (row: Outputs["businessAdmin"]["listPendingPayouts"][number]) => businesses.find((b) => b.id === row.businessId)?.brandName ?? `#${row.businessId}` },
          { header: "Bénéficiaire", render: (row: Outputs["businessAdmin"]["listPendingPayouts"][number]) => row.beneficiaryName },
          { header: "Montant", render: (row: Outputs["businessAdmin"]["listPendingPayouts"][number]) => money(row.amountCents, row.currency) },
          { header: "Action", render: (row: Outputs["businessAdmin"]["listPendingPayouts"][number]) => canOperate ? <div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void (async () => { try { await api.businessAdmin.decidePayout.mutate({ businessId: row.businessId, payoutId: row.id, decision: "approved" }); await refresh(); show("Payout validé.") } catch (error) { show(apiError(error, "Décision impossible."), "error") } })()}>Valider</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void (async () => { try { await api.businessAdmin.decidePayout.mutate({ businessId: row.businessId, payoutId: row.id, decision: "rejected" }); await refresh(); show("Payout refusé.") } catch (error) { show(apiError(error, "Décision impossible."), "error") } })()}>Refuser</Button></div> : "—" },
        ]} rows={pendingPayouts} getRowKey={(row) => row.id} emptyLabel="" />
      </div>
    </section> : null}

    <section className="space-y-3">
      <div className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Onboarding</span><h2>Créer une entreprise</h2><p>Ouvrez un compte Business pour un titulaire existant — wallet, équipe, RIB et solde initial sont provisionnés immédiatement.</p></div></div>
        {isAdmin(currentUser?.role) ? <CreateBusinessForm users={users} onDone={() => refreshEverything()} /> : <p className="text-sm text-gray-500">La création d’une entreprise, l’attribution des RIB et la mise à jour des soldes sont réservées aux administrateurs.</p>}
      </div>
    </section>

    <section className="space-y-3">
      <div className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Portefeuille</span><h2>Entreprises</h2><p>Ouvrez une entreprise pour administrer son équipe, son wallet, ses ventes et ses paramètres.</p></div></div>
        <DataTable mobileBreakpoint="lg" columns={[
          { header: "Entreprise", render: (row: AdminBusiness) => <div><div className="font-medium">{row.brandName}</div><div className="text-xs text-gray-500">{row.legalName}</div></div> },
          { header: "Secteur", render: (row: AdminBusiness) => row.industry ?? "—" },
          { header: "Solde disponible", render: (row: AdminBusiness) => money(row.availableBalanceCents, row.currency) },
          { header: "Statut", render: (row: AdminBusiness) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
          { header: "Créée le", render: (row: AdminBusiness) => date(row.createdAt) },
        ]} rows={businesses} getRowKey={(row) => row.id} onRowClick={(row) => void openBusiness(row)} emptyLabel={loading ? "Chargement des entreprises…" : "Aucune entreprise Business."} />
      </div>
    </section>

    <section className="space-y-3">
      <div className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Vue consolidée</span><h2>Transactions récentes — toutes entreprises</h2><p>Flux global des 50 dernières opérations, tous comptes Business confondus.</p></div></div>
        <DataTable mobileBreakpoint="lg" columns={[
          { header: "Entreprise", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => row.businessName },
          { header: "Référence", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => <span className="font-mono text-xs">{row.reference}</span> },
          { header: "Type", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => row.type.replaceAll("_", " ") },
          { header: "Montant", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => <span>{row.direction === "credit" ? "+" : "−"}{money(row.amountCents, row.currency)}</span> },
          { header: "Statut", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
          { header: "Date", render: (row: Outputs["businessAdmin"]["listTransactions"][number]) => date(row.createdAt) },
        ]} rows={transactions} getRowKey={(row) => row.id} onRowClick={(row) => { const business = businesses.find((b) => b.id === row.businessId); if (business) void openBusiness(business) }} emptyLabel={loading ? "Chargement des transactions…" : "Aucune transaction."} />
      </div>
    </section>

    <ModuleDrawer open={!!selected} onOpenChange={(open) => !open && (setSelected(null), setDetail(null))} title={selected ? selected.brandName : ""} subtitle={selected ? `${selected.legalName} · Wallet Pro` : ""}>
      {!detail ? <p className="text-sm text-gray-500">Chargement du détail…</p> : <>
        <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-3 dark:border-gray-800">
          {TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${tab === t.key ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-400"}`}>{t.label}</button>)}
        </div>
        {tab === "apercu" ? <OverviewTab detail={detail} canOperate={canOperate} isAdmin={isAdmin(currentUser?.role)} onChanged={() => refreshEverything(detail.business.id)} /> : null}
        {tab === "equipe" ? <TeamTab businessId={detail.business.id} members={detail.members} roleMatrix={roleMatrix} canOperate={canOperate} onChanged={() => refreshEverything(detail.business.id)} /> : null}
        {tab === "ventes" ? <SalesTab businessId={detail.business.id} canOperate={canOperate} /> : null}
        {tab === "paiements" ? <PaymentsTab businessId={detail.business.id} canOperate={canOperate} onChanged={() => refreshEverything(detail.business.id)} /> : null}
        {tab === "resolution" ? <ResolutionTab businessId={detail.business.id} canOperate={canOperate} onChanged={() => refreshEverything(detail.business.id)} /> : null}
        {tab === "developers" ? <DevelopersTab businessId={detail.business.id} canOperate={canOperate} /> : null}
        {tab === "parametres" ? <SettingsTab businessId={detail.business.id} canOperate={canOperate} onChanged={() => refreshEverything(detail.business.id)} /> : null}
      </>}
    </ModuleDrawer>
  </div>
}

function MetricTile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "violet" | "amber" | "green" | "teal" | "brick" }) {
  return <div className="dashboard-metric-card" style={{ cursor: "default" }}>
    <span className={`dashboard-metric-icon ${tone}`}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg></span>
    <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
  </div>
}

function CreateBusinessForm({ users, onDone }: { users: AdminUser[]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<AdminUser | null>(null)
  const [legalName, setLegalName] = React.useState("")
  const [brandName, setBrandName] = React.useState("")
  const [industry, setIndustry] = React.useState("")
  const [currency, setCurrency] = React.useState<"EUR" | "USD" | "XPF">("EUR")
  const [initialBalance, setInitialBalance] = React.useState("")
  const [ribMode, setRibMode] = React.useState<"none" | "generate" | "manual">("generate")
  const [iban, setIban] = React.useState("")
  const [bic, setBic] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const { toStored, inputCurrency } = useMoney()
  const entrySymbol = inputCurrency(currency) === "XPF" ? "₣" : inputCurrency(currency) === "USD" ? "$" : "€"
  const candidates = React.useMemo(() => users.filter((user) => user.status === "active" && (`${user.firstName} ${user.lastName} ${user.email}`).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6), [query, users])
  async function submit() {
    if (!selected) return show("Sélectionnez un titulaire actif.", "error")
    if (legalName.trim().length < 2 || brandName.trim().length < 2) return show("Raison sociale et nom commercial requis.", "error")
    const openingCents = initialBalance.trim() ? toStored(initialBalance, currency) : 0
    if (openingCents === null || openingCents < 0) return show("Solde initial invalide.", "error")
    if (ribMode === "manual" && (iban.replace(/\s/g, "").length < 15 || bic.trim().length < 8)) return show("IBAN (15 à 34 caractères) et BIC (8 ou 11 caractères) requis pour un RIB manuel.", "error")
    setBusy(true)
    let created: { businessId: number; walletAccountId: number } | null = null
    try {
      created = await api.businessAdmin.createBusiness.mutate({ ownerUserId: selected.id, legalName: legalName.trim(), brandName: brandName.trim(), industry: industry.trim() || undefined, currency })
      // Le compte existe : les étapes suivantes sont indépendantes ; en cas d'échec on l'indique sans annuler la création.
      const followUps: string[] = []
      if (ribMode === "generate") { try { await api.wallet.provisionBankDetails.mutate({ businessId: created.businessId, accountId: created.walletAccountId }) } catch (error) { followUps.push(`RIB : ${apiError(error, "génération impossible")}`) } }
      if (ribMode === "manual") { try { await api.businessAdmin.updateBankDetails.mutate({ businessId: created.businessId, accountId: created.walletAccountId, iban: iban.replace(/\s/g, ""), bic: bic.trim(), reason: "Attribution à la création de l’entreprise" }) } catch (error) { followUps.push(`RIB : ${apiError(error, "attribution impossible")}`) } }
      if (openingCents > 0) { try { await api.businessAdmin.adjustBalance.mutate({ businessId: created.businessId, accountId: created.walletAccountId, deltaCents: openingCents, reason: "Solde initial à l’ouverture du compte" }) } catch (error) { followUps.push(`Solde initial : ${apiError(error, "crédit impossible")}`) } }
      await onDone()
      show(followUps.length ? `Entreprise créée, mais : ${followUps.join(" · ")} — à finaliser dans sa fiche.` : "Entreprise créée : wallet Pro, équipe, RIB et solde initial provisionnés.", followUps.length ? "error" : undefined)
      setLegalName(""); setBrandName(""); setIndustry(""); setQuery(""); setSelected(null); setInitialBalance(""); setIban(""); setBic("")
    } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2">
    <div className="grid gap-2 md:grid-cols-2">
      <div><Label htmlFor="new-business-owner-search">Titulaire</Label><Input id="new-business-owner-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null) }} placeholder="Rechercher par nom ou email" />{query.trim() && !selected ? <div className="mt-1 max-h-36 overflow-auto rounded-md border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-950">{candidates.length ? candidates.map((user) => <button type="button" key={user.id} onClick={() => { setSelected(user); setQuery(`${user.firstName} ${user.lastName} · ${user.email}`) }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-900">{user.firstName} {user.lastName} · {user.email}</button>) : <p className="px-2 py-1 text-xs text-gray-500">Aucun titulaire actif.</p>}</div> : null}{selected ? <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Titulaire sélectionné : {selected.firstName} {selected.lastName}</p> : null}</div>
      <div><Label htmlFor="new-business-currency">Devise</Label><select id="new-business-currency" className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={currency} onChange={(event) => setCurrency(event.target.value as "EUR" | "USD" | "XPF")}><option value="EUR">€ Euro</option><option value="USD">$ Dollar</option><option value="XPF">₣ Franc Pacifique</option></select></div>
    </div>
    <div className="grid gap-2 md:grid-cols-3">
      <div><Label htmlFor="new-business-legal-name">Raison sociale</Label><Input id="new-business-legal-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="SAS Exemple" /></div>
      <div><Label htmlFor="new-business-brand-name">Nom commercial</Label><Input id="new-business-brand-name" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Exemple" /></div>
      <div><Label htmlFor="new-business-industry">Secteur</Label><Input id="new-business-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Facultatif" /></div>
    </div>
    <div className="grid gap-2 md:grid-cols-3">
      <div><Label htmlFor="new-business-opening-balance">Solde initial ({entrySymbol}, facultatif)</Label><Input id="new-business-opening-balance" value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} placeholder="0" inputMode="decimal" /></div>
      <div><Label htmlFor="new-business-rib-mode">RIB du compte principal</Label><select id="new-business-rib-mode" className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={ribMode} onChange={(event) => setRibMode(event.target.value as typeof ribMode)}><option value="generate">Générer automatiquement</option><option value="manual">Attribuer un RIB existant</option><option value="none">Aucun pour l’instant</option></select></div>
      {ribMode === "manual" ? <div className="grid grid-cols-2 gap-2 md:col-span-1"><div><Label htmlFor="new-business-iban">IBAN</Label><Input id="new-business-iban" className="font-mono" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="FR76…" autoComplete="off" /></div><div><Label htmlFor="new-business-bic">BIC</Label><Input id="new-business-bic" className="font-mono" value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BNPAFRPP" autoComplete="off" /></div></div> : <div />}
    </div>
    <Button className="h-9 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer l’entreprise"}</Button>
  </div>
}

/* ────────────────  Aperçu : profil, wallet, cartes, statut  ──────────────── */

function OverviewTab({ detail, canOperate, isAdmin, onChanged }: { detail: BusinessDetail; canOperate: boolean; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const { money } = useMoney()
  const wallets = detail.wallet
  const wallet = wallets[0]
  return <>
    <DrawerSection title="Profil entreprise">
      {canOperate ? <BusinessProfileForm businessId={detail.business.id} business={detail.business} onDone={onChanged} /> : <>
        <DrawerRow label="Raison sociale" value={detail.business.legalName} />
        <DrawerRow label="SIREN" value={detail.business.siren ?? "—"} />
        <DrawerRow label="TVA" value={detail.business.vatId ?? "—"} />
        <DrawerRow label="Email" value={detail.business.email ?? "—"} />
        <DrawerRow label="Téléphone" value={detail.business.phone ?? "—"} />
      </>}
      <DrawerRow label="Vérifiée" value={detail.business.verifiedAt ? date(detail.business.verifiedAt) : "Non vérifiée (KYB)"} />
    </DrawerSection>

    <DrawerSection title={`Comptes Wallet Pro (${wallets.length})`}>
      {wallets.length === 0 ? <p className="text-sm text-gray-500">Aucun compte Wallet Pro.</p> : <div className="space-y-3">{wallets.map((account) => <WalletAccountPanel key={account.id} businessId={detail.business.id} account={account} canOperate={canOperate} isAdmin={isAdmin} onChanged={onChanged} />)}</div>}
    </DrawerSection>

    <DrawerSection title={`Cartes (${detail.cards.length})`}>
      <div className="space-y-2">{detail.cards.map((card) => <BusinessCardPanel key={card.id} businessId={detail.business.id} card={card} account={wallets.find((account) => account.id === card.businessWalletAccountId)} canOperate={canOperate} isAdmin={isAdmin} onChanged={onChanged} />)}
      {canOperate && wallet ? <CreateCardForm businessId={detail.business.id} accounts={wallets} onDone={onChanged} /> : null}</div>
    </DrawerSection>

    {canOperate ? <DrawerSection title="Cycle de vie de l’entreprise"><BusinessStatusControls businessId={detail.business.id} status={detail.business.status} onChanged={onChanged} /></DrawerSection> : null}

    <DrawerSection title={`Historique récent (${detail.recentTransactions.length})`}>
      <div className="max-h-56 space-y-2 overflow-auto pr-1">{detail.recentTransactions.length === 0 ? <p className="text-sm text-gray-500">Aucune transaction.</p> : detail.recentTransactions.map((t) => <div key={t.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><div className="flex items-center justify-between"><span className="font-mono">{t.reference}</span><Badge variant={statusVariant(t.status)}>{t.status}</Badge></div><div className="mt-1 flex items-center justify-between text-gray-500"><span>{t.type.replaceAll("_", " ")}</span><span>{t.direction === "credit" ? "+" : "−"}{money(t.amountCents, t.currency)}</span></div></div>)}</div>
    </DrawerSection>
  </>
}

function BusinessStatusControls({ businessId, status, onChanged }: { businessId: number; status: BusinessStatus; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [next, setNext] = React.useState<BusinessStatus | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function apply() {
    if (!next) return
    setBusy(true)
    try { await api.businessAdmin.updateStatus.mutate({ businessId, status: next }); await onChanged(); show("Statut mis à jour et journalisé.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") } finally { setBusy(false); setNext(null) }
  }
  return <div className="flex flex-wrap gap-2">
    {status !== "active" ? <Button className="h-8 text-xs" disabled={busy} onClick={() => setNext("active")}>Activer</Button> : null}
    {status !== "suspended" ? <Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => setNext("suspended")}>Suspendre</Button> : null}
    {status !== "closed" ? <Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => setNext("closed")}>Clôturer</Button> : null}
    <ConfirmDialog open={!!next} onOpenChange={(open) => !open && setNext(null)} title="Modifier le statut de l’entreprise ?" description={`L’entreprise passera à l’état ${next}.`} confirmLabel="Confirmer" destructive={next === "closed"} onConfirm={() => void apply()} />
  </div>
}

function BusinessProfileForm({ businessId, business, onDone }: { businessId: number; business: BusinessDetail["business"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [legalName, setLegalName] = React.useState(business.legalName)
  const [brandName, setBrandName] = React.useState(business.brandName)
  const [siren, setSiren] = React.useState(business.siren ?? "")
  const [vatId, setVatId] = React.useState(business.vatId ?? "")
  const [email, setEmail] = React.useState(business.email ?? "")
  const [phone, setPhone] = React.useState(business.phone ?? "")
  const [address, setAddress] = React.useState(business.address ?? "")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    if (legalName.trim().length < 2 || brandName.trim().length < 2) return show("Raison sociale et nom commercial requis.", "error")
    setBusy(true)
    try { await api.businesses.update.mutate({ businessId, legalName: legalName.trim(), brandName: brandName.trim(), siren: siren.trim() || undefined, vatId: vatId.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined }); await onDone(); show("Profil entreprise enregistré.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2"><Input aria-label="Raison sociale" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Raison sociale" /><Input aria-label="Nom commercial" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Nom commercial" /></div>
    <div className="grid grid-cols-2 gap-2"><Input aria-label="SIREN" value={siren} onChange={(e) => setSiren(e.target.value)} placeholder="SIREN" /><Input aria-label="TVA" value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="N° TVA" /></div>
    <div className="grid grid-cols-2 gap-2"><Input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /><Input aria-label="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" /></div>
    <Input aria-label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" />
    <Button className="h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Enregistrement…" : "Enregistrer le profil"}</Button>
  </div>
}

function BusinessCardPanel({ businessId, card, account, canOperate, isAdmin, onChanged }: { businessId: number; card: BusinessDetail["cards"][number]; account: BusinessDetail["wallet"][number] | undefined; canOperate: boolean; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const { money } = useMoney()
  const [editingBalance, setEditingBalance] = React.useState(false)
  const [online, setOnline] = React.useState(card.onlinePaymentsEnabled)
  const [contactless, setContactless] = React.useState(card.contactlessEnabled)
  const [cash, setCash] = React.useState(card.cashWithdrawalEnabled)
  const [daily, setDaily] = React.useState(centsToInput(card.dailyLimitCents, account?.currency))
  const [monthly, setMonthly] = React.useState(centsToInput(card.monthlyLimitCents, account?.currency))
  const [perTransaction, setPerTransaction] = React.useState(centsToInput(card.perTransactionLimitCents, account?.currency))
  const [busy, setBusy] = React.useState(false)
  async function toggleFreeze() {
    setBusy(true)
    try { await api.wallet.setCardFrozen.mutate({ businessId, cardId: card.id, frozen: card.status !== "frozen" }); await onChanged(); show(card.status === "frozen" ? "Carte dégelée." : "Carte gelée.") } catch (error) { show(apiError(error, "Action impossible."), "error") } finally { setBusy(false) }
  }
  async function saveControls() {
    const dailyLimitCents = asCents(daily, account?.currency); const monthlyLimitCents = asCents(monthly, account?.currency); const perTransactionLimitCents = asCents(perTransaction, account?.currency)
    if (dailyLimitCents <= 0 || monthlyLimitCents <= 0 || perTransactionLimitCents <= 0) return show("Chaque plafond doit être strictement positif.", "error")
    setBusy(true)
    try { await api.wallet.updateCardControls.mutate({ businessId, cardId: card.id, onlinePaymentsEnabled: online, contactlessEnabled: contactless, cashWithdrawalEnabled: cash, dailyLimitCents, monthlyLimitCents, perTransactionLimitCents }); await onChanged(); show("Contrôles enregistrés.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800">
    <div className="flex items-center justify-between"><Link href={`/cartes?card=PROFESSIONAL-${card.id}`} className="font-semibold text-[#3a4380] hover:underline">{card.network.toUpperCase()} · •••• {card.lastFour} · {card.theme}</Link><Badge variant={statusVariant(card.status)}>{card.status}</Badge></div>
    <div className="mt-1 flex items-center justify-between text-gray-600 dark:text-gray-400"><span>{card.cardholderName}</span><span>Solde de la carte : <b className="text-gray-900 dark:text-gray-50">{account ? money(account.availableBalanceCents, account.currency) : "—"}</b></span></div>
    {account ? <p className="mt-0.5 text-[11px] text-gray-500">La carte dépense le solde de son compte Wallet Pro #{account.id} ({account.currency}).</p> : null}
    {canOperate && !["expired", "cancelled"].includes(card.status) ? <div className="mt-2 flex flex-wrap gap-1"><Button variant="secondary" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void toggleFreeze()}>{card.status === "frozen" ? "Dégeler" : "Geler"}</Button>{isAdmin && account ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => setEditingBalance((open) => !open)}>{editingBalance ? "Fermer" : "Mettre à jour le solde"}</Button> : null}</div> : null}
    {editingBalance && account ? <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-800"><BalanceForm businessId={businessId} account={account} onDone={async () => { await onChanged(); setEditingBalance(false) }} /></div> : null}
    {canOperate ? <div className="mt-2 space-y-1.5 border-t border-gray-200 pt-2 dark:border-gray-800">
      <div className="grid grid-cols-3 gap-1"><label className="flex items-center gap-1"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />En ligne</label><label className="flex items-center gap-1"><input type="checkbox" checked={contactless} onChange={(e) => setContactless(e.target.checked)} />Sans contact</label><label className="flex items-center gap-1"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} />Retrait</label></div>
      <div className="grid grid-cols-3 gap-1"><Input aria-label="Plafond par opération" className="h-7" value={perTransaction} onChange={(e) => setPerTransaction(e.target.value)} inputMode="decimal" /><Input aria-label="Plafond quotidien" className="h-7" value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" /><Input aria-label="Plafond mensuel" className="h-7" value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" /></div>
      <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void saveControls()}>Enregistrer les contrôles</Button>
    </div> : null}
  </div>
}

/** Un compte Wallet Pro : coordonnées bancaires (RIB), soldes, attribution du RIB et mise à jour du solde. */
function WalletAccountPanel({ businessId, account, canOperate, isAdmin, onChanged }: { businessId: number; account: BusinessDetail["wallet"][number]; canOperate: boolean; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const { money } = useMoney()
  const [editingBalance, setEditingBalance] = React.useState(false)
  return <div className="space-y-2 rounded-md border border-gray-200 p-3 dark:border-gray-800">
    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Compte {account.currency} · #{account.id}</span><Badge variant={statusVariant(account.status)}>{account.status}</Badge></div>
    <DrawerRow label="IBAN" value={<span className="font-mono text-xs">{account.iban ?? "Aucun RIB attribué"}</span>} />
    <DrawerRow label="BIC" value={account.bic ?? "—"} />
    <DrawerRow label="Disponible" value={money(account.availableBalanceCents, account.currency)} />
    <DrawerRow label="Réservé" value={money(account.reservedBalanceCents, account.currency)} />
    {canOperate ? <div className="flex flex-wrap gap-1 border-t border-gray-200 pt-2 dark:border-gray-800">
      {isAdmin ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => setEditingBalance((open) => !open)}>{editingBalance ? "Fermer" : "Mettre à jour le solde"}</Button> : null}
    </div> : null}
    {editingBalance ? <BalanceForm businessId={businessId} account={account} onDone={async () => { await onChanged(); setEditingBalance(false) }} /> : null}
    {canOperate ? <BankDetailsControls businessId={businessId} account={account} isAdmin={isAdmin} onDone={onChanged} /> : null}
  </div>
}

/** Attribuer, remplacer, générer ou retirer le RIB d'un compte — attribution et retrait réservés aux administrateurs, motif journalisé. */
function BankDetailsControls({ businessId, account, isAdmin, onDone }: { businessId: number; account: BusinessDetail["wallet"][number]; isAdmin: boolean; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [mode, setMode] = React.useState<"idle" | "assign" | "revoke">("idle")
  const [iban, setIban] = React.useState("")
  const [bic, setBic] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [confirmRevoke, setConfirmRevoke] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const hasBank = Boolean(account.iban)
  async function generate() {
    setBusy(true)
    try { await api.wallet.provisionBankDetails.mutate({ businessId, accountId: account.id }); await onDone(); show("RIB généré (IBAN valide, clé MOD 97).") } catch (error) { show(apiError(error, "Génération impossible."), "error") } finally { setBusy(false) }
  }
  async function assign() {
    if (iban.replace(/\s/g, "").length < 15 || bic.trim().length < 8) return show("IBAN (15 à 34 caractères) et BIC (8 ou 11 caractères) requis.", "error")
    if (reason.trim().length < 8) return show("Motif d’au moins huit caractères requis.", "error")
    setBusy(true)
    try { await api.businessAdmin.updateBankDetails.mutate({ businessId, accountId: account.id, iban: iban.replace(/\s/g, ""), bic: bic.trim(), reason: reason.trim() }); await onDone(); show(hasBank ? "RIB remplacé et journalisé." : "RIB attribué et journalisé."); setMode("idle"); setIban(""); setBic(""); setReason("") } catch (error) { show(apiError(error, "Attribution impossible."), "error") } finally { setBusy(false) }
  }
  async function revoke() {
    if (reason.trim().length < 8) return show("Motif d’au moins huit caractères requis.", "error")
    setBusy(true)
    try { await api.businessAdmin.revokeBankDetails.mutate({ businessId, accountId: account.id, reason: reason.trim() }); await onDone(); show("RIB retiré et journalisé."); setReason(""); setMode("idle") } catch (error) { show(apiError(error, "Retrait impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2 border-t border-gray-200 pt-2 dark:border-gray-800">
    <div className="flex flex-wrap gap-1">
      {!hasBank ? <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void generate()}>Générer un RIB</Button> : null}
      {isAdmin ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => setMode(mode === "assign" ? "idle" : "assign")}>{mode === "assign" ? "Annuler" : hasBank ? "Remplacer le RIB" : "Attribuer un RIB"}</Button> : null}
      {isAdmin && hasBank ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => setMode(mode === "revoke" ? "idle" : "revoke")}>{mode === "revoke" ? "Annuler" : "Retirer le RIB"}</Button> : null}
    </div>
    {mode === "revoke" && isAdmin && hasBank ? <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-2 dark:border-gray-700">
      <div><Label htmlFor={`rib-revoke-reason-${account.id}`}>Motif du retrait (journalisé)</Label><Input id={`rib-revoke-reason-${account.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Compte clôturé à la demande du titulaire" /></div>
      <Button variant="destructive" className="h-8 text-xs" disabled={busy || reason.trim().length < 8} onClick={() => setConfirmRevoke(true)}>Retirer le RIB</Button>
    </div> : null}
    {!isAdmin ? <p className="text-[11px] text-gray-500">L’attribution ou le retrait d’un RIB est réservé aux administrateurs.</p> : null}
    {mode === "assign" && isAdmin ? <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-2 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor={`rib-iban-${account.id}`}>IBAN</Label><Input id={`rib-iban-${account.id}`} className="font-mono" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="FR76 3000 4028 …" autoComplete="off" /></div>
        <div><Label htmlFor={`rib-bic-${account.id}`}>BIC / SWIFT</Label><Input id={`rib-bic-${account.id}`} className="font-mono" value={bic} onChange={(e) => setBic(e.target.value)} placeholder="BNPAFRPP" autoComplete="off" /></div>
      </div>
      <div><Label htmlFor={`rib-reason-${account.id}`}>Motif (journalisé)</Label><Input id={`rib-reason-${account.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Ouverture du compte, RIB validé par la conformité" /></div>
      <Button className="h-8 text-xs" disabled={busy} onClick={() => void assign()}>{busy ? "Enregistrement…" : hasBank ? "Remplacer le RIB" : "Attribuer le RIB"}</Button>
      <p className="text-[11px] text-gray-500">Le contrôle IBAN (clé MOD 97) et BIC est fait côté serveur.</p>
    </div> : null}
    <ConfirmDialog open={confirmRevoke} onOpenChange={setConfirmRevoke} title="Retirer le RIB de ce compte ?" description="Les virements entrants vers cet IBAN ne seront plus rapprochés. L’action est journalisée avec le motif saisi." confirmLabel="Retirer le RIB" destructive onConfirm={() => void revoke()} />
  </div>
}

function CreateCardForm({ businessId, accounts, onDone }: { businessId: number; accounts: BusinessDetail["wallet"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [accountId, setAccountId] = React.useState<number>(accounts[0]?.id ?? 0)
  const [cardholderName, setCardholderName] = React.useState("")
  const [network, setNetwork] = React.useState<"visa" | "mastercard" | "cb">("visa")
  const [theme, setTheme] = React.useState<"navy" | "teal" | "brick">("navy")
  const [expiresAt, setExpiresAt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const dateValue = new Date(expiresAt)
    if (cardholderName.trim().length < 2 || Number.isNaN(dateValue.getTime())) return show("Renseignez un titulaire et une date d’expiration valide.", "error")
    setBusy(true)
    try { await api.wallet.createCard.mutate({ businessId, businessWalletAccountId: accountId, cardholderName: cardholderName.trim(), network, theme, expiresAt: dateValue }); await onDone(); show("Carte émise."); setCardholderName("") } catch (error) { show(apiError(error, "Émission de carte impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Émettre une carte pro</p><div className="grid grid-cols-2 gap-2">{accounts.length > 1 ? <select aria-label="Compte débité" className="col-span-2 h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>{accounts.map((account) => <option key={account.id} value={account.id}>Compte {account.currency} · #{account.id}</option>)}</select> : null}<Input aria-label="Titulaire" value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} placeholder="Titulaire" /><Input aria-label="Expiration" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /><select aria-label="Réseau" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={network} onChange={(e) => setNetwork(e.target.value as typeof network)}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="cb">CB</option></select><select aria-label="Thème" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}><option value="navy">Navy</option><option value="teal">Teal</option><option value="brick">Brick</option></select></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Émission…" : "Émettre"}</Button></div>
}

/** Met à jour le solde d'un compte Wallet Pro (donc de ses cartes) : ajouter/retirer un montant, ou fixer le solde cible. Saisie dans la devise d'affichage, convertie à la parité fixe. */
function BalanceForm({ businessId, account, onDone }: { businessId: number; account: BusinessDetail["wallet"][number]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const { money, toStored, inputCurrency } = useMoney()
  const [mode, setMode] = React.useState<"adjust" | "set">("adjust")
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const entry = inputCurrency(account.currency)
  const symbol = entry === "XPF" ? "₣" : entry === "USD" ? "$" : "€"
  const stored = amount.trim() ? toStored(amount, account.currency) : null
  const deltaCents = stored === null ? null : mode === "set" ? stored - account.availableBalanceCents : stored
  const after = deltaCents === null ? null : account.availableBalanceCents + deltaCents
  async function submit() {
    if (deltaCents === null || deltaCents === 0) return show("Saisissez un montant qui modifie le solde.", "error")
    if (after !== null && after < 0) return show("Le solde ne peut pas devenir négatif.", "error")
    if (reason.trim().length < 8) return show("Justification d’au moins huit caractères requise.", "error")
    setBusy(true)
    try { await api.businessAdmin.adjustBalance.mutate({ businessId, accountId: account.id, deltaCents, reason: reason.trim() }); show("Solde mis à jour et journalisé."); await onDone(); setAmount(""); setReason("") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-2 dark:border-gray-700">
    <div className="flex gap-1" role="group" aria-label="Type de mise à jour">
      <button type="button" aria-pressed={mode === "adjust"} onClick={() => setMode("adjust")} className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "adjust" ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400"}`}>Ajouter / retirer</button>
      <button type="button" aria-pressed={mode === "set"} onClick={() => setMode("set")} className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "set" ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400"}`}>Définir le solde</button>
    </div>
    <div><Label htmlFor={`balance-amount-${account.id}`}>{mode === "set" ? `Nouveau solde en ${symbol}` : `Montant en ${symbol} (négatif pour retirer)`}</Label><Input id={`balance-amount-${account.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === "set" ? "Ex. 5 000" : "Ex. 250 ou -250"} inputMode="decimal" /></div>
    <div><Label htmlFor={`balance-reason-${account.id}`}>Justification (journalisée)</Label><Input id={`balance-reason-${account.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Correction motivée…" /></div>
    {after !== null && deltaCents !== null && deltaCents !== 0 ? <p className="text-[11px] text-gray-600 dark:text-gray-400">Solde actuel {money(account.availableBalanceCents, account.currency)} → <b>{money(after, account.currency)}</b> ({deltaCents > 0 ? "+" : "−"}{money(Math.abs(deltaCents), account.currency)})</p> : null}
    <Button className="h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Enregistrement…" : "Enregistrer le solde"}</Button>
  </div>
}

/* ────────────────  Équipe : membres, rôles, approbations  ──────────────── */

function TeamTab({ businessId, members: initialMembers, roleMatrix, canOperate, onChanged }: { businessId: number; members: BusinessDetail["members"]; roleMatrix: RoleMatrix; canOperate: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [members, setMembers] = React.useState(initialMembers)
  const [approvals, setApprovals] = React.useState<Outputs["team"]["listApprovals"]>([])
  React.useEffect(() => { setMembers(initialMembers) }, [initialMembers])
  const loadApprovals = React.useCallback(() => api.team.listApprovals.query({ businessId, status: "pending" }).then(setApprovals).catch(() => setApprovals([])), [businessId])
  React.useEffect(() => { void loadApprovals() }, [loadApprovals])
  async function refreshMembers() { const next = await api.team.listMembers.query({ businessId }); setMembers(next); await onChanged() }
  async function decide(approvalId: number, decision: "approved" | "rejected") {
    try { await api.team.decideApproval.mutate({ businessId, approvalId, decision }); await loadApprovals(); await onChanged(); show("Décision enregistrée.") } catch (error) { show(apiError(error, "Décision impossible."), "error") }
  }
  async function changeRole(memberId: number, role: string) {
    try { await api.team.updateRole.mutate({ businessId, memberId, role: role as "owner" | "admin" | "finance" | "support" | "viewer" }); await refreshMembers(); show("Rôle mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function changeStatus(memberId: number, status: "active" | "suspended") {
    try { await api.team.updateStatus.mutate({ businessId, memberId, status }); await refreshMembers(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function remove(memberId: number) {
    try { await api.team.remove.mutate({ businessId, memberId }); await refreshMembers(); show("Membre retiré.") } catch (error) { show(apiError(error, "Retrait impossible."), "error") }
  }
  return <>
    <DrawerSection title={`Membres (${members.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Membre", render: (row: BusinessDetail["members"][number]) => <div><div className="font-medium">{row.name}</div><div className="text-xs text-gray-500">{row.email}</div></div> },
        { header: "Rôle", render: (row: BusinessDetail["members"][number]) => canOperate ? <select aria-label="Rôle du membre" className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-800 dark:bg-gray-950" value={row.role} onChange={(e) => void changeRole(row.id, e.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="finance">Finance</option><option value="support">Support</option><option value="viewer">Viewer</option></select> : row.role },
        { header: "Statut", render: (row: BusinessDetail["members"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: BusinessDetail["members"][number]) => canOperate ? <div className="flex gap-1">{row.status === "suspended" ? <Button className="h-7 px-2 text-xs" onClick={() => void changeStatus(row.id, "active")}>Réactiver</Button> : <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void changeStatus(row.id, "suspended")}>Suspendre</Button>}<Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void remove(row.id)}>Retirer</Button></div> : "—" },
      ]} rows={members} getRowKey={(row) => row.id} emptyLabel="Aucun membre." />
      {canOperate ? <InviteMemberForm businessId={businessId} onDone={refreshMembers} /> : null}
    </DrawerSection>
    <DrawerSection title="Matrice des rôles">
      <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">{roleMatrix.map((r) => <div key={r.role}><b className="capitalize">{r.role}</b> — {r.can.join(" · ")}</div>)}</div>
    </DrawerSection>
    {canOperate ? <DrawerSection title={`Approbations en attente (${approvals.length})`}>
      <div className="space-y-2">{approvals.length === 0 ? <p className="text-sm text-gray-500">Aucune approbation en attente.</p> : approvals.map((a) => <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><span>{a.kind} #{a.targetId}</span><div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void decide(a.id, "approved")}>Approuver</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decide(a.id, "rejected")}>Refuser</Button></div></div>)}</div>
    </DrawerSection> : null}
  </>
}

function InviteMemberForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [userId, setUserId] = React.useState("")
  const [role, setRole] = React.useState<"owner" | "admin" | "finance" | "support" | "viewer">("viewer")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const uid = Number(userId)
    if (!Number.isInteger(uid) || uid <= 0) return show("Renseignez l’identifiant numérique de l’utilisateur (module Utilisateurs).", "error")
    setBusy(true)
    try { await api.team.invite.mutate({ businessId, userId: uid, role }); await onDone(); show("Invitation envoyée et journalisée."); setUserId("") } catch (error) { show(apiError(error, "Invitation impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Inviter un membre</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Identifiant utilisateur" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="ID utilisateur (ex. 42)" inputMode="numeric" /><select aria-label="Rôle" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="finance">Finance</option><option value="support">Support</option><option value="viewer">Viewer</option></select></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Envoi…" : "Inviter"}</Button></div>
}

/* ────────────────  Ventes : factures, devis, abonnements, commandes, produits, clients  ──────────────── */

function SalesTab({ businessId, canOperate }: { businessId: number; canOperate: boolean }) {
  const { show } = useToast()
  const { money } = useMoney()
  const [invoices, setInvoices] = React.useState<Outputs["invoices"]["list"]>([])
  const [estimates, setEstimates] = React.useState<Outputs["estimates"]["list"]>([])
  const [subscriptions, setSubscriptions] = React.useState<Outputs["subscriptions"]["list"]>([])
  const [customers, setCustomers] = React.useState<Outputs["customers"]["list"]>([])
  const [products, setProducts] = React.useState<Outputs["products"]["list"]>([])
  const [orders, setOrders] = React.useState<Outputs["orders"]["list"]>([])

  const load = React.useCallback(async () => {
    const [i, e, s, c, p, o] = await Promise.all([api.invoices.list.query({ businessId }), api.estimates.list.query({ businessId }), api.subscriptions.list.query({ businessId }), api.customers.list.query({ businessId }), api.products.list.query({ businessId }), api.orders.list.query({ businessId })])
    setInvoices(i); setEstimates(e); setSubscriptions(s); setCustomers(c); setProducts(p); setOrders(o)
  }, [businessId])
  React.useEffect(() => { void load() }, [load])

  async function markPaid(invoiceId: number, amountCents: number) {
    try { await api.invoices.recordPayment.mutate({ businessId, invoiceId, amountCents }); await load(); show("Règlement enregistré.") } catch (error) { show(apiError(error, "Règlement impossible."), "error") }
  }
  async function invoiceStatus(invoiceId: number, status: "sent" | "cancelled") {
    try { await api.invoices.updateStatus.mutate({ businessId, invoiceId, status }); await load(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function estimateStatus(estimateId: number, status: "sent" | "accepted" | "declined") {
    try { await api.estimates.updateStatus.mutate({ businessId, estimateId, status }); await load(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function convertEstimate(estimateId: number) {
    const due = new Date(); due.setDate(due.getDate() + 30)
    try { await api.estimates.convertToInvoice.mutate({ businessId, estimateId, dueAt: due }); await load(); show("Devis converti en facture.") } catch (error) { show(apiError(error, "Conversion impossible."), "error") }
  }
  async function subscriptionStatus(subscriptionId: number, status: "paused" | "active" | "cancelled") {
    try { await api.subscriptions.updateStatus.mutate({ businessId, subscriptionId, status }); await load(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function orderStatus(orderId: number, status: "fulfilled" | "refunded" | "cancelled") {
    try { await api.orders.updateStatus.mutate({ businessId, orderId, status }); await load(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function toggleProduct(productId: number, status: "active" | "archived") {
    try { await api.products.update.mutate({ businessId, productId, status }); await load(); show("Produit mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function toggleCustomer(customerId: number, status: "active" | "blocked") {
    try { await api.customers.update.mutate({ businessId, customerId, status }); await load(); show("Client mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }

  return <>
    <DrawerSection title={`Factures (${invoices.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "N°", render: (row: Outputs["invoices"]["list"][number]) => <span className="font-mono text-xs">{row.number}</span> },
        { header: "Montant", render: (row: Outputs["invoices"]["list"][number]) => money(row.amountCents, row.currency) },
        { header: "Échéance", render: (row: Outputs["invoices"]["list"][number]) => date(row.dueAt) },
        { header: "Statut", render: (row: Outputs["invoices"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["invoices"]["list"][number]) => canOperate ? <div className="flex flex-wrap gap-1">{row.status === "draft" ? <Button className="h-7 px-2 text-xs" onClick={() => void invoiceStatus(row.id, "sent")}>Envoyer</Button> : null}{row.status !== "paid" && row.status !== "cancelled" ? <Button className="h-7 px-2 text-xs" onClick={() => void markPaid(row.id, row.amountCents)}>Marquer payée</Button> : null}{!["paid", "cancelled"].includes(row.status) ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void invoiceStatus(row.id, "cancelled")}>Annuler</Button> : null}</div> : "—" },
      ]} rows={invoices} getRowKey={(row) => row.id} emptyLabel="Aucune facture." />
      {canOperate ? <CreateInvoiceForm businessId={businessId} customers={customers} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Devis (${estimates.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "N°", render: (row: Outputs["estimates"]["list"][number]) => <span className="font-mono text-xs">{row.number}</span> },
        { header: "Montant", render: (row: Outputs["estimates"]["list"][number]) => money(row.amountCents, row.currency) },
        { header: "Validité", render: (row: Outputs["estimates"]["list"][number]) => date(row.validUntil) },
        { header: "Statut", render: (row: Outputs["estimates"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["estimates"]["list"][number]) => canOperate ? <div className="flex flex-wrap gap-1">{row.status === "draft" ? <Button className="h-7 px-2 text-xs" onClick={() => void estimateStatus(row.id, "sent")}>Envoyer</Button> : null}{row.status === "sent" ? <><Button className="h-7 px-2 text-xs" onClick={() => void estimateStatus(row.id, "accepted")}>Accepter</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void estimateStatus(row.id, "declined")}>Refuser</Button></> : null}{row.status === "accepted" && !row.convertedInvoiceId ? <Button className="h-7 px-2 text-xs" onClick={() => void convertEstimate(row.id)}>Convertir en facture</Button> : null}</div> : "—" },
      ]} rows={estimates} getRowKey={(row) => row.id} emptyLabel="Aucun devis." />
      {canOperate ? <CreateEstimateForm businessId={businessId} customers={customers} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Abonnements (${subscriptions.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Plan", render: (row: Outputs["subscriptions"]["list"][number]) => row.planName },
        { header: "Montant", render: (row: Outputs["subscriptions"]["list"][number]) => `${money(row.amountCents, row.currency)} / ${row.interval === "monthly" ? "mois" : "an"}` },
        { header: "Période en cours", render: (row: Outputs["subscriptions"]["list"][number]) => date(row.currentPeriodEnd) },
        { header: "Statut", render: (row: Outputs["subscriptions"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["subscriptions"]["list"][number]) => canOperate ? <div className="flex flex-wrap gap-1">{row.status === "active" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void subscriptionStatus(row.id, "paused")}>Suspendre</Button> : null}{row.status === "paused" ? <Button className="h-7 px-2 text-xs" onClick={() => void subscriptionStatus(row.id, "active")}>Reprendre</Button> : null}{row.status !== "cancelled" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void subscriptionStatus(row.id, "cancelled")}>Résilier</Button> : null}</div> : "—" },
      ]} rows={subscriptions} getRowKey={(row) => row.id} emptyLabel="Aucun abonnement." />
      {canOperate ? <CreateSubscriptionForm businessId={businessId} customers={customers} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Clients (${customers.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Client", render: (row: Outputs["customers"]["list"][number]) => <div><div className="font-medium">{row.name}</div><div className="text-xs text-gray-500">{row.email ?? "—"}</div></div> },
        { header: "Dépensé", render: (row: Outputs["customers"]["list"][number]) => money(row.totalSpentCents) },
        { header: "Commandes", render: (row: Outputs["customers"]["list"][number]) => String(row.ordersCount) },
        { header: "Statut", render: (row: Outputs["customers"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["customers"]["list"][number]) => canOperate ? (row.status === "active" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void toggleCustomer(row.id, "blocked")}>Bloquer</Button> : <Button className="h-7 px-2 text-xs" onClick={() => void toggleCustomer(row.id, "active")}>Débloquer</Button>) : "—" },
      ]} rows={customers} getRowKey={(row) => row.id} emptyLabel="Aucun client." />
      {canOperate ? <CreateCustomerForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Produits (${products.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Produit", render: (row: Outputs["products"]["list"][number]) => row.name },
        { header: "Prix", render: (row: Outputs["products"]["list"][number]) => money(row.priceCents, row.currency) },
        { header: "Stock", render: (row: Outputs["products"]["list"][number]) => String(row.stock) },
        { header: "Statut", render: (row: Outputs["products"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["products"]["list"][number]) => canOperate ? (row.status === "active" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void toggleProduct(row.id, "archived")}>Archiver</Button> : <Button className="h-7 px-2 text-xs" onClick={() => void toggleProduct(row.id, "active")}>Réactiver</Button>) : "—" },
      ]} rows={products} getRowKey={(row) => row.id} emptyLabel="Aucun produit." />
      {canOperate ? <CreateProductForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Commandes (${orders.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "N°", render: (row: Outputs["orders"]["list"][number]) => <span className="font-mono text-xs">{row.number}</span> },
        { header: "Montant", render: (row: Outputs["orders"]["list"][number]) => money(row.amountCents, row.currency) },
        { header: "Canal", render: (row: Outputs["orders"]["list"][number]) => row.channel },
        { header: "Statut", render: (row: Outputs["orders"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["orders"]["list"][number]) => canOperate && !["refunded", "cancelled"].includes(row.status) ? <div className="flex flex-wrap gap-1">{row.status !== "fulfilled" ? <Button className="h-7 px-2 text-xs" onClick={() => void orderStatus(row.id, "fulfilled")}>Expédier</Button> : null}<Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void orderStatus(row.id, "refunded")}>Rembourser</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void orderStatus(row.id, "cancelled")}>Annuler</Button></div> : "—" },
      ]} rows={orders} getRowKey={(row) => row.id} emptyLabel="Aucune commande." />
      {canOperate ? <CreateOrderForm businessId={businessId} customers={customers} products={products} onDone={load} /> : null}
    </DrawerSection>
  </>
}

function CreateOrderForm({ businessId, customers, products, onDone }: { businessId: number; customers: Outputs["customers"]["list"]; products: Outputs["products"]["list"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [customerId, setCustomerId] = React.useState("")
  const [channel, setChannel] = React.useState<"pos" | "online" | "manual">("manual")
  const [productId, setProductId] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [quantity, setQuantity] = React.useState("1")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const qty = Number(quantity); const cents = asCents(amount)
    if (!Number.isInteger(qty) || qty <= 0 || !cents || description.trim().length < 1) return show("Description, quantité et prix unitaire requis.", "error")
    setBusy(true)
    const cid = customerId.trim() ? Number(customerId) : undefined
    const pid = productId.trim() ? Number(productId) : undefined
    try { await api.orders.create.mutate({ businessId, customerId: cid, channel, items: [{ productId: pid, description: description.trim(), quantity: qty, unitPriceCents: cents }] }); await onDone(); show("Commande créée."); setDescription(""); setAmount(""); setQuantity("1") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouvelle commande</p><div className="grid grid-cols-3 gap-2"><select aria-label="Client" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Client (facultatif)…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Canal" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={channel} onChange={(e) => setChannel(e.target.value as "pos" | "online" | "manual")}><option value="manual">Manuel</option><option value="pos">Point de vente</option><option value="online">En ligne</option></select><select aria-label="Produit" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Produit (facultatif)…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="mt-2 grid grid-cols-3 gap-2"><Input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" /><Input aria-label="Quantité" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantité" inputMode="numeric" /><Input aria-label="Prix unitaire" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Prix unitaire (${entrySymbol()})`} inputMode="decimal" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateEstimateForm({ businessId, customers, onDone }: { businessId: number; customers: Outputs["customers"]["list"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [customerId, setCustomerId] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cid = Number(customerId); const cents = asCents(amount)
    if (!Number.isInteger(cid) || cid <= 0 || !cents) return show("Client et montant requis.", "error")
    setBusy(true)
    try { await api.estimates.create.mutate({ businessId, customerId: cid, items: [{ description: description.trim() || "Prestation", quantity: 1, unitPriceCents: cents }] }); await onDone(); show("Devis créé."); setAmount(""); setDescription("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau devis</p><div className="grid grid-cols-3 gap-2"><select aria-label="Client" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Client…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Input aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Montant (${entrySymbol()})`} inputMode="decimal" /><Input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateSubscriptionForm({ businessId, customers, onDone }: { businessId: number; customers: Outputs["customers"]["list"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [customerId, setCustomerId] = React.useState("")
  const [planName, setPlanName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [interval, setInterval_] = React.useState<"monthly" | "yearly">("monthly")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cid = Number(customerId); const cents = asCents(amount)
    if (!Number.isInteger(cid) || cid <= 0 || planName.trim().length < 2 || !cents) return show("Client, plan et montant requis.", "error")
    setBusy(true)
    try { await api.subscriptions.create.mutate({ businessId, customerId: cid, planName: planName.trim(), amountCents: cents, interval }); await onDone(); show("Abonnement créé."); setPlanName(""); setAmount("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouvel abonnement</p><div className="grid grid-cols-2 gap-2"><select aria-label="Client" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Client…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Input aria-label="Nom du plan" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan" /><Input aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Montant (${entrySymbol()})`} inputMode="decimal" /><select aria-label="Périodicité" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={interval} onChange={(e) => setInterval_(e.target.value as typeof interval)}><option value="monthly">Mensuel</option><option value="yearly">Annuel</option></select></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateInvoiceForm({ businessId, customers, onDone }: { businessId: number; customers: Outputs["customers"]["list"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [customerId, setCustomerId] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [dueAt, setDueAt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cid = Number(customerId); const cents = asCents(amount); const due = new Date(dueAt)
    if (!Number.isInteger(cid) || cid <= 0 || !cents || Number.isNaN(due.getTime())) return show("Client, montant et échéance requis.", "error")
    setBusy(true)
    try { await api.invoices.create.mutate({ businessId, customerId: cid, dueAt: due, description: description.trim() || undefined, items: [{ description: description.trim() || "Prestation", quantity: 1, unitPriceCents: cents }] }); await onDone(); show("Facture créée."); setAmount(""); setDescription("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouvelle facture</p><div className="grid grid-cols-2 gap-2"><select aria-label="Client" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Client…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Input aria-label="Échéance" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /><Input aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Montant (${entrySymbol()})`} inputMode="decimal" /><Input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateCustomerForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    if (name.trim().length < 2) return show("Nom requis.", "error")
    setBusy(true)
    try { await api.customers.create.mutate({ businessId, name: name.trim(), email: email.trim() || undefined }); await onDone(); show("Client créé."); setName(""); setEmail("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau client</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" /><Input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateProductForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [name, setName] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [stock, setStock] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cents = asCents(price)
    if (name.trim().length < 2 || !cents) return show("Nom et prix requis.", "error")
    setBusy(true)
    try { await api.products.create.mutate({ businessId, name: name.trim(), priceCents: cents, stock: Number(stock) || 0 }); await onDone(); show("Produit créé."); setName(""); setPrice(""); setStock("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau produit</p><div className="grid grid-cols-3 gap-2"><Input aria-label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" /><Input aria-label="Prix" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Prix (${entrySymbol()})`} inputMode="decimal" /><Input aria-label="Stock" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock" inputMode="numeric" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

/* ────────────────  Paiements : liens & payouts  ──────────────── */

function PaymentsTab({ businessId, canOperate, onChanged }: { businessId: number; canOperate: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const { money } = useMoney()
  const [links, setLinks] = React.useState<Outputs["paymentLinks"]["list"]>([])
  const [payouts, setPayouts] = React.useState<Outputs["payouts"]["list"]>([])
  const [batches, setBatches] = React.useState<Outputs["payouts"]["listBatches"]>([])
  const [accountId, setAccountId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    const [l, p, b, accounts] = await Promise.all([api.paymentLinks.list.query({ businessId }), api.payouts.list.query({ businessId }), api.payouts.listBatches.query({ businessId }), api.wallet.accounts.query({ businessId })])
    setLinks(l); setPayouts(p); setBatches(b); setAccountId(accounts[0]?.id ?? null)
  }, [businessId])
  React.useEffect(() => { void load() }, [load])

  async function decidePayout(payoutId: number, decision: "approve" | "reject") {
    try {
      if (decision === "approve") await api.payouts.approve.mutate({ businessId, payoutId })
      else await api.payouts.reject.mutate({ businessId, payoutId })
      await load(); await onChanged(); show("Décision enregistrée.")
    } catch (error) { show(apiError(error, "Décision impossible."), "error") }
  }
  async function linkStatus(linkId: number, status: "active" | "expired") {
    try { await api.paymentLinks.updateStatus.mutate({ businessId, linkId, status }); await load(); show("Statut mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }

  return <>
    <DrawerSection title={`Liens de paiement (${links.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Lien", render: (row: Outputs["paymentLinks"]["list"][number]) => row.name },
        { header: "Montant", render: (row: Outputs["paymentLinks"]["list"][number]) => money(row.amountCents, row.currency) },
        { header: "Visites", render: (row: Outputs["paymentLinks"]["list"][number]) => String(row.visits) },
        { header: "Payé", render: (row: Outputs["paymentLinks"]["list"][number]) => `${row.paid} · ${money(row.revenueCents)}` },
        { header: "Statut", render: (row: Outputs["paymentLinks"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["paymentLinks"]["list"][number]) => canOperate ? (row.status === "active" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void linkStatus(row.id, "expired")}>Désactiver</Button> : row.status !== "expired" ? "—" : <Button className="h-7 px-2 text-xs" onClick={() => void linkStatus(row.id, "active")}>Réactiver</Button>) : "—" },
      ]} rows={links} getRowKey={(row) => row.id} emptyLabel="Aucun lien." />
      {canOperate ? <CreatePaymentLinkForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Payouts (${payouts.length})`}>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Bénéficiaire", render: (row: Outputs["payouts"]["list"][number]) => row.beneficiaryName },
        { header: "Montant", render: (row: Outputs["payouts"]["list"][number]) => money(row.amountCents, row.currency) },
        { header: "Lot", render: (row: Outputs["payouts"]["list"][number]) => row.batchId ? `#${row.batchId}` : "—" },
        { header: "Statut", render: (row: Outputs["payouts"]["list"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["payouts"]["list"][number]) => canOperate && row.status === "pending_approval" ? <div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void decidePayout(row.id, "approve")}>Valider</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decidePayout(row.id, "reject")}>Refuser</Button></div> : "—" },
      ]} rows={payouts} getRowKey={(row) => row.id} emptyLabel="Aucun payout." />
      {canOperate && accountId ? <CreatePayoutForm businessId={businessId} accountId={accountId} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Payer en masse — lots (${batches.length})`}>
      <DataTable mobileBreakpoint="md" columns={[
        { header: "Lot", render: (row: Outputs["payouts"]["listBatches"][number]) => row.label },
        { header: "Total", render: (row: Outputs["payouts"]["listBatches"][number]) => money(row.totalCents) },
        { header: "Lignes", render: (row: Outputs["payouts"]["listBatches"][number]) => String(row.itemsCount) },
        { header: "Statut", render: (row: Outputs["payouts"]["listBatches"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
      ]} rows={batches} getRowKey={(row) => row.id} emptyLabel="Aucun lot de payout." />
      {canOperate ? <CreatePayoutBatchForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
  </>
}

function CreatePayoutBatchForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [label, setLabel] = React.useState("")
  const [rows, setRows] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    if (label.trim().length < 2) return show("Nom du lot requis.", "error")
    const items = rows.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [beneficiaryName, iban, amount] = line.split(",").map((part) => part.trim())
      return { beneficiaryName: beneficiaryName ?? "", iban: iban ?? "", amountCents: asCents(amount ?? "0") }
    })
    if (items.length === 0 || items.some((item) => item.beneficiaryName.length < 2 || item.iban.length < 15 || item.amountCents <= 0)) return show("Format attendu par ligne : Bénéficiaire, IBAN, Montant.", "error")
    setBusy(true)
    try { await api.payouts.createBatch.mutate({ businessId, label: label.trim(), items }); await onDone(); show(`Lot créé (${items.length} lignes) — approbation requise.`); setLabel(""); setRows("") } catch (error) { show(apiError(error, "Création du lot impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau lot — Payer en masse</p><Input aria-label="Nom du lot" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom du lot (ex. Fournisseurs Q3)" /><textarea aria-label="Lignes du lot" className="mt-2 h-24 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-950" value={rows} onChange={(e) => setRows(e.target.value)} placeholder={"Une ligne par bénéficiaire :\nNom, IBAN, Montant"} /><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer le lot"}</Button></div>
}

function CreatePaymentLinkForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [name, setName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [mode, setMode] = React.useState<"unique" | "recurring">("unique")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cents = asCents(amount)
    if (name.trim().length < 2 || !cents) return show("Nom et montant requis.", "error")
    setBusy(true)
    try { await api.paymentLinks.create.mutate({ businessId, name: name.trim(), amountCents: cents, mode }); await onDone(); show("Lien créé."); setName(""); setAmount("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau lien</p><div className="grid grid-cols-3 gap-2"><Input aria-label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" /><Input aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Montant (${entrySymbol()})`} inputMode="decimal" /><select aria-label="Mode" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="unique">Unique</option><option value="recurring">Récurrent</option></select></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreatePayoutForm({ businessId, accountId, onDone }: { businessId: number; accountId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [beneficiaryName, setBeneficiaryName] = React.useState("")
  const [iban, setIban] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const cents = asCents(amount)
    if (beneficiaryName.trim().length < 2 || iban.trim().length < 15 || !cents) return show("Bénéficiaire, IBAN et montant requis.", "error")
    setBusy(true)
    try { await api.payouts.create.mutate({ businessId, businessWalletAccountId: accountId, beneficiaryName: beneficiaryName.trim(), iban: iban.trim(), amountCents: cents }); await onDone(); show("Payout créé — approbation requise."); setBeneficiaryName(""); setIban(""); setAmount("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau payout</p><div className="grid grid-cols-3 gap-2"><Input aria-label="Bénéficiaire" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="Bénéficiaire" /><Input aria-label="IBAN" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN" /><Input aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Montant (${entrySymbol()})`} inputMode="decimal" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

/* ────────────────  Résolution : litiges, chargebacks, risque  ──────────────── */

function ResolutionTab({ businessId, canOperate, onChanged }: { businessId: number; canOperate: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const { money } = useMoney()
  const [disputes, setDisputes] = React.useState<Outputs["resolution"]["listDisputes"]>([])
  const [chargebacks, setChargebacks] = React.useState<Outputs["resolution"]["listChargebacks"]>([])
  const [riskFlags, setRiskFlags] = React.useState<Outputs["resolution"]["listRiskFlags"]>([])
  const load = React.useCallback(async () => {
    const [d, c, r] = await Promise.all([api.resolution.listDisputes.query({ businessId }), api.resolution.listChargebacks.query({ businessId }), api.resolution.listRiskFlags.query({ businessId })])
    setDisputes(d); setChargebacks(c); setRiskFlags(r)
  }, [businessId])
  React.useEffect(() => { void load() }, [load])
  async function resolveFlag(flagId: number, status: "dismissed" | "confirmed") {
    try { await api.resolution.resolveRiskFlag.mutate({ businessId, flagId, status }); await load(); await onChanged(); show("Signal traité.") } catch (error) { show(apiError(error, "Action impossible."), "error") }
  }
  async function decideDispute(disputeId: number, status: "under_review" | "won" | "lost") {
    try { await api.resolution.updateDisputeStatus.mutate({ businessId, disputeId, status }); await load(); await onChanged(); show("Litige mis à jour.") } catch (error) { show(apiError(error, "Action impossible."), "error") }
  }
  async function decideChargeback(chargebackId: number, status: "accepted" | "represented" | "won" | "lost") {
    try { await api.resolution.updateChargebackStatus.mutate({ businessId, chargebackId, status }); await load(); await onChanged(); show("Chargeback mis à jour.") } catch (error) { show(apiError(error, "Action impossible."), "error") }
  }
  return <>
    <DrawerSection title={`Litiges (${disputes.length})`}>
      <DataTable mobileBreakpoint="md" columns={[
        { header: "Motif", render: (row: Outputs["resolution"]["listDisputes"][number]) => row.reason },
        { header: "Montant", render: (row: Outputs["resolution"]["listDisputes"][number]) => money(row.amountCents, row.currency) },
        { header: "Statut", render: (row: Outputs["resolution"]["listDisputes"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["resolution"]["listDisputes"][number]) => canOperate && row.status === "open" ? <div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void decideDispute(row.id, "under_review")}>Instruire</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decideDispute(row.id, "won")}>Gagné</Button><Button variant="destructive" className="h-7 px-2 text-xs" onClick={() => void decideDispute(row.id, "lost")}>Perdu</Button></div> : row.status === "under_review" ? <div className="flex gap-1"><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decideDispute(row.id, "won")}>Gagné</Button><Button variant="destructive" className="h-7 px-2 text-xs" onClick={() => void decideDispute(row.id, "lost")}>Perdu</Button></div> : "—" },
      ]} rows={disputes} getRowKey={(row) => row.id} emptyLabel="Aucun litige." />
    </DrawerSection>
    <DrawerSection title={`Chargebacks (${chargebacks.length})`}>
      <DataTable mobileBreakpoint="md" columns={[
        { header: "Réseau", render: (row: Outputs["resolution"]["listChargebacks"][number]) => row.network.toUpperCase() },
        { header: "Montant", render: (row: Outputs["resolution"]["listChargebacks"][number]) => money(row.amountCents, row.currency) },
        { header: "Statut", render: (row: Outputs["resolution"]["listChargebacks"][number]) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: Outputs["resolution"]["listChargebacks"][number]) => canOperate && row.status === "open" ? <div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void decideChargeback(row.id, "accepted")}>Accepter</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decideChargeback(row.id, "represented")}>Représenter</Button></div> : row.status === "represented" ? <div className="flex gap-1"><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void decideChargeback(row.id, "won")}>Gagné</Button><Button variant="destructive" className="h-7 px-2 text-xs" onClick={() => void decideChargeback(row.id, "lost")}>Perdu</Button></div> : "—" },
      ]} rows={chargebacks} getRowKey={(row) => row.id} emptyLabel="Aucun chargeback." />
    </DrawerSection>
    <DrawerSection title={`Signaux de risque (${riskFlags.length})`}>
      <div className="space-y-2">{riskFlags.length === 0 ? <p className="text-sm text-gray-500">Aucun signal.</p> : riskFlags.map((f) => <div key={f.id} className="flex items-center justify-between rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><span>{f.description} · {f.severity}</span>{canOperate && f.status === "open" ? <div className="flex gap-1"><Button className="h-7 px-2 text-xs" onClick={() => void resolveFlag(f.id, "confirmed")}>Confirmer</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void resolveFlag(f.id, "dismissed")}>Ignorer</Button></div> : <Badge variant={statusVariant(f.status)}>{f.status}</Badge>}</div>)}</div>
    </DrawerSection>
  </>
}

/* ────────────────  Developers : API keys, webhooks  ──────────────── */

function DevelopersTab({ businessId, canOperate }: { businessId: number; canOperate: boolean }) {
  const { show } = useToast()
  const [keys, setKeys] = React.useState<Outputs["developers"]["listApiKeys"]>([])
  const [hooks, setHooks] = React.useState<Outputs["developers"]["listWebhooks"]>([])
  const [apps, setApps] = React.useState<Outputs["developers"]["listApplications"]>([])
  const [openDeliveries, setOpenDeliveries] = React.useState<number | null>(null)
  const [deliveries, setDeliveries] = React.useState<Outputs["developers"]["listWebhookDeliveries"]>([])
  const load = React.useCallback(async () => {
    const [k, h, a] = await Promise.all([api.developers.listApiKeys.query({ businessId }), api.developers.listWebhooks.query({ businessId }), api.developers.listApplications.query({ businessId })])
    setKeys(k); setHooks(h); setApps(a)
  }, [businessId])
  React.useEffect(() => { void load() }, [load])
  async function toggleHook(webhookId: number, status: "active" | "disabled") {
    try { await api.developers.toggleWebhook.mutate({ businessId, webhookId, status }); await load(); show("Webhook mis à jour.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") }
  }
  async function revokeApp(applicationId: number) {
    try { await api.developers.revokeApplication.mutate({ businessId, applicationId }); await load(); show("Application révoquée.") } catch (error) { show(apiError(error, "Révocation impossible."), "error") }
  }
  async function viewDeliveries(webhookId: number) {
    try { const next = await api.developers.listWebhookDeliveries.query({ businessId, webhookId }); setDeliveries(next); setOpenDeliveries(webhookId) } catch (error) { show(apiError(error, "Journal indisponible."), "error") }
  }
  return <>
    <DrawerSection title={`Clés API (${keys.length})`}>
      <div className="space-y-2">{keys.map((k) => <div key={k.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><span className="font-mono">{k.keyPrefix}••••</span><span>{k.mode === "live" ? "Production" : "Test"} · {k.scopes.length} droit{k.scopes.length > 1 ? "s" : ""}</span><Badge variant={k.state === "active" ? "success" : k.state === "revoked" ? "error" : "neutral"}>{k.state === "active" ? "Active" : k.state === "revoked" ? "Révoquée" : k.state === "expired" ? "Expirée" : "À recréer"}</Badge><a className="underline" href={`/cles-api?cle=${k.id}`}>Fiche</a></div>)}</div>
      <p className="text-xs text-gray-500">Le titulaire crée ses clés depuis Wallet Pro ; le secret n'est jamais visible ici. Pour révoquer une clé compromise, ouvrez sa fiche dans « Clés API » (motif journalisé).</p>
    </DrawerSection>
    <DrawerSection title={`Applications (${apps.length})`}>
      <div className="space-y-2">{apps.map((a) => <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><span>{a.name} · <span className="font-mono">{a.clientId}</span></span><Badge variant={statusVariant(a.status)}>{a.status}</Badge>{canOperate && a.status === "active" ? <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => void revokeApp(a.id)}>Révoquer</Button> : null}</div>)}</div>
      {canOperate ? <CreateApplicationForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
    <DrawerSection title={`Webhooks (${hooks.length})`}>
      <div className="space-y-2">{hooks.map((h) => <div key={h.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800"><div className="flex items-center justify-between"><span className="truncate">{h.url}</span><Badge variant={statusVariant(h.status)}>{h.status}</Badge></div><div className="mt-1 flex gap-1">{canOperate ? (h.status === "active" ? <Button variant="secondary" className="h-6 px-2 text-xs" onClick={() => void toggleHook(h.id, "disabled")}>Désactiver</Button> : <Button className="h-6 px-2 text-xs" onClick={() => void toggleHook(h.id, "active")}>Activer</Button>) : null}<Button variant="secondary" className="h-6 px-2 text-xs" onClick={() => void viewDeliveries(h.id)}>Journal de livraisons</Button></div>
        {openDeliveries === h.id ? <div className="mt-2 max-h-32 space-y-1 overflow-auto border-t border-gray-200 pt-2 dark:border-gray-800">{deliveries.length === 0 ? <p className="text-gray-500">Aucune livraison enregistrée.</p> : deliveries.map((d) => <div key={d.id} className="flex items-center justify-between"><span>{d.event}</span><span>{d.statusCode ?? "—"} · {d.success ? "OK" : "Échec"}</span></div>)}</div> : null}
      </div>)}</div>
      {canOperate ? <CreateWebhookForm businessId={businessId} onDone={load} /> : null}
    </DrawerSection>
  </>
}

function CreateApplicationForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [name, setName] = React.useState("")
  const [redirectUri, setRedirectUri] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    if (name.trim().length < 2) return show("Nom requis.", "error")
    try { new URL(redirectUri) } catch { return show("URI de redirection invalide.", "error") }
    setBusy(true)
    try { const result = await api.developers.createApplication.mutate({ businessId, name: name.trim(), redirectUris: [redirectUri.trim()] }); await onDone(); show(`Application créée — client secret : ${result.clientSecret} (à copier maintenant)`); setName(""); setRedirectUri("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouvelle application</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" /><Input aria-label="URI de redirection" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="https://…/callback" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function CreateWebhookForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    try { new URL(url) } catch { return show("URL invalide.", "error") }
    setBusy(true)
    try { await api.developers.createWebhook.mutate({ businessId, url: url.trim(), events: ["payment.completed", "invoice.paid"] }); await onDone(); show("Webhook créé."); setUrl("") } catch (error) { show(apiError(error, "Création impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Nouveau webhook</p><Input aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

/* ────────────────  Paramètres  ──────────────── */

function SettingsTab({ businessId, canOperate, onChanged }: { businessId: number; canOperate: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [settings, setSettings] = React.useState<Outputs["businesses"]["settings"] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [invoicePrefix, setInvoicePrefix] = React.useState("")
  const [checkoutColor, setCheckoutColor] = React.useState("")
  const [defaultCurrency, setDefaultCurrency] = React.useState<"EUR" | "USD" | "XPF">("EUR")
  const [sessionTimeout, setSessionTimeout] = React.useState("")
  const [ipAllowlist, setIpAllowlist] = React.useState("")
  React.useEffect(() => { api.businesses.settings.query({ businessId }).then((s) => { setSettings(s); setInvoicePrefix(s.invoicePrefix); setCheckoutColor(s.checkoutBrandColor); setDefaultCurrency(s.defaultCurrency as "EUR" | "USD" | "XPF"); setSessionTimeout(String(s.sessionTimeoutMinutes)); setIpAllowlist((s.ipAllowlist ?? []).join(", ")) }).catch(() => setSettings(null)) }, [businessId])
  async function save(patch: Omit<Parameters<typeof api.businesses.updateSettings.mutate>[0], "businessId">) {
    setBusy(true)
    try { const next = await api.businesses.updateSettings.mutate({ businessId, ...patch }); setSettings(next); await onChanged(); show("Paramètres enregistrés.") } catch (error) { show(apiError(error, "Mise à jour impossible."), "error") } finally { setBusy(false) }
  }
  if (!settings) return <p className="text-sm text-gray-500">Chargement des paramètres…</p>
  return <>
    <DrawerSection title="Facturation & finance">
      {canOperate ? <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="biz-invoice-prefix">Préfixe facture</Label><Input id="biz-invoice-prefix" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} /></div>
          <div><Label htmlFor="biz-default-currency">Devise par défaut</Label><select id="biz-default-currency" className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value as typeof defaultCurrency)}><option value="EUR">€ Euro</option><option value="USD">$ Dollar</option><option value="XPF">₣ Franc Pacifique</option></select></div>
        </div>
        <div><Label htmlFor="biz-checkout-color">Couleur de marque checkout</Label><div className="flex items-center gap-2"><input id="biz-checkout-color" type="color" value={checkoutColor} onChange={(e) => setCheckoutColor(e.target.value)} className="h-9 w-14 rounded border border-gray-200 dark:border-gray-800" /><Input aria-label="Couleur hexadécimale" value={checkoutColor} onChange={(e) => setCheckoutColor(e.target.value)} /></div></div>
        <Button className="h-8 text-xs" disabled={busy} onClick={() => void save({ invoicePrefix: invoicePrefix.trim(), defaultCurrency, checkoutBrandColor: checkoutColor })}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </div> : <><DrawerRow label="Préfixe facture" value={settings.invoicePrefix} /><DrawerRow label="Devise par défaut" value={settings.defaultCurrency} /></>}
    </DrawerSection>
    <DrawerSection title="Notifications">
      <label className="flex items-center justify-between text-sm"><span>Email</span><input type="checkbox" checked={settings.notifyEmail} disabled={!canOperate || busy} onChange={(e) => void save({ notifyEmail: e.target.checked })} /></label>
      <label className="flex items-center justify-between text-sm"><span>SMS</span><input type="checkbox" checked={settings.notifySms} disabled={!canOperate || busy} onChange={(e) => void save({ notifySms: e.target.checked })} /></label>
      <label className="flex items-center justify-between text-sm"><span>Push</span><input type="checkbox" checked={settings.notifyPush} disabled={!canOperate || busy} onChange={(e) => void save({ notifyPush: e.target.checked })} /></label>
    </DrawerSection>
    <DrawerSection title="Sécurité">
      <label className="flex items-center justify-between text-sm"><span>2FA obligatoire pour l’équipe</span><input type="checkbox" checked={settings.require2fa} disabled={!canOperate || busy} onChange={(e) => void save({ require2fa: e.target.checked })} /></label>
      {canOperate ? <div className="space-y-2 pt-1">
        <div><Label htmlFor="biz-session-timeout">Expiration de session (minutes)</Label><Input id="biz-session-timeout" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} inputMode="numeric" /></div>
        <div><Label htmlFor="biz-ip-allowlist">Liste blanche IP (séparées par virgules)</Label><Input id="biz-ip-allowlist" value={ipAllowlist} onChange={(e) => setIpAllowlist(e.target.value)} placeholder="Aucune restriction" /></div>
        <Button className="h-8 text-xs" disabled={busy} onClick={() => void save({ sessionTimeoutMinutes: Number(sessionTimeout) || 60, ipAllowlist: ipAllowlist.split(",").map((s) => s.trim()).filter(Boolean) })}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </div> : <><DrawerRow label="Expiration de session" value={`${settings.sessionTimeoutMinutes} min`} /><DrawerRow label="Liste blanche IP" value={(settings.ipAllowlist ?? []).length ? (settings.ipAllowlist ?? []).join(", ") : "Aucune restriction"} /></>}
    </DrawerSection>
  </>
}
