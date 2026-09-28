"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/Dialog"
import { DataTable } from "@/components/admin/DataTable"
import { FilterBar } from "@/components/admin/FilterBar"
import { DrawerRow, DrawerSection, ModuleDrawer } from "@/components/admin/ModuleDrawer"
import { useToast } from "@/components/admin/Toast"
import { canUseDashboard, isAdmin } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { useMoney } from "@/lib/displayCurrency"
import { convert, format, type Currency } from "@vtex/money"

type Outputs = inferRouterOutputs<AppRouter>
type StripeStatus = Outputs["walletAdmin"]["stripeStatus"]
type WalletTopupRow = Outputs["walletAdmin"]["topups"][number]
type BusinessTopupRow = Outputs["businessAdmin"]["topups"][number]
type TopupStatus = WalletTopupRow["status"]
type Scope = "wallet" | "business"

/** Ligne unifiée : une recharge du wallet perso ou du Wallet Pro, présentée dans le même tableau. */
type Row = {
  key: string
  scope: Scope
  reference: string
  createdAt: Date | string
  creditedAt: Date | string | null
  refundedAt: Date | string | null
  refundReason: string | null
  who: string
  detail: string
  amountCents: number
  currency: string
  status: TopupStatus
  mode: "sim" | "test" | "live"
  cardBrand: string | null
  cardLast4: string | null
  failureCode: string | null
  failureMessage: string | null
  paymentIntentId: string | null
}

const STATUS_LABEL: Record<TopupStatus, string> = {
  pending: "En attente",
  requires_action: "Validation bancaire",
  processing: "En cours",
  succeeded: "Créditée",
  failed: "Refusée",
  canceled: "Annulée",
  refunded: "Remboursée",
}
const MODE_LABEL = { sim: "Simulation", test: "Test Stripe", live: "Stripe réel" } as const

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}
function apiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function statusVariant(status: TopupStatus): "success" | "warning" | "error" | "neutral" {
  if (status === "succeeded") return "success"
  if (status === "pending" || status === "requires_action" || status === "processing") return "warning"
  if (status === "failed") return "error"
  return "neutral"
}
function cardLabel(row: Pick<Row, "cardBrand" | "cardLast4">) {
  return row.cardLast4 ? `${(row.cardBrand ?? "carte").toUpperCase()} •••• ${row.cardLast4}` : "—"
}

