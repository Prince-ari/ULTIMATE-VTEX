"use client"

import * as React from "react"
import Link from "next/link"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { KpiRow } from "@/components/admin/KpiRow"
import { DataTable } from "@/components/admin/DataTable"
import { DrawerRow, DrawerSection, ModuleDrawer } from "@/components/admin/ModuleDrawer"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { useToast } from "@/components/admin/Toast"
import { canUseDashboard, isAdmin } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { amountToCents, centsToInput, entrySymbol, useMoney } from "@/lib/displayCurrency"

type Outputs = inferRouterOutputs<AppRouter>
type AdminWallet = Outputs["walletAdmin"]["wallets"][number]
type AdminCard = Outputs["walletAdmin"]["cards"][number]
type AdminTransaction = Outputs["walletAdmin"]["transactions"][number]
type AdminWalletDetail = Outputs["walletAdmin"]["detail"]
type Kpis = Outputs["walletAdmin"]["kpis"]
type CurrentUser = Outputs["users"]["getMe"]
type AdminUser = Outputs["users"]["list"][number]
type Reconciliation = Outputs["walletAdmin"]["reconciliation"]

type WalletStatus = AdminWallet["status"]
type CardDetail = AdminWalletDetail["cards"][number]
type BeneficiaryDetail = AdminWalletDetail["beneficiaries"][number]
type SavingsGoalDetail = AdminWalletDetail["savingsGoals"][number]

/* Montants : affichage via `useMoney()` et saisie via `amountToCents` — devise d'affichage € / ₣ choisie en haut du Dashboard (parité fixe 1 € = 119,3317 ₣). */

function idempotency(scope: string) {
  return `dashboard:${scope}:${crypto.randomUUID()}`
}

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (["active", "completed"].includes(status)) return "success"
  if (["pending", "frozen"].includes(status)) return "warning"
  if (["rejected", "closed", "cancelled", "expired", "archived", "disabled"].includes(status)) return "error"
  return "neutral"
}

