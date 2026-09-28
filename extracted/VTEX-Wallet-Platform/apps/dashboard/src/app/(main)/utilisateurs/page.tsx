"use client"

import * as React from "react"
import { Plus } from "@phosphor-icons/react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { KpiRow } from "@/components/admin/KpiRow"
import { FilterBar } from "@/components/admin/FilterBar"
import { DataTable } from "@/components/admin/DataTable"
import { NativeSelect } from "@/components/admin/NativeSelect"
import { useToast } from "@/components/admin/Toast"
import { NewUserDialog, type CreatedUser } from "@/components/admin/users/NewUserDialog"
import { TemporaryPasswordDialog } from "@/components/admin/users/TemporaryPasswordDialog"
import { UserFileDrawer } from "@/components/admin/users/UserFileDrawer"
import { formatDate, formatDateTime, STATUS_BADGE, STATUS_LABEL } from "@/lib/adminFormat"
import { ROLE_LABEL, isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { filterUsers } from "@/lib/userFilters"

type Outputs = inferRouterOutputs<AppRouter>
type ManagedUser = Outputs["admin"]["users"]["list"][number]
type CurrencyOption = Outputs["config"]["currencies"][number]

const WALLET_TYPE_LABEL = { PERSONAL: "Personnel", PROFESSIONAL: "Pro" } as const

export default function UtilisateursPage() {
  const { show } = useToast()
  const [users, setUsers] = React.useState<ManagedUser[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState("all")
  const [walletType, setWalletType] = React.useState("")
  const [currency, setCurrency] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [created, setCreated] = React.useState<null | { email: string; password: string; expiresAt: Date; walletLabel: string }>(null)

  const refetch = React.useCallback(async () => {
    setUsers(await api.admin.users.list.query({
      walletType: walletType ? (walletType as "PERSONAL" | "PROFESSIONAL") : undefined,
      currency: currency ? (currency as "EUR" | "USD" | "XPF") : undefined,
    }))
  }, [walletType, currency])

  React.useEffect(() => {
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
    api.config.currencies.query().then(setCurrencies).catch(() => setCurrencies([]))
  }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les utilisateurs.", "error")).finally(() => setLoading(false))
  }, [refetch, show])

  const filtered = filterUsers(users, search, filter)
  const canCreate = isAdmin(me?.role)

  async function handleCreated(result: CreatedUser, email: string) {
    await refetch().catch(() => undefined)
    setSelectedId(result.userId)
    if (result.temporaryPassword) {
      setCreated({ email, password: result.temporaryPassword, expiresAt: result.expiresAt, walletLabel: result.walletType === "PERSONAL" ? "Wallet personnel" : "Wallet professionnel" })
    } else {
      show(`Compte créé (${result.walletType === "PERSONAL" ? "wallet personnel" : "wallet professionnel"}). Le mot de passe saisi doit être remplacé à la première connexion.`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">Utilisateurs</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-500">Identité, wallets, rôles, sécurité et activité — une fiche centrale par compte.</p></div>
        {canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="-ml-0.5 mr-1 size-4" />Nouvel utilisateur</Button> : null}
      </div>

      <KpiRow items={[
        { label: "Total comptes", value: String(users.length) },
        { label: "Actifs", value: String(users.filter((user) => user.status === "active").length) },
        { label: "Suspendus", value: String(users.filter((user) => user.status === "suspended").length) },
        { label: "KYC en attente", value: String(users.filter((user) => !user.kycVerified).length) },
      ]} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Nom ou email..."
        filters={[{ label: "Tous", value: "all" }, { label: "Actifs", value: "active" }, { label: "Suspendus", value: "suspended" }, { label: "KYC en attente", value: "kyc_pending" }]}
        activeFilter={filter}
        onFilterChange={setFilter}
        action={<div className="flex gap-2">
          <NativeSelect aria-label="Filtrer par type de wallet" value={walletType} onChange={(event) => setWalletType(event.target.value)} className="py-1.5">
            <option value="">Tous les wallets</option>
            <option value="PERSONAL">Personnel</option>
            <option value="PROFESSIONAL">Professionnel</option>
          </NativeSelect>
          <NativeSelect aria-label="Filtrer par devise" value={currency} onChange={(event) => setCurrency(event.target.value)} className="py-1.5">
            <option value="">Toutes devises</option>
            {currencies.map((option) => <option key={option.code} value={option.code}>{option.symbol} {option.code}</option>)}
          </NativeSelect>
        </div>}
      />

      {loading ? <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">Chargement des utilisateurs...</div> : <DataTable columns={[
        { header: "Nom", render: (user: ManagedUser) => <span className="font-medium text-gray-900 dark:text-gray-50">{user.firstName} {user.lastName}</span> },
        { header: "Email", render: (user: ManagedUser) => user.email },
        { header: "Wallet", render: (user: ManagedUser) => user.walletTypes.length === 0 ? <span className="text-gray-400">—</span> : <span className="flex gap-1">{user.walletTypes.map((type) => <Badge key={type} variant="default">{WALLET_TYPE_LABEL[type]}</Badge>)}</span> },
        { header: "Devises", render: (user: ManagedUser) => user.currencies.length ? user.currencies.join(" · ") : "—" },
        { header: "Statut", render: (user: ManagedUser) => <Badge variant={STATUS_BADGE[user.status]}>{STATUS_LABEL[user.status]}</Badge> },
        { header: "Rôle", render: (user: ManagedUser) => <Badge variant="neutral">{ROLE_LABEL[user.role as PlatformRole]}</Badge> },
        { header: "Dernière activité", render: (user: ManagedUser) => user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "—" },
        { header: "Créé le", render: (user: ManagedUser) => formatDate(user.createdAt) },
      ]} rows={filtered} getRowKey={(user) => user.id} onRowClick={(user) => setSelectedId(user.id)} emptyLabel="Aucun utilisateur ne correspond à ces filtres." />}

      {me ? <UserFileDrawer userId={selectedId} me={me} onClose={() => setSelectedId(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}

      <NewUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

      {created ? <TemporaryPasswordDialog open title={`Compte créé — ${created.walletLabel}`} email={created.email} password={created.password} expiresAt={created.expiresAt} onClose={() => setCreated(null)} /> : null}
    </div>
  )
}