function toRows(wallet: WalletTopupRow[], business: BusinessTopupRow[]): Row[] {
  const rows: Row[] = [
    ...wallet.map((r): Row => ({
      key: `w-${r.id}`, scope: "wallet", reference: r.reference, createdAt: r.createdAt, creditedAt: r.creditedAt, refundedAt: r.refundedAt, refundReason: r.refundReason,
      who: r.userName, detail: r.userEmail, amountCents: r.amountCents, currency: r.currency, status: r.status, mode: r.mode, cardBrand: r.cardBrand, cardLast4: r.cardLast4,
      failureCode: r.failureCode, failureMessage: r.failureMessage, paymentIntentId: r.stripePaymentIntentId,
    })),
    ...business.map((r): Row => ({
      key: `b-${r.id}`, scope: "business", reference: r.reference, createdAt: r.createdAt, creditedAt: r.creditedAt, refundedAt: r.refundedAt, refundReason: r.refundReason,
      who: r.businessName, detail: `par ${r.initiatedByName}${r.billingName ? ` · ${r.billingName}` : ""}`, amountCents: r.amountCents, currency: r.currency, status: r.status, mode: r.mode,
      cardBrand: r.cardBrand, cardLast4: r.cardLast4, failureCode: r.failureCode, failureMessage: r.failureMessage, paymentIntentId: r.stripePaymentIntentId,
    })),
  ]
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export default function RechargesPage() {
  const { show } = useToast()
  const { money, display } = useMoney()
  const [rows, setRows] = React.useState<Row[]>([])
  const [stripe, setStripe] = React.useState<StripeStatus | null>(null)
  const [currentUser, setCurrentUser] = React.useState<Outputs["users"]["getMe"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [scope, setScope] = React.useState<"all" | Scope>("all")
  const [status, setStatus] = React.useState<"all" | TopupStatus>("all")
  const [selected, setSelected] = React.useState<Row | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [refundOpen, setRefundOpen] = React.useState(false)
  const [refundReason, setRefundReason] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const [wallet, business, status] = await Promise.all([
      api.walletAdmin.topups.query({ limit: 500 }),
      api.businessAdmin.topups.query({ limit: 500 }),
      api.walletAdmin.stripeStatus.query(),
    ])
    const next = toRows(wallet, business)
    setRows(next)
    setStripe(status)
    setSelected((current) => (current ? next.find((r) => r.key === current.key) ?? null : null))
  }, [])

  React.useEffect(() => {
    setLoading(true)
    api.users.getMe.query().then((user) => {
      setCurrentUser(user)
      if (user.role === "user") return
      return refresh()
    }).catch((error) => show(apiError(error, "Impossible de charger les recharges."), "error")).finally(() => setLoading(false))
  }, [refresh, show])

  const canOperate = canUseDashboard(currentUser?.role ?? "user")
  const canRefund = isAdmin(currentUser?.role)

  const filtered = React.useMemo(() => rows.filter((r) => {
    if (scope !== "all" && r.scope !== scope) return false
    if (status !== "all" && r.status !== status) return false
    const q = search.trim().toLowerCase()
    return q === "" || `${r.reference} ${r.who} ${r.detail} ${r.cardLast4 ?? ""}`.toLowerCase().includes(q)
  }), [rows, scope, status, search])

  const kpis = React.useMemo(() => {
    const credited = rows.filter((r) => r.status === "succeeded")
    // Euro et franc Pacifique s'additionnent dans la devise d'affichage (parité fixe) ; le dollar reste à part.
    const volume = new Map<string, number>()
    for (const r of credited) {
      const key = r.currency === "USD" ? "USD" : display
      const amount = r.currency === "USD" ? r.amountCents : convert(r.amountCents, r.currency as Currency, display)
      volume.set(key, (volume.get(key) ?? 0) + amount)
    }
    const volumeLabel = volume.size === 0 ? money(0, display) : [...volume.entries()].map(([cur, cents]) => money(cents, cur)).join(" · ")
    return {
      volumeLabel,
      credited: credited.length,
      open: rows.filter((r) => ["pending", "requires_action", "processing"].includes(r.status)).length,
      failed: rows.filter((r) => r.status === "failed").length,
      refunded: rows.filter((r) => r.status === "refunded").length,
    }
  }, [rows, display, money])

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try { await action(); await refresh(); show(done) } catch (error) { show(apiError(error, "Action impossible."), "error") } finally { setBusy(false) }
  }
  function reconcile(row: Row) {
    void run(() => row.scope === "wallet" ? api.walletAdmin.reconcileTopup.mutate({ reference: row.reference }) : api.businessAdmin.reconcileTopup.mutate({ reference: row.reference }), "État relu auprès du prestataire de paiement.")
  }
  function cancel(row: Row) {
    void run(() => row.scope === "wallet" ? api.walletAdmin.cancelTopup.mutate({ reference: row.reference }) : api.businessAdmin.cancelTopup.mutate({ reference: row.reference }), "Recharge annulée et journalisée.")
  }
  function refund(row: Row) {
    const reason = refundReason.trim()
    if (reason.length < 8) return show("Une justification d’au moins huit caractères est requise.", "error")
    void run(async () => {
      if (row.scope === "wallet") await api.walletAdmin.refundTopup.mutate({ reference: row.reference, reason })
      else await api.businessAdmin.refundTopup.mutate({ reference: row.reference, reason })
      setRefundOpen(false)
      setRefundReason("")
    }, "Recharge remboursée : le solde a été débité et le remboursement journalisé.")
  }

  if (!loading && currentUser?.role === "user") {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"><h1 className="text-lg font-semibold">Accès restreint</h1><p className="mt-2">Le suivi des recharges est réservé aux rôles opérateur et administrateur.</p></div>
  }

  const open = (row: Row) => { setSelected(row); setRefundReason("") }

  return <div className="dashboard-home">
    <header className="dashboard-page-header">
      <div className="dashboard-page-intro">
        <p className="dashboard-kicker">VTEX · Dashboard</p>
        <h1>Recharges par carte</h1>
        <p>Chaque recharge du wallet personnel et du Wallet Pro par carte bancaire (Stripe) : statut, carte utilisée, écriture au ledger, réconciliation et remboursement.</p>
      </div>
      <div className="dashboard-header-actions">
        <Button variant="secondary" onClick={() => void refresh().then(() => show("Liste actualisée.")).catch((error) => show(apiError(error, "Rafraîchissement impossible."), "error"))}>Rafraîchir</Button>
      </div>
    </header>

    {stripe ? <StripeCallout stripe={stripe} /> : null}

    <section className="dashboard-kpi-grid" aria-label="Indicateurs des recharges">
      <MetricTile label="Volume crédité" value={kpis.volumeLabel} detail={`${kpis.credited} recharge${kpis.credited > 1 ? "s" : ""} créditée${kpis.credited > 1 ? "s" : ""}`} tone="green" />
      <MetricTile label="En cours" value={String(kpis.open)} detail="En attente, 3-D Secure ou traitement" tone="amber" />
      <MetricTile label="Refusées" value={String(kpis.failed)} detail="Carte refusée, expirée ou fonds insuffisants" tone="brick" />
      <MetricTile label="Remboursées" value={String(kpis.refunded)} detail="Débitées du wallet, remboursées sur la carte" tone="violet" />
    </section>

    <section className="space-y-3">
      <div className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Journal des recharges</span><h2>Toutes les recharges</h2><p>Wallets personnels et Wallet Pro dans un même tableau. Ouvrez une ligne pour agir.</p></div></div>
        <div className="mb-3 space-y-2">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Référence, titulaire, entreprise, carte…"
            filters={[{ label: "Tous", value: "all" }, { label: "Wallet perso", value: "wallet" }, { label: "Wallet Pro", value: "business" }]}
            activeFilter={scope}
            onFilterChange={(value) => setScope(value as "all" | Scope)}
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut">
            {(["all", "succeeded", "pending", "requires_action", "failed", "canceled", "refunded"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setStatus(value)} aria-pressed={status === value} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${status === value ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-400"}`}>{value === "all" ? "Tous les statuts" : STATUS_LABEL[value]}</button>
            ))}
          </div>
        </div>
        <DataTable mobileBreakpoint="lg" columns={[
          { header: "Date", render: (row: Row) => dateTime(row.createdAt) },
          { header: "Portefeuille", render: (row: Row) => <div><div className="font-medium">{row.who}</div><div className="text-xs text-gray-500">{row.scope === "wallet" ? "Wallet perso" : "Wallet Pro"} · {row.detail}</div></div> },
          { header: "Référence", render: (row: Row) => <span className="font-mono text-xs">{row.reference}</span> },
          { header: "Carte", render: (row: Row) => <span className="text-xs">{cardLabel(row)}</span> },
          { header: "Montant", render: (row: Row) => row.status === "succeeded"
            ? <span className="tabular-nums font-medium">+{money(row.amountCents, row.currency)}</span>
            : <span className={`tabular-nums text-gray-500${["failed", "canceled", "refunded"].includes(row.status) ? " line-through" : ""}`}>{money(row.amountCents, row.currency)}</span> },
          { header: "Statut", render: (row: Row) => <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge> },
          { header: "Mode", render: (row: Row) => <span className="text-xs text-gray-500">{MODE_LABEL[row.mode]}</span> },
        ]} rows={filtered} getRowKey={(row) => row.key} onRowClick={open} emptyLabel={loading ? "Chargement des recharges…" : rows.length === 0 ? "Aucune recharge pour le moment." : "Aucune recharge ne correspond aux filtres."} />
      </div>
    </section>

    <ModuleDrawer open={!!selected} onOpenChange={(value) => !value && setSelected(null)} title={selected ? money(selected.amountCents, selected.currency) : ""} subtitle={selected ? `${selected.reference} · ${selected.scope === "wallet" ? "Wallet perso" : "Wallet Pro"}` : ""}>
      {selected ? <>
        <DrawerSection title="Paiement">
          <DrawerRow label="Statut" value={<Badge variant={statusVariant(selected.status)}>{STATUS_LABEL[selected.status]}</Badge>} />
          <DrawerRow label="Carte" value={cardLabel(selected)} />
          <DrawerRow label="Mode" value={MODE_LABEL[selected.mode]} />
          <DrawerRow label="Créée" value={dateTime(selected.createdAt)} />
          <DrawerRow label="Créditée" value={dateTime(selected.creditedAt)} />
          {selected.paymentIntentId ? <DrawerRow label="PaymentIntent" value={<span className="font-mono text-xs">{selected.paymentIntentId}</span>} /> : null}
          {selected.failureMessage ? <DrawerRow label="Motif du refus" value={`${selected.failureMessage}${selected.failureCode ? ` (${selected.failureCode})` : ""}`} /> : null}
        </DrawerSection>
        <DrawerSection title="Titulaire">
          <DrawerRow label={selected.scope === "wallet" ? "Utilisateur" : "Entreprise"} value={selected.who} />
          <DrawerRow label="Détail" value={selected.detail} />
        </DrawerSection>
        {selected.status === "refunded" ? <DrawerSection title="Remboursement">
          <DrawerRow label="Remboursée le" value={dateTime(selected.refundedAt)} />
          <DrawerRow label="Justification" value={selected.refundReason ?? "—"} />
        </DrawerSection> : null}
        {canOperate ? <DrawerSection title="Actions">
          <div className="flex flex-wrap gap-2">
            {["pending", "requires_action", "processing"].includes(selected.status) ? <Button className="h-8 text-xs" disabled={busy} onClick={() => reconcile(selected)}>Relire l’état chez Stripe</Button> : null}
            {["pending", "requires_action"].includes(selected.status) ? <Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => setCancelOpen(true)}>Annuler la recharge</Button> : null}
            {selected.status === "succeeded" && canRefund ? <Button variant="destructive" className="h-8 text-xs" disabled={busy} onClick={() => setRefundOpen(true)}>Rembourser</Button> : null}
          </div>
          {selected.status === "succeeded" && !canRefund ? <p className="text-xs text-gray-500">Le remboursement est réservé aux administrateurs.</p> : null}
          {["failed", "canceled", "refunded"].includes(selected.status) ? <p className="text-xs text-gray-500">Cette recharge est clôturée : aucune action disponible.</p> : null}
          <p className="text-xs text-gray-500">Chaque action est écrite dans le <a className="underline" href="/journal">Journal système</a>.</p>
        </DrawerSection> : null}
      </> : null}
    </ModuleDrawer>

    <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rembourser cette recharge ?</DialogTitle>
          <DialogDescription>{selected ? `${money(selected.amountCents, selected.currency)} seront débités du solde de ${selected.who} et remboursés sur la carte. Si le solde ne couvre plus le montant, l’opération est refusée.` : ""}</DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <Label htmlFor="refund-reason">Justification (journalisée)</Label>
          <Input id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Ex. Demande du client, doublon de paiement…" />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRefundOpen(false)}>Annuler</Button>
          <Button variant="destructive" disabled={busy} onClick={() => selected && refund(selected)}>Confirmer le remboursement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler cette recharge ?</DialogTitle>
          <DialogDescription>Le paiement en attente est annulé chez Stripe : aucune somme ne sera débitée ni créditée.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>Garder</Button>
          <Button variant="destructive" disabled={busy} onClick={() => { if (selected) cancel(selected); setCancelOpen(false) }}>Annuler la recharge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}