function date(value: Date | string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

function apiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function WalletsPage() {
  const { show } = useToast()
  const { money } = useMoney()
  const [kpis, setKpis] = React.useState<Kpis | null>(null)
  const [wallets, setWallets] = React.useState<AdminWallet[]>([])
  const [cards, setCards] = React.useState<AdminCard[]>([])
  const [pending, setPending] = React.useState<AdminTransaction[]>([])
  const [allTransactions, setAllTransactions] = React.useState<AdminTransaction[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [reconciliation, setReconciliation] = React.useState<Reconciliation | null>(null)
  const [currentUser, setCurrentUser] = React.useState<CurrentUser | null>(null)
  const [selectedWallet, setSelectedWallet] = React.useState<AdminWallet | null>(null)
  const [detail, setDetail] = React.useState<AdminWalletDetail | null>(null)
  const [decision, setDecision] = React.useState<{ transaction: AdminTransaction; approved: boolean } | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    const [nextKpis, nextWallets, nextCards, nextPending, nextTransactions, nextUsers, nextReconciliation] = await Promise.all([
      api.walletAdmin.kpis.query(),
      api.walletAdmin.wallets.query({ limit: 500 }),
      api.walletAdmin.cards.query({ limit: 500 }),
      api.walletAdmin.transactions.query({ status: "pending", limit: 500 }),
      api.walletAdmin.transactions.query({ limit: 500 }),
      api.users.list.query().catch(() => []),
      api.walletAdmin.reconciliation.query({ limit: 100 }),
    ])
    setKpis(nextKpis)
    setWallets(nextWallets)
    setCards(nextCards)
    setPending(nextPending)
    setAllTransactions(nextTransactions)
    setUsers(nextUsers)
    setReconciliation(nextReconciliation)
  }, [])

  const refreshDetail = React.useCallback(async (walletAccountId: number) => {
    const nextDetail = await api.walletAdmin.detail.query({ walletAccountId })
    setDetail(nextDetail)
    setSelectedWallet(nextDetail.account)
  }, [])

  React.useEffect(() => {
    setLoading(true)
    api.users.getMe.query().then((user) => {
      setCurrentUser(user)
      if (user.role === "user") return
      return refresh()
    }).catch((error) => show(apiError(error, "Impossible de charger le module Wallet."), "error")).finally(() => setLoading(false))
  }, [refresh, show])

  const canOperate = canUseDashboard(currentUser?.role ?? "user")
  const canAdjust = isAdmin(currentUser?.role)
  const alerts = React.useMemo(() => {
    const next: { tone: "warning" | "error" | "neutral"; title: string; description: string }[] = []
    if (pending.length) next.push({ tone: "warning", title: `${pending.length} virement${pending.length > 1 ? "s" : ""} en attente`, description: "Une décision opérateur est requise pour libérer ou exécuter les fonds réservés." })
    const frozen = cards.filter((card) => card.status === "frozen").length
    if (frozen) next.push({ tone: "warning", title: `${frozen} carte${frozen > 1 ? "s" : ""} gelée${frozen > 1 ? "s" : ""}`, description: "Vérifiez les canaux et plafonds avant une éventuelle réactivation." })
    const soon = cards.filter((card) => new Date(card.expiresAt).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000 && new Date(card.expiresAt).getTime() > Date.now()).length
    if (soon) next.push({ tone: "warning", title: `${soon} expiration${soon > 1 ? "s" : ""} proche${soon > 1 ? "s" : ""}`, description: "Une nouvelle carte peut être émise depuis le détail du compte." })
    if (reconciliation?.mismatches) next.push({ tone: "error", title: `${reconciliation.mismatches} écart${reconciliation.mismatches > 1 ? "s" : ""} de rapprochement`, description: "Contrôlez les écritures du ledger avant toute correction de solde." })
    return next
  }, [cards, pending.length, reconciliation?.mismatches])

  async function openWallet(wallet: AdminWallet) {
    setSelectedWallet(wallet)
    setDetail(null)
    try {
      await refreshDetail(wallet.id)
    } catch (error) {
      show(apiError(error, "Impossible de charger le détail du compte."), "error")
    }
  }

  async function refreshEverything(walletAccountId?: number) {
    try {
      await refresh()
      if (walletAccountId) await refreshDetail(walletAccountId)
    } catch (error) {
      show(apiError(error, "Rafraîchissement impossible."), "error")
    }
  }

  async function resolvePending() {
    if (!decision) return
    try {
      await api.transactions.resolvePending.mutate({ transactionId: decision.transaction.id, approved: decision.approved })
      await refreshEverything(decision.transaction.walletAccountId)
      show(decision.approved ? "Virement validé et journalisé." : "Virement refusé et fonds libérés.")
    } catch (error) {
      show(apiError(error, "Décision impossible."), "error")
    } finally {
      setDecision(null)
    }
  }

  if (!loading && currentUser?.role === "user") {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"><h1 className="text-lg font-semibold">Accès restreint</h1><p className="mt-2">Le pilotage Wallet est réservé aux rôles opérateur et administrateur.</p></div>
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">Pilotage Wallet</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Le Dashboard consulte et pilote les comptes, devises, cartes, bénéficiaires, objectifs et opérations par des contrats serveur journalisés. Numéro, CVV et PIN des cartes se consultent dans « Cartes » (Super-administrateur, chaque affichage est journalisé).</p></div>
      <Button variant="secondary" onClick={() => void refreshEverything(selectedWallet?.id)}>Rafraîchir</Button>
    </div>

    <KpiRow items={[
      { label: "Solde disponible", value: money(kpis?.availableBalanceCents ?? 0), hint: `${kpis?.walletAccounts ?? 0} comptes Wallet` },
      { label: "Solde réservé", value: money(kpis?.reservedBalanceCents ?? 0), hint: "Ordres en attente" },
      { label: "Virements à valider", value: String(kpis?.pendingTransactions ?? 0), hint: money(kpis?.pendingAmountCents ?? 0) },
      { label: "Volume validé", value: money(kpis?.completedVolumeCents ?? 0), hint: `${kpis?.completedTransactions ?? 0} opérations` },
    ]} />

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Alertes opérationnelles</h2><p className="text-sm text-gray-500">Les alertes sont calculées à partir des cartes, ordres et rapprochements actuels.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{alerts.length ? alerts.map((alert) => <div key={alert.title} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"><Badge variant={alert.tone}>{alert.tone === "error" ? "À traiter" : "Surveillance"}</Badge><p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-50">{alert.title}</p><p className="mt-1 text-xs leading-5 text-gray-500">{alert.description}</p></div>) : <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-950">Aucune alerte opérationnelle sur les données actuelles.</div>}</div></section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Virements externes en attente</h2><p className="text-sm text-gray-500">Une validation déplace la réservation vers l’exécution ; un refus restitue le montant disponible.</p></div>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Référence", render: (row: AdminTransaction) => <span className="font-mono text-xs font-medium">{row.reference}</span> },
        { header: "Compte", render: (row: AdminTransaction) => `#${row.walletAccountId}` },
        { header: "Montant", render: (row: AdminTransaction) => money(row.amountCents, row.currency) },
        { header: "Statut", render: (row: AdminTransaction) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Action", render: (row: AdminTransaction) => canOperate ? <div className="flex gap-2"><Button className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); setDecision({ transaction: row, approved: true }) }}>Valider</Button><Button variant="secondary" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); setDecision({ transaction: row, approved: false }) }}>Refuser</Button></div> : "Lecture seule" },
      ]} rows={pending} getRowKey={(row) => row.id} emptyLabel={loading ? "Chargement des ordres…" : "Aucun virement externe en attente."} />
    </section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Comptes Wallet</h2><p className="text-sm text-gray-500">Ouvrez un compte pour administrer son cycle de vie, ses cartes, ses bénéficiaires, ses objectifs et son historique réel.</p></div>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Compte", render: (row: AdminWallet) => <span className="font-mono text-xs">#{row.id}</span> },
        { header: "Utilisateur", render: (row: AdminWallet) => `#${row.userId}` },
        { header: "Devise", render: (row: AdminWallet) => row.currency },
        { header: "Disponible", render: (row: AdminWallet) => money(row.availableBalanceCents, row.currency) },
        { header: "Réservé", render: (row: AdminWallet) => money(row.reservedBalanceCents, row.currency) },
        { header: "Statut", render: (row: AdminWallet) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
      ]} rows={wallets} getRowKey={(row) => row.id} onRowClick={(row) => void openWallet(row)} emptyLabel={loading ? "Chargement des comptes…" : "Aucun compte Wallet."} />
      {canAdjust ? <CreateFirstWalletForm users={users} onDone={refresh} /> : null}
    </section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Cartes</h2><p className="text-sm text-gray-500">Statuts, canaux et plafonds sont contrôlés côté serveur. Ouvrez une carte pour saisir ou afficher (masqué par défaut) son numéro, son CVV et son PIN.</p></div>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Carte", render: (row: AdminCard) => <Link href={`/cartes?card=PERSONAL-${row.id}`} onClick={(event) => event.stopPropagation()} className="font-semibold text-[#3a4380] hover:underline">{row.network.toUpperCase()} · •••• {row.lastFour}</Link> },
        { header: "Compte", render: (row: AdminCard) => `#${row.walletAccountId}` },
        { header: "Limite / opération", render: (row: AdminCard) => money(row.perTransactionLimitCents) },
        { header: "Limite / jour", render: (row: AdminCard) => money(row.dailyLimitCents) },
        { header: "Statut", render: (row: AdminCard) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
        { header: "Détail", render: (row: AdminCard) => <Button variant="secondary" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); const owner = wallets.find((wallet) => wallet.id === row.walletAccountId); if (owner) void openWallet(owner) }}>Ouvrir le compte</Button> },
      ]} rows={cards} getRowKey={(row) => row.id} emptyLabel={loading ? "Chargement des cartes…" : "Aucune carte Wallet."} />
    </section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Toutes les transactions</h2><p className="text-sm text-gray-500">Historique opérationnel complet : ordres, décisions, ajustements, objectifs, partages et paiements carte.</p></div>
      <DataTable mobileBreakpoint="lg" columns={[
        { header: "Référence", render: (row: AdminTransaction) => <span className="font-mono text-xs">{row.reference}</span> },
        { header: "Type", render: (row: AdminTransaction) => row.type.replaceAll("_", " ") },
        { header: "Montant", render: (row: AdminTransaction) => money(row.amountCents, row.currency) },
        { header: "Sens", render: (row: AdminTransaction) => row.direction },
        { header: "Statut", render: (row: AdminTransaction) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
      ]} rows={allTransactions} getRowKey={(row) => row.id} emptyLabel={loading ? "Chargement de l’historique…" : "Aucune transaction Wallet."} />
    </section>

    <section className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Rapprochement ledger</h2><p className="text-sm text-gray-500">Comparaison en lecture seule entre le solde disponible du compte et sa dernière écriture disponible.</p></div><DataTable mobileBreakpoint="lg" columns={[{ header: "Compte", render: (row: NonNullable<Reconciliation>["accounts"][number]) => <span className="font-mono text-xs">#{row.id}</span> }, { header: "Devise", render: (row: NonNullable<Reconciliation>["accounts"][number]) => row.currency }, { header: "Solde compte", render: (row: NonNullable<Reconciliation>["accounts"][number]) => money(row.availableBalanceCents, row.currency) }, { header: "Dernière écriture", render: (row: NonNullable<Reconciliation>["accounts"][number]) => money(row.ledgerAvailableCents, row.currency) }, { header: "État", render: (row: NonNullable<Reconciliation>["accounts"][number]) => <Badge variant={row.availableMatches ? "success" : "error"}>{row.availableMatches ? "Rapproché" : "Écart"}</Badge> }, { header: "Écritures", render: (row: NonNullable<Reconciliation>["accounts"][number]) => String(row.ledgerEntries.length) }]} rows={reconciliation?.accounts ?? []} getRowKey={(row) => row.id} emptyLabel={loading ? "Analyse du ledger…" : "Aucun compte à rapprocher."} /><p className="text-xs text-gray-500">{reconciliation ? `${reconciliation.entriesAnalysed} écritures analysées · contrôle ${date(reconciliation.checkedAt)}` : ""}</p></section>

    <ModuleDrawer open={!!selectedWallet} onOpenChange={(open) => !open && (setSelectedWallet(null), setDetail(null))} title={selectedWallet ? `Compte Wallet #${selectedWallet.id}` : ""} subtitle={selectedWallet ? `Titulaire, ${selectedWallet.currency} et commandes administratives sécurisées` : ""}>
      {!detail ? <p className="text-sm text-gray-500">Chargement du détail du compte…</p> : <WalletDetailConsole detail={detail} canOperate={canOperate} canAdjust={canAdjust} onChanged={() => refreshEverything(detail.account.id)} />}
    </ModuleDrawer>

    <ConfirmDialog open={!!decision} onOpenChange={(open) => !open && setDecision(null)} title={decision?.approved ? "Valider ce virement ?" : "Refuser ce virement ?"} description={decision?.approved ? "Le montant réservé sera exécuté et l’action sera inscrite au journal d’audit." : "Le montant réservé sera libéré vers le solde disponible et l’action sera inscrite au journal d’audit."} confirmLabel={decision?.approved ? "Valider" : "Refuser"} destructive={!decision?.approved} onConfirm={() => void resolvePending()} />
  </div>
}

function WalletDetailConsole({ detail, canOperate, canAdjust, onChanged }: { detail: AdminWalletDetail; canOperate: boolean; canAdjust: boolean; onChanged: () => Promise<void> }) {
  const { money } = useMoney()
  const wallet = detail.account
  const ownerName = `${detail.owner.firstName} ${detail.owner.lastName}`.trim()
  return <>
    <DrawerSection title="Titulaire et compte"><DrawerRow label="Titulaire" value={ownerName || `Utilisateur #${detail.owner.id}`} /><DrawerRow label="Email" value={detail.owner.email} /><DrawerRow label="Rôle Core" value={detail.owner.role} /><DrawerRow label="Devise" value={wallet.currency} /><DrawerRow label="Statut" value={<Badge variant={statusVariant(wallet.status)}>{wallet.status}</Badge>} /><DrawerRow label="Disponible" value={money(wallet.availableBalanceCents, wallet.currency)} /><DrawerRow label="Réservé" value={money(wallet.reservedBalanceCents, wallet.currency)} /><DrawerRow label="IBAN" value={wallet.iban ?? "Révoqué / à provisionner"} /><DrawerRow label="BIC" value={wallet.bic ?? "—"} />{canOperate ? <BankDetailsPanel wallet={wallet} onChanged={onChanged} /> : null}</DrawerSection>

    {canAdjust ? <><DrawerSection title="Permissions Wallet"><WalletPermissionsPanel userId={wallet.userId} /></DrawerSection><DrawerSection title="Cycle de vie et devise"><AccountStatusControls wallet={wallet} onChanged={onChanged} /><NewCurrencyAccountForm userId={wallet.userId} onChanged={onChanged} /></DrawerSection></> : null}
    {canAdjust ? <DrawerSection title="Intervention d’urgence"><EmergencyLockdown wallet={wallet} onDone={onChanged} /></DrawerSection> : null}
    {canAdjust ? <DrawerSection title="Ajustement comptable"><AdjustmentForm wallet={wallet} onDone={onChanged} /></DrawerSection> : null}
    <DrawerSection title={`Cartes (${detail.cards.length})`}><div className="space-y-3">{detail.cards.map((card) => <CardAdminPanel key={card.id} card={card} currency={wallet.currency} canOperate={canOperate} canAdjust={canAdjust} onChanged={onChanged} />)}{canAdjust ? <CreateCardForm walletAccountId={wallet.id} onDone={onChanged} /> : null}</div></DrawerSection>
    <DrawerSection title={`Bénéficiaires (${detail.beneficiaries.length})`}><div className="space-y-3">{detail.beneficiaries.map((beneficiary) => <BeneficiaryPanel key={beneficiary.id} beneficiary={beneficiary} canOperate={canOperate} onChanged={onChanged} />)}{canAdjust ? <CreateBeneficiaryForm walletAccountId={wallet.id} onDone={onChanged} /> : null}</div></DrawerSection>
    <DrawerSection title={`Objectifs d’épargne (${detail.savingsGoals.length})`}><div className="space-y-3">{detail.savingsGoals.map((goal) => <SavingsGoalPanel key={goal.id} goal={goal} canAdjust={canAdjust} onChanged={onChanged} />)}{canAdjust ? <CreateSavingsGoalForm walletAccountId={wallet.id} currency={wallet.currency} onDone={onChanged} /> : null}</div></DrawerSection>
    {canAdjust ? <DrawerSection title="Opérations Wallet"><TransferConsole wallet={wallet} beneficiaries={detail.beneficiaries} onDone={onChanged} /></DrawerSection> : null}
    <DrawerSection title={`Historique récent (${detail.transactions.length})`}><div className="max-h-64 space-y-2 overflow-auto pr-1">{detail.transactions.length === 0 ? <p className="text-sm text-gray-500">Aucune transaction sur ce compte.</p> : detail.transactions.map((transaction) => <div className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800" key={transaction.id}><div className="flex items-center justify-between gap-3"><span className="font-mono">{transaction.reference}</span><Badge variant={statusVariant(transaction.status)}>{transaction.status}</Badge></div><div className="mt-1 flex items-center justify-between text-gray-500"><span>{transaction.type.replaceAll("_", " ")}</span><span>{transaction.direction === "credit" ? "+" : "−"}{money(transaction.amountCents, transaction.currency)}</span></div></div>)}</div></DrawerSection>
  </>
}

function AccountStatusControls({ wallet, onChanged }: { wallet: AdminWalletDetail["account"]; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [nextStatus, setNextStatus] = React.useState<WalletStatus | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function apply() {
    if (!nextStatus) return
    setBusy(true)
    try { await api.walletAdmin.updateWalletStatus.mutate({ walletAccountId: wallet.id, status: nextStatus }); await onChanged(); show("Statut du compte mis à jour et journalisé.") } catch (error) { show(apiError(error, "Mise à jour du statut impossible."), "error") } finally { setBusy(false); setNextStatus(null) }
  }
  if (busy) return <p className="text-sm text-gray-500">Mise à jour du statut en cours…</p>
  if (wallet.status === "closed") return <p className="text-sm text-gray-500">Ce compte est clôturé de manière définitive. La devise et le ledger restent consultables.</p>
  return <div className="space-y-2"><p className="text-sm text-gray-500">La clôture est autorisée seulement si les deux soldes sont nuls.</p><div className="flex flex-wrap gap-2">{wallet.status !== "active" ? <Button className="h-8 text-xs" onClick={() => setNextStatus("active")}>Activer</Button> : null}{wallet.status !== "frozen" ? <Button variant="secondary" className="h-8 text-xs" onClick={() => setNextStatus("frozen")}>Geler le compte</Button> : null}<Button variant="secondary" className="h-8 text-xs" onClick={() => setNextStatus("closed")}>Clôturer</Button></div><ConfirmDialog open={!!nextStatus} onOpenChange={(open) => !open && setNextStatus(null)} title={nextStatus === "closed" ? "Clôturer ce compte ?" : "Modifier le statut du compte ?"} description={nextStatus === "closed" ? "Cette action est définitive et sera refusée si un solde disponible ou réservé subsiste." : `Le compte passera à l’état ${nextStatus}.`} confirmLabel={nextStatus === "closed" ? "Clôturer" : "Confirmer"} destructive={nextStatus === "closed"} onConfirm={() => void apply()} /></div>
}

function BankDetailsPanel({ wallet, onChanged }: { wallet: AdminWalletDetail["account"]; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [iban, setIban] = React.useState(wallet.iban ?? "")
  const [bic, setBic] = React.useState(wallet.bic ?? "")
  const [reason, setReason] = React.useState("")
  const [history, setHistory] = React.useState<{ id: number; iban: string; bic: string; status: string; reason: string | null; createdAt: Date | string; revokedAt: Date | string | null }[]>([])
  const [busy, setBusy] = React.useState(false)
  const loadHistory = React.useCallback(() => api.walletAdmin.bankDetailsHistory.query({ walletAccountId: wallet.id }).then(setHistory).catch((error: unknown) => show(apiError(error, "Historique RIB indisponible."), "error")), [show, wallet.id])
  React.useEffect(() => { void loadHistory() }, [loadHistory])
  async function save() {
    if (!iban.trim() || !bic.trim() || reason.trim().length < 8) return show("Renseignez un IBAN, un BIC et un motif d’au moins huit caractères.", "error")
    setBusy(true)
    try { await api.walletAdmin.updateBankDetails.mutate({ walletAccountId: wallet.id, iban: iban.trim(), bic: bic.trim(), reason: reason.trim() }); await onChanged(); await loadHistory(); setReason(""); show("Coordonnées bancaires mises à jour et journalisées.") } catch (error) { show(apiError(error, "Mise à jour RIB impossible."), "error") } finally { setBusy(false) }
  }
  async function revoke() {
    const revokeReason = window.prompt("Motif obligatoire de révocation (8 caractères minimum)")
    if (!revokeReason?.trim() || revokeReason.trim().length < 8) return
    setBusy(true)
    try { await api.walletAdmin.revokeBankDetails.mutate({ walletAccountId: wallet.id, reason: revokeReason.trim() }); await onChanged(); await loadHistory(); setIban(""); setBic(""); show("Coordonnées bancaires révoquées et journalisées.") } catch (error) { show(apiError(error, "Révocation RIB impossible."), "error") } finally { setBusy(false) }
  }
  async function autoProvision() {
    setBusy(true)
    try { await api.walletAdmin.provisionBankDetails.mutate({ walletAccountId: wallet.id }); await onChanged(); await loadHistory(); show("IBAN/BIC générés automatiquement et journalisés.") } catch (error) { show(apiError(error, "Provisionnement automatique impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800"><p className="text-xs font-medium text-gray-500">Cycle de vie RIB</p>
    {!wallet.iban ? <Button className="h-8 text-xs" disabled={busy} onClick={() => void autoProvision()}>{busy ? "Génération…" : "Provisionner automatiquement (IBAN/BIC générés)"}</Button> : null}
    <p className="text-xs text-gray-500">{wallet.iban ? "Rotation manuelle avec un IBAN précis :" : "Ou saisir manuellement un IBAN/BIC réel :"}</p>
    <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="IBAN Wallet" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IBAN" /><Input aria-label="BIC Wallet" value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BIC" /></div><Input aria-label="Motif de mise à jour RIB" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif de provisionnement ou rotation" /><div className="flex flex-wrap gap-2"><Button className="h-8 text-xs" disabled={busy} onClick={() => void save()}>{busy ? "Enregistrement…" : wallet.iban ? "Faire tourner le RIB" : "Provisionner manuellement"}</Button>{wallet.iban ? <Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void revoke()}>Révoquer</Button> : null}</div><details className="text-xs text-gray-500"><summary className="cursor-pointer">Historique ({history.length})</summary><div className="mt-2 space-y-1">{history.map((item) => <div key={item.id} className="rounded border border-gray-200 px-2 py-1 dark:border-gray-800"><span className="font-mono">{item.iban.slice(0, 4)}••••{item.iban.slice(-4)}</span> · {item.bic} · <Badge variant={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge></div>)}</div></details></div>
}

function WalletPermissionsPanel({ userId }: { userId: number }) {
  const { show } = useToast()
  const [permissions, setPermissions] = React.useState<{ permission: string; allowed: boolean; overridden: boolean }[]>([])
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { api.walletAdmin.permissions.query({ userId }).then(setPermissions).catch((error) => show(apiError(error, "Permissions indisponibles."), "error")) }, [show, userId])
  async function toggle(permission: string, allowed: boolean) {
    setBusy(true)
    try { const next = await api.walletAdmin.updatePermission.mutate({ userId, permission: permission as never, allowed }); setPermissions(next); show("Permission Wallet mise à jour et journalisée.") } catch (error) { show(apiError(error, "Mise à jour de permission impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2"><p className="text-xs text-gray-500">Les permissions sont évaluées côté serveur. Les changements sont audités.</p>{permissions.map((item) => <label key={item.permission} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-800"><span><span className="block font-medium">{item.permission}</span><span className="text-gray-500">{item.overridden ? "Surcharge explicite" : "Valeur par défaut du rôle"}</span></span><input type="checkbox" checked={item.allowed} disabled={busy} onChange={(event) => void toggle(item.permission, event.target.checked)} /></label>)}</div>
}

function EmergencyLockdown({ wallet, onDone }: { wallet: AdminWalletDetail["account"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [reason, setReason] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  async function execute() {
    if (reason.trim().length < 8) return show("Saisissez une justification d’au moins huit caractères.", "error")
    setBusy(true)
    try {
      const result = await api.walletAdmin.emergencyLockdown.mutate({ walletAccountId: wallet.id, reason: reason.trim(), idempotencyKey: idempotency("emergency-lockdown") })
      await onDone()
      show(`Intervention appliquée : ${result.cardsFrozen} carte(s) active(s) gelée(s).`)
      setReason("")
    } catch (error) { show(apiError(error, "Intervention d’urgence impossible."), "error") } finally { setBusy(false); setOpen(false) }
  }
  if (wallet.status === "closed") return <p className="text-sm text-gray-500">Un compte clôturé ne peut pas être gelé de nouveau.</p>
  return <div className="rounded-md border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-950 dark:bg-rose-950/10"><p className="text-sm font-medium text-gray-900 dark:text-gray-50">Gel de protection</p><p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Gèle immédiatement le compte et toutes les cartes actuellement actives. Les cartes déjà gelées ou annulées ne sont pas modifiées ; toute réactivation reste une action volontaire et traçable.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Justification du gel d’urgence" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif de sécurité obligatoire" /><Button className="shrink-0 bg-rose-700 text-white hover:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500" disabled={busy} onClick={() => setOpen(true)}>{busy ? "Gel…" : "Geler immédiatement"}</Button></div><ConfirmDialog open={open} onOpenChange={(next) => !next && setOpen(false)} title="Geler le compte et ses cartes ?" description="Cette intervention fige le compte et toutes les cartes actives. La justification, le nombre de cartes gelées et l’opérateur sont inscrits au journal d’audit." confirmLabel="Confirmer le gel" destructive onConfirm={() => void execute()} /></div>
}

function NewCurrencyAccountForm({ userId, onChanged }: { userId: number; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [currency, setCurrency] = React.useState<"EUR" | "USD" | "XPF">("USD")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    setBusy(true)
    try { await api.walletAdmin.createWallet.mutate({ userId, currency }); await onChanged(); show(`Compte ${currency} créé et journalisé.`) } catch (error) { show(apiError(error, "Création du compte impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="flex flex-wrap items-end gap-2"><div><Label htmlFor="new-wallet-currency">Nouveau compte</Label><select id="new-wallet-currency" className="mt-1 h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={currency} onChange={(event) => setCurrency(event.target.value as "EUR" | "USD" | "XPF")}><option value="EUR">EUR</option><option value="USD">USD</option><option value="XPF">XPF</option></select></div><Button className="h-9 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Ouvrir un compte"}</Button></div>
}

function CreateFirstWalletForm({ users, onDone }: { users: AdminUser[]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [userId, setUserId] = React.useState("")
  const [currency, setCurrency] = React.useState<"EUR" | "USD" | "XPF">("EUR")
  const [busy, setBusy] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<AdminUser | null>(null)
  const candidates = React.useMemo(() => users.filter((user) => user.status === "active" && (`${user.firstName} ${user.lastName} ${user.email}`).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6), [query, users])
  async function submit() {
    const numericUserId = selected?.id ?? Number(userId)
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) return show("Renseignez l’identifiant numérique du titulaire depuis le module Utilisateurs.", "error")
    setBusy(true)
    try { await api.walletAdmin.createWallet.mutate({ userId: numericUserId, currency }); await onDone(); show(`Compte ${currency} créé et carte virtuelle émise.`); setUserId(""); setQuery(""); setSelected(null) } catch (error) { show(apiError(error, "Création du compte impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-950"><p className="text-sm font-medium text-gray-900 dark:text-gray-50">Ouvrir un compte pour un titulaire</p><p className="mt-1 text-xs text-gray-500">Recherchez un titulaire actif ; la devise reste immuable et une carte virtuelle contrôlable est émise à l’ouverture.</p><div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]"><div><Label htmlFor="first-wallet-user-search">Titulaire</Label><Input id="first-wallet-user-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null) }} placeholder="Rechercher par nom ou email" />{query.trim() && !selected ? <div className="mt-1 max-h-36 overflow-auto rounded-md border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-950">{candidates.length ? candidates.map((user) => <button type="button" key={user.id} onClick={() => { setSelected(user); setUserId(String(user.id)); setQuery(`${user.firstName} ${user.lastName} · ${user.email}`) }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-900">{user.firstName} {user.lastName} · {user.email}</button>) : <p className="px-2 py-1 text-xs text-gray-500">Aucun titulaire actif.</p>}</div> : null}{selected ? <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Titulaire sélectionné : {selected.firstName} {selected.lastName}</p> : null}</div><div><Label htmlFor="first-wallet-currency">Devise</Label><select id="first-wallet-currency" className="mt-1 h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={currency} onChange={(event) => setCurrency(event.target.value as "EUR" | "USD" | "XPF")}><option value="EUR">EUR</option><option value="USD">USD</option><option value="XPF">XPF</option></select></div><Button className="mt-6 h-9 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Ouverture…" : "Ouvrir le compte"}</Button></div><details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">Saisie technique de secours</summary><div className="mt-2"><Label htmlFor="first-wallet-user-id">Identifiant utilisateur</Label><Input id="first-wallet-user-id" value={userId} onChange={(event) => { setUserId(event.target.value); setSelected(null) }} placeholder="Ex. 42" inputMode="numeric" /></div></details></div>
}

function AdjustmentForm({ wallet, onDone }: { wallet: AdminWalletDetail["account"]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const deltaCents = amountToCents(amount, wallet.currency)
    if (!deltaCents || reason.trim().length < 8) return show("Saisissez un montant non nul et une justification d’au moins huit caractères.", "error")
    setBusy(true)
    try { await api.walletAdmin.adjustBalance.mutate({ walletAccountId: wallet.id, deltaCents, reason: reason.trim(), idempotencyKey: idempotency("adjustment") }); show("Ajustement enregistré, notifié et journalisé."); await onDone() } catch (error) { show(apiError(error, "Ajustement impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-2"><div><Label htmlFor="adjustment-amount">Montant en {entrySymbol(wallet.currency)} (négatif pour retirer)</Label><Input id="adjustment-amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 25 ou -25" inputMode="decimal" /></div><div><Label htmlFor="adjustment-reason">Justification</Label><Input id="adjustment-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Correction motivée…" /></div><Button disabled={busy} onClick={() => void submit()}>{busy ? "Enregistrement…" : "Enregistrer l’ajustement"}</Button></div>
}

function CardAdminPanel({ card, currency, canOperate, canAdjust, onChanged }: { card: CardDetail; currency: string; canOperate: boolean; canAdjust: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [online, setOnline] = React.useState(card.onlinePaymentsEnabled)
  const [contactless, setContactless] = React.useState(card.contactlessEnabled)
  const [cash, setCash] = React.useState(card.cashWithdrawalEnabled)
  const [daily, setDaily] = React.useState(centsToInput(card.dailyLimitCents, currency))
  const [monthly, setMonthly] = React.useState(centsToInput(card.monthlyLimitCents, currency))
  const [perTransaction, setPerTransaction] = React.useState(centsToInput(card.perTransactionLimitCents, currency))
  const [pin, setPin] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [merchantName, setMerchantName] = React.useState("")
  const [authAmount, setAuthAmount] = React.useState("")
  const [channel, setChannel] = React.useState<"online" | "contactless" | "cash_withdrawal">("online")
  async function toggleFreeze() {
    setBusy(true)
    try { await api.cards.setFrozen.mutate({ cardId: card.id, frozen: card.status !== "frozen" }); await onChanged(); show(card.status === "frozen" ? "Carte dégelée." : "Carte gelée.") } catch (error) { show(apiError(error, "Action carte impossible."), "error") } finally { setBusy(false) }
  }
  async function saveControls() {
    const dailyLimitCents = amountToCents(daily, currency); const monthlyLimitCents = amountToCents(monthly, currency); const perTransactionLimitCents = amountToCents(perTransaction, currency)
    if (dailyLimitCents <= 0 || monthlyLimitCents <= 0 || perTransactionLimitCents <= 0) return show("Chaque plafond doit être strictement positif.", "error")
    setBusy(true)
    try { await api.cards.updateControls.mutate({ cardId: card.id, onlinePaymentsEnabled: online, contactlessEnabled: contactless, cashWithdrawalEnabled: cash, dailyLimitCents, monthlyLimitCents, perTransactionLimitCents }); await onChanged(); show("Paramètres carte enregistrés.") } catch (error) { show(apiError(error, "Mise à jour carte impossible."), "error") } finally { setBusy(false) }
  }
  async function cancel() {
    setBusy(true)
    try { await api.walletAdmin.cancelCard.mutate({ cardId: card.id }); await onChanged(); show("Carte annulée et journalisée.") } catch (error) { show(apiError(error, "Annulation impossible."), "error") } finally { setBusy(false); setCancelOpen(false) }
  }
  async function renew() { setBusy(true); try { await api.walletAdmin.renewCard.mutate({ cardId: card.id, idempotencyKey: idempotency("card-renew") }); await onChanged(); show("Carte renouvelée et ancienne carte annulée.") } catch (error) { show(apiError(error, "Renouvellement impossible."), "error") } finally { setBusy(false) } }
  async function replace() { const reason = window.prompt("Motif obligatoire du remplacement"); if (!reason?.trim()) return; setBusy(true); try { await api.walletAdmin.replaceCard.mutate({ cardId: card.id, reason: reason.trim(), idempotencyKey: idempotency("card-replace") }); await onChanged(); show("Carte remplacée et ancienne carte annulée.") } catch (error) { show(apiError(error, "Remplacement impossible."), "error") } finally { setBusy(false) } }
  async function savePin() { if (!/^\d{4}$/.test(pin)) return show("Le PIN doit contenir exactement quatre chiffres.", "error"); setBusy(true); try { await api.cards.setPin.mutate({ cardId: card.id, pin }); setPin(""); show("PIN enregistré : seul son hash est conservé côté serveur.") } catch (error) { show(apiError(error, "Mise à jour du PIN impossible."), "error") } finally { setBusy(false) } }
  async function authorize() {
    const amountCents = amountToCents(authAmount, currency)
    if (merchantName.trim().length < 2 || amountCents <= 0) return show("Renseignez un commerçant et un montant valides.", "error")
    setBusy(true)
    try { await api.cards.authorizePayment.mutate({ cardId: card.id, amountCents, merchantName: merchantName.trim(), channel, idempotencyKey: idempotency("card-authorize") }); await onChanged(); show("Autorisation simulée et journalisée."); setMerchantName(""); setAuthAmount("") } catch (error) { show(apiError(error, "Autorisation impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{card.label} · •••• {card.lastFour}</p><p className="text-xs text-gray-500">{card.network.toUpperCase()} · expire le {date(card.expiresAt)}</p></div><Badge variant={statusVariant(card.status)}>{card.status}</Badge></div>{canOperate && !["expired", "cancelled"].includes(card.status) ? <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void toggleFreeze()}>{card.status === "frozen" ? "Dégeler" : "Geler"}</Button>{canAdjust ? <><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void renew()}>Renouveler</Button><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void replace()}>Remplacer</Button><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => setCancelOpen(true)}>Annuler</Button></> : null}</div> : null}{canAdjust ? <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800"><p className="text-xs font-medium text-gray-500">PIN sécurisé</p><div className="flex gap-2"><Input aria-label="Nouveau PIN carte" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" /><Button className="h-9 text-xs" disabled={busy || card.status === "cancelled"} onClick={() => void savePin()}>Enregistrer le PIN</Button></div><p className="text-xs text-gray-500">Le Dashboard ne relit jamais le PIN ; seul son hash scrypt est conservé.</p></div> : null}
      {canAdjust && !["expired", "cancelled"].includes(card.status) ? <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800"><p className="text-xs font-medium text-gray-500">Simuler une autorisation (support/tests)</p><div className="grid grid-cols-3 gap-2"><Input aria-label="Commerçant" value={merchantName} onChange={(event) => setMerchantName(event.target.value)} placeholder="Commerçant" /><Input aria-label="Montant de l’autorisation" value={authAmount} onChange={(event) => setAuthAmount(event.target.value)} placeholder="Montant" inputMode="decimal" /><select aria-label="Canal" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="online">En ligne</option><option value="contactless">Sans contact</option><option value="cash_withdrawal">Retrait</option></select></div><Button className="h-8 text-xs" disabled={busy} onClick={() => void authorize()}>Autoriser</Button><p className="text-xs text-gray-500">Débite réellement le compte associé — à utiliser pour reproduire un ticket support, pas pour du test aveugle.</p></div> : null}{canAdjust ? <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800"><p className="text-xs font-medium text-gray-500">Canaux et plafonds</p><div className="grid grid-cols-3 gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} />En ligne</label><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={contactless} onChange={(event) => setContactless(event.target.checked)} />Sans contact</label><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={cash} onChange={(event) => setCash(event.target.checked)} />Retrait</label></div><div className="grid grid-cols-3 gap-2"><Input aria-label="Plafond par opération" value={perTransaction} onChange={(event) => setPerTransaction(event.target.value)} inputMode="decimal" /><Input aria-label="Plafond quotidien" value={daily} onChange={(event) => setDaily(event.target.value)} inputMode="decimal" /><Input aria-label="Plafond mensuel" value={monthly} onChange={(event) => setMonthly(event.target.value)} inputMode="decimal" /></div><Button className="h-8 text-xs" disabled={busy || card.status === "cancelled"} onClick={() => void saveControls()}>Enregistrer les contrôles</Button></div> : null}<ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Annuler cette carte ?" description="L’annulation est définitive. Les numéros complets et références de token restent indisponibles à l’administration." confirmLabel="Annuler la carte" destructive onConfirm={() => void cancel()} /></div>
}

function CreateCardForm({ walletAccountId, onDone }: { walletAccountId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [label, setLabel] = React.useState("Carte VTEX")
  const [lastFour, setLastFour] = React.useState("")
  const [network, setNetwork] = React.useState<"visa" | "mastercard" | "cb">("visa")
  const [expiresAt, setExpiresAt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const dateValue = new Date(expiresAt)
    if (!/^\d{4}$/.test(lastFour) || Number.isNaN(dateValue.getTime())) return show("Renseignez quatre chiffres et une date d’expiration valide.", "error")
    setBusy(true)
    try { await api.cards.create.mutate({ walletAccountId, label, lastFour, network, expiresAt: dateValue }); await onDone(); show("Carte créée et notifiée.") } catch (error) { show(apiError(error, "Création de carte impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Émettre une carte</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Libellé de carte" value={label} onChange={(event) => setLabel(event.target.value)} /><Input aria-label="Quatre derniers chiffres" value={lastFour} onChange={(event) => setLastFour(event.target.value)} placeholder="1234" maxLength={4} /><select aria-label="Réseau de carte" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={network} onChange={(event) => setNetwork(event.target.value as "visa" | "mastercard" | "cb")}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="cb">CB</option></select><Input aria-label="Date d’expiration" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Émettre"}</Button></div>
}

function BeneficiaryPanel({ beneficiary, canOperate, onChanged }: { beneficiary: BeneficiaryDetail; canOperate: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const [fullName, setFullName] = React.useState(beneficiary.fullName)
  const [nickname, setNickname] = React.useState(beneficiary.nickname ?? "")
  const [iban, setIban] = React.useState(beneficiary.iban)
  const [bic, setBic] = React.useState(beneficiary.bic ?? "")
  const [internalWalletAccountId, setInternalWalletAccountId] = React.useState(beneficiary.internalWalletAccountId ? String(beneficiary.internalWalletAccountId) : "")
  const [status, setStatus] = React.useState<"active" | "disabled">(beneficiary.status)
  const [busy, setBusy] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  async function save() {
    const internalId = internalWalletAccountId.trim() ? Number(internalWalletAccountId) : null
    if (fullName.trim().length < 2 || iban.trim().length < 15 || (internalId !== null && (!Number.isInteger(internalId) || internalId <= 0))) return show("Vérifiez le nom, l’IBAN et le lien interne éventuel.", "error")
    setBusy(true)
    try { await api.beneficiaries.update.mutate({ id: beneficiary.id, fullName: fullName.trim(), nickname: nickname.trim() || undefined, iban: iban.trim(), bic: bic.trim() || undefined, internalWalletAccountId: internalId, status }); await onChanged(); show("Bénéficiaire mis à jour et journalisé.") } catch (error) { show(apiError(error, "Mise à jour du bénéficiaire impossible."), "error") } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true)
    try { await api.beneficiaries.delete.mutate({ id: beneficiary.id }); await onChanged(); show("Bénéficiaire supprimé et journalisé.") } catch (error) { show(apiError(error, "Suppression du bénéficiaire impossible."), "error") } finally { setBusy(false); setDeleteOpen(false) }
  }
  return <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{beneficiary.fullName}</p><p className="text-xs text-gray-500">{beneficiary.nickname ?? beneficiary.iban} · {beneficiary.iban.slice(-4)}</p></div><Badge variant={statusVariant(beneficiary.status)}>{beneficiary.status}</Badge></div>{canOperate ? <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-2"><Input aria-label="Nom complet" value={fullName} onChange={(event) => setFullName(event.target.value)} /><Input aria-label="Surnom" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Surnom" /></div><Input aria-label="IBAN du bénéficiaire" value={iban} onChange={(event) => setIban(event.target.value)} /><div className="grid grid-cols-2 gap-2"><Input aria-label="BIC du bénéficiaire" value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BIC facultatif" /><Input aria-label="Compte Wallet interne" value={internalWalletAccountId} onChange={(event) => setInternalWalletAccountId(event.target.value)} placeholder="Compte interne facultatif" inputMode="numeric" /></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Statut du bénéficiaire" className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-800 dark:bg-gray-950" value={status} onChange={(event) => setStatus(event.target.value as "active" | "disabled")}><option value="active">Actif</option><option value="disabled">Désactivé</option></select><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button><Button variant="destructive" className="h-8 text-xs" disabled={busy} onClick={() => setDeleteOpen(true)}>Supprimer</Button></div><p className="text-xs text-gray-500">La suppression est définitive et échouera si ce bénéficiaire a des transferts associés — désactivez-le dans ce cas pour conserver l’historique.</p></div> : null}<ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Supprimer ce bénéficiaire ?" description="Cette action est définitive et journalisée. Elle échouera si des transferts référencent encore ce bénéficiaire." confirmLabel="Supprimer" destructive onConfirm={() => void remove()} /></div>
}

function CreateBeneficiaryForm({ walletAccountId, onDone }: { walletAccountId: number; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [fullName, setFullName] = React.useState("")
  const [iban, setIban] = React.useState("")
  const [bic, setBic] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    if (fullName.trim().length < 2 || iban.trim().length < 15) return show("Renseignez un bénéficiaire et un IBAN valides.", "error")
    setBusy(true)
    try { await api.walletAdmin.createBeneficiary.mutate({ walletAccountId, fullName: fullName.trim(), iban: iban.trim(), bic: bic.trim() || undefined }); await onDone(); show("Bénéficiaire créé, validé et journalisé."); setFullName(""); setIban(""); setBic("") } catch (error) { show(apiError(error, "Création du bénéficiaire impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Ajouter un bénéficiaire</p><div className="space-y-2"><Input aria-label="Nom du bénéficiaire" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nom complet" /><Input aria-label="IBAN" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IBAN" /><Input aria-label="BIC" value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BIC facultatif" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Ajouter"}</Button></div>
}

function SavingsGoalPanel({ goal, canAdjust, onChanged }: { goal: SavingsGoalDetail; canAdjust: boolean; onChanged: () => Promise<void> }) {
  const { show } = useToast()
  const { money } = useMoney()
  const [name, setName] = React.useState(goal.name)
  const [target, setTarget] = React.useState(centsToInput(goal.targetCents, goal.currency))
  const [dueAt, setDueAt] = React.useState(goal.dueAt ? new Date(goal.dueAt).toISOString().slice(0, 10) : "")
  const [fund, setFund] = React.useState("")
  const [closeOpen, setCloseOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!canAdjust) return <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800"><p className="font-medium">{goal.name}</p><p className="text-xs text-gray-500">{money(goal.currentCents, goal.currency)} sur {money(goal.targetCents, goal.currency)} · {goal.status}</p></div>
  async function save() {
    const targetCents = amountToCents(target, goal.currency)
    if (name.trim().length < 2 || targetCents <= 0) return show("Renseignez un nom et une cible valides.", "error")
    setBusy(true)
    try { await api.savingsGoals.update.mutate({ goalId: goal.id, name: name.trim(), targetCents, dueAt: dueAt ? new Date(dueAt) : null }); await onChanged(); show("Objectif mis à jour.") } catch (error) { show(apiError(error, "Mise à jour de l’objectif impossible."), "error") } finally { setBusy(false) }
  }
  async function fundGoal() {
    const amountCents = amountToCents(fund, goal.currency)
    if (amountCents <= 0) return show("Saisissez un montant strictement positif.", "error")
    setBusy(true)
    try { await api.savingsGoals.fund.mutate({ goalId: goal.id, amountCents, idempotencyKey: idempotency("savings-fund") }); await onChanged(); show("Objectif alimenté et journalisé."); setFund("") } catch (error) { show(apiError(error, "Alimentation impossible."), "error") } finally { setBusy(false) }
  }
  async function close() {
    setBusy(true)
    try { await api.savingsGoals.close.mutate({ goalId: goal.id, idempotencyKey: idempotency("savings-close") }); await onChanged(); show("Objectif clôturé et solde restitué.") } catch (error) { show(apiError(error, "Clôture impossible."), "error") } finally { setBusy(false); setCloseOpen(false) }
  }
  return <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800"><div className="flex items-start justify-between gap-2"><p className="font-medium">{goal.name}</p><Badge variant={statusVariant(goal.status)}>{goal.status}</Badge></div><p className="mt-1 text-xs text-gray-500">{money(goal.currentCents, goal.currency)} sur {money(goal.targetCents, goal.currency)} · échéance {date(goal.dueAt)}</p>{goal.status !== "archived" ? <div className="mt-3 space-y-2"><div className="grid grid-cols-3 gap-2"><Input aria-label="Nom de l’objectif" value={name} onChange={(event) => setName(event.target.value)} /><Input aria-label="Cible de l’objectif" value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" /><Input aria-label="Échéance de l’objectif" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div className="flex flex-wrap gap-2"><Button className="h-8 text-xs" disabled={busy} onClick={() => void save()}>Enregistrer</Button><Input aria-label="Montant à déposer" className="h-8 max-w-28" value={fund} onChange={(event) => setFund(event.target.value)} placeholder="Montant" inputMode="decimal" /><Button variant="secondary" className="h-8 text-xs" disabled={busy || goal.status !== "active"} onClick={() => void fundGoal()}>Alimenter</Button><Button variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => setCloseOpen(true)}>Clôturer</Button></div></div> : null}<ConfirmDialog open={closeOpen} onOpenChange={setCloseOpen} title="Clôturer cet objectif ?" description="Le solde épargné sera restitué au compte disponible par une opération journalisée." confirmLabel="Clôturer" destructive onConfirm={() => void close()} /></div>
}

function CreateSavingsGoalForm({ walletAccountId, currency, onDone }: { walletAccountId: number; currency: string; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [name, setName] = React.useState("")
  const [target, setTarget] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    const targetCents = amountToCents(target, currency)
    if (name.trim().length < 2 || targetCents <= 0) return show("Renseignez un nom et une cible strictement positive.", "error")
    setBusy(true)
    try { await api.savingsGoals.create.mutate({ walletAccountId, name: name.trim(), targetCents }); await onDone(); show("Objectif créé."); setName(""); setTarget("") } catch (error) { show(apiError(error, "Création de l’objectif impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium text-gray-500">Créer un objectif</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Nom de l’objectif" value={name} onChange={(event) => setName(event.target.value)} placeholder="Projet" /><Input aria-label="Cible" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Montant" inputMode="decimal" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit()}>{busy ? "Création…" : "Créer"}</Button></div>
}

function TransferConsole({ wallet, beneficiaries, onDone }: { wallet: AdminWalletDetail["account"]; beneficiaries: BeneficiaryDetail[]; onDone: () => Promise<void> }) {
  const { show } = useToast()
  const [destination, setDestination] = React.useState("")
  const [internalAmount, setInternalAmount] = React.useState("")
  const [externalAmount, setExternalAmount] = React.useState("")
  const [beneficiaryId, setBeneficiaryId] = React.useState("")
  const [recipients, setRecipients] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function internal() {
    const toWalletAccountId = Number(destination); const amountCents = amountToCents(internalAmount, wallet.currency)
    if (!Number.isInteger(toWalletAccountId) || amountCents <= 0) return show("Renseignez un compte destinataire et un montant valides.", "error")
    setBusy(true)
    try { await api.transactions.transferInternal.mutate({ fromWalletAccountId: wallet.id, toWalletAccountId, amountCents, idempotencyKey: idempotency("internal-transfer") }); await onDone(); show("Virement interne exécuté.") } catch (error) { show(apiError(error, "Virement interne impossible."), "error") } finally { setBusy(false) }
  }
  async function external() {
    const amountCents = amountToCents(externalAmount, wallet.currency); const id = Number(beneficiaryId)
    if (!Number.isInteger(id) || amountCents <= 0) return show("Sélectionnez un bénéficiaire et un montant valides.", "error")
    setBusy(true)
    try { await api.transactions.transferExternal.mutate({ walletAccountId: wallet.id, beneficiaryId: id, amountCents, idempotencyKey: idempotency("external-transfer") }); await onDone(); show("Ordre externe créé, en attente de validation.") } catch (error) { show(apiError(error, "Création de l’ordre externe impossible."), "error") } finally { setBusy(false) }
  }
  async function share() {
    const parsed = recipients.split(",").map((part) => part.trim()).filter(Boolean).map((part) => { const [id, amount] = part.split(":"); return { walletAccountId: Number(id), amountCents: amountToCents(amount ?? "", wallet.currency) } })
    if (parsed.length === 0 || parsed.some((recipient) => !Number.isInteger(recipient.walletAccountId) || recipient.amountCents <= 0)) return show("Utilisez le format compte:montant, séparé par des virgules.", "error")
    setBusy(true)
    try { await api.transactions.shareFunds.mutate({ fromWalletAccountId: wallet.id, recipients: parsed, idempotencyKey: idempotency("share-funds") }); await onDone(); show("Partage de fonds exécuté.") } catch (error) { show(apiError(error, "Partage de fonds impossible."), "error") } finally { setBusy(false) }
  }
  return <div className="space-y-3"><div className="rounded-md border border-gray-200 p-3 dark:border-gray-800"><p className="mb-2 text-xs font-medium text-gray-500">Virement interne</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Compte destinataire" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Compte #" inputMode="numeric" /><Input aria-label="Montant du virement interne" value={internalAmount} onChange={(event) => setInternalAmount(event.target.value)} placeholder={`Montant ${entrySymbol(wallet.currency)}`} inputMode="decimal" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void internal()}>Exécuter</Button></div><div className="rounded-md border border-gray-200 p-3 dark:border-gray-800"><p className="mb-2 text-xs font-medium text-gray-500">Ordre externe</p><div className="grid grid-cols-2 gap-2"><select aria-label="Bénéficiaire" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-800 dark:bg-gray-950" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)}><option value="">Bénéficiaire</option>{beneficiaries.filter((beneficiary) => beneficiary.status === "active").map((beneficiary) => <option value={beneficiary.id} key={beneficiary.id}>{beneficiary.fullName} · {beneficiary.iban.slice(-4)}</option>)}</select><Input aria-label="Montant de l’ordre externe" value={externalAmount} onChange={(event) => setExternalAmount(event.target.value)} placeholder={`Montant ${entrySymbol(wallet.currency)}`} inputMode="decimal" /></div><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void external()}>Créer l’ordre</Button></div><div className="rounded-md border border-gray-200 p-3 dark:border-gray-800"><p className="mb-2 text-xs font-medium text-gray-500">Partage de fonds</p><Input aria-label="Destinataires du partage" value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="Compte:montant, Compte:montant" /><Button className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void share()}>Partager</Button></div></div>
}
