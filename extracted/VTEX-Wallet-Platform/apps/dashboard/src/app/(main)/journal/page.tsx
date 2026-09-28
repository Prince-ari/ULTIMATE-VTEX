"use client"

import * as React from "react"

import { FilterBar } from "@/components/admin/FilterBar"
import { DataTable } from "@/components/admin/DataTable"
import { useToast } from "@/components/admin/Toast"
import { formatDateTime } from "@/lib/adminFormat"
import { api } from "@/lib/trpc"
import { useMoney } from "@/lib/displayCurrency"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

type Outputs = inferRouterOutputs<AppRouter>
type LogEntry = Outputs["journal"]["list"][number]
type AdminUser = Outputs["users"]["list"][number]

/** Libellés lisibles des actions de recharge par carte (wallet perso `wallet.topup.*`, Wallet Pro `business.topup.*`). */
const TOPUP_ACTIONS: Record<string, string> = {
  create: "Recharge initiée",
  credit: "Recharge créditée",
  mismatch: "Écart de paiement détecté",
  reconcile: "Recharge réconciliée",
  cancel: "Recharge annulée",
  refund: "Recharge remboursée",
}
/** Libellés des interventions administratives sur les entreprises et les RIB (Dashboard). */
const ADMIN_ACTIONS: Record<string, string> = {
  "admin.business.create": "Entreprise créée",
  "admin.business.balance_adjust": "Solde Wallet Pro mis à jour",
  "admin.business.bank_details_assign": "RIB Wallet Pro attribué",
  "admin.business.bank_details_rotate": "RIB Wallet Pro remplacé",
  "admin.business.bank_details_revoke": "RIB Wallet Pro retiré",
  "business.wallet.provision_bank_details": "RIB Wallet Pro généré",
}
const isTopupAction = (action: string) => /^(wallet|business)\.topup\./.test(action)
function actionLabel(action: string) {
  if (ADMIN_ACTIONS[action]) return ADMIN_ACTIONS[action]
  if (!isTopupAction(action)) return action
  const [scope, , verb = ""] = action.split(".")
  return `${TOPUP_ACTIONS[verb] ?? verb} · ${scope === "business" ? "Wallet Pro" : "Wallet perso"}`
}
function formatDetail(action: string, detail: unknown, money: (cents: number, currency?: string) => string) {
  if (!detail) return "—"
  if (typeof detail !== "object") return JSON.stringify(detail)
  if (ADMIN_ACTIONS[action]) {
    const d = detail as { deltaCents?: number; ibanLast4?: string; previousIbanLast4?: string | null; reason?: string; legalName?: string }
    return [
      d.legalName,
      typeof d.deltaCents === "number" ? `${d.deltaCents >= 0 ? "+" : "−"}${money(Math.abs(d.deltaCents))}` : null,
      d.ibanLast4 ? `IBAN …${d.ibanLast4}` : null,
      d.previousIbanLast4 ? `ancien IBAN …${d.previousIbanLast4}` : null,
      d.reason ? `motif : ${d.reason}` : null,
    ].filter(Boolean).join(" · ") || JSON.stringify(detail)
  }
  if (!isTopupAction(action)) return JSON.stringify(detail)
  const d = detail as { reference?: string; amountCents?: number; currency?: string; status?: string; reason?: string; mode?: string }
  const parts = [
    d.reference,
    typeof d.amountCents === "number" ? money(d.amountCents, d.currency ?? "EUR") : null,
    d.mode ? `mode ${d.mode}` : null,
    d.status ? `statut ${d.status}` : null,
    d.reason ? `motif : ${d.reason}` : null,
  ].filter(Boolean)
  return parts.join(" · ")
}

export default function JournalPage() {
  const { show } = useToast()
  const { money } = useMoney()
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState("all")

  React.useEffect(() => {
    setLoading(true)
    Promise.all([api.journal.list.query({ limit: 200 }), api.users.list.query()])
      .then(([l, u]) => {
        setLogs(l)
        setUsers(u)
      })
      .catch(() => show("Impossible de charger le journal.", "error"))
      .finally(() => setLoading(false))
  }, [show])

  function userLabel(userId: number) {
    const u = users.find((x) => x.id === userId)
    return u ? `${u.firstName} ${u.lastName}` : `#${userId}`
  }

  const filtered = logs.filter((l) => {
    const matchesSearch = search.trim() === "" || `${l.action} ${actionLabel(l.action)} ${formatDetail(l.action, l.detail, money)}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "all" ? true : filter === "topup" ? isTopupAction(l.action) : filter === "business" ? /^(admin\.)?business\./.test(l.action) : l.targetType === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
          Journal système
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Traçabilité de toutes les actions sensibles. Lecture seule — aucune modification ou
          suppression n&apos;est possible depuis cet écran.
        </p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Type d'action..."
        filters={[
          { label: "Tout", value: "all" },
          { label: "Wallet", value: "wallet" },
          { label: "Carte", value: "card" },
          { label: "Utilisateur", value: "user" },
          { label: "Transaction", value: "transaction" },
          { label: "Recharges", value: "topup" },
          { label: "Wallet Pro", value: "business" },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
      />

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">
          Chargement du journal...
        </div>
      ) : (
        <DataTable
          columns={[
            {
              header: "Date",
              render: (l: LogEntry) => formatDateTime(l.createdAt),
            },
            {
              header: "Auteur",
              render: (l: LogEntry) => (l.actorId ? userLabel(l.actorId) : "Système"),
            },
            { header: "Action", render: (l: LogEntry) => isTopupAction(l.action) ? <div><div className="font-medium">{actionLabel(l.action)}</div><div className="font-mono text-xs text-gray-500">{l.action}</div></div> : l.action },
            {
              header: "Cible",
              render: (l: LogEntry) => `${l.targetType} #${l.targetId}`,
            },
            {
              header: "Détail",
              render: (l: LogEntry) => formatDetail(l.action, l.detail, money),
            },
          ]}
          rows={filtered}
          getRowKey={(l) => l.id}
          emptyLabel="Aucune entrée."
        />
      )}
    </div>
  )
}