function MetricTile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "violet" | "amber" | "green" | "teal" | "brick" }) {
  return <div className="dashboard-metric-card" style={{ cursor: "default" }}>
    <span className={`dashboard-metric-icon ${tone}`}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></svg></span>
    <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
  </div>
}

/** État de l’intégration Stripe, lisible sans ouvrir le serveur : mode actif, nature de la clé, verrou live, webhook. */
function StripeCallout({ stripe }: { stripe: StripeStatus }) {
  const live = stripe.mode === "live"
  const real = stripe.enabled && stripe.mode !== "sim"
  const tone = real ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : stripe.enabled ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
  const headline = real ? (live ? "Stripe réel actif : les recharges débitent de vraies cartes." : "Stripe en mode test : aucune vraie carte n’est débitée.") : stripe.enabled ? "Simulateur local actif : aucune carte réelle n’est débitée." : "Recharges par carte désactivées."
  return <section className={`rounded-lg border p-4 text-sm ${tone}`} aria-label="État de l’intégration Stripe">
    <p className="font-semibold">{headline}</p>
    {stripe.reason ? <p className="mt-1">{stripe.reason}</p> : null}
    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="opacity-70">Mode demandé</dt><dd className="font-medium">{stripe.requestedMode}{stripe.fallback ? " → simulateur (repli)" : ""}</dd></div>
      <div><dt className="opacity-70">Clé secrète</dt><dd className="font-medium">{stripe.secretKeyKind === null ? "Absente" : stripe.secretKeyKind === "invalide" ? "Invalide (refusée par Stripe)" : stripe.secretKeyKind === "rk" ? "Clé restreinte (rk_)" : "Clé secrète (sk_)"}</dd></div>
      <div><dt className="opacity-70">Clé publique</dt><dd className="font-medium font-mono">{stripe.publishableKeyHint ?? "Absente"}</dd></div>
      <div><dt className="opacity-70">Webhook signé</dt><dd className="font-medium">{stripe.hasWebhookSecret ? `Configuré (${stripe.webhookPath})` : `Non configuré (${stripe.webhookPath})`}</dd></div>
      <div><dt className="opacity-70">Débits réels</dt><dd className="font-medium">{stripe.liveUnlocked ? "Déverrouillés" : "Verrouillés (STRIPE_ALLOW_LIVE_CHARGES)"}</dd></div>
      <div className="sm:col-span-2"><dt className="opacity-70">Plafond par recharge — wallet personnel</dt><dd className="font-medium">{format(stripe.limits.wallet.eur.perRechargeCents, "EUR")} · {format(stripe.limits.wallet.xpf.perRechargeCents, "XPF")}</dd></div>
      <div className="sm:col-span-2"><dt className="opacity-70">Plafond par recharge — Wallet Pro</dt><dd className="font-medium">{format(stripe.limits.business.eur.perRechargeCents, "EUR")} · {format(stripe.limits.business.xpf.perRechargeCents, "XPF")}</dd></div>
      <div className="sm:col-span-2"><dt className="opacity-70">Plafond cumulé sur 24 h glissantes, par portefeuille</dt><dd className="font-medium">{format(stripe.limits.wallet.eur.dailyCents, "EUR")} · {format(stripe.limits.wallet.xpf.dailyCents, "XPF")}</dd></div>
    </dl>
  </section>
}
