"use client"

import * as React from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { KpiRow } from "@/components/admin/KpiRow"
import { FilterBar } from "@/components/admin/FilterBar"
import { DataTable } from "@/components/admin/DataTable"
import { ModuleDrawer } from "@/components/admin/ModuleDrawer"
import { useToast } from "@/components/admin/Toast"
import { formatDateTime, STATUS_BADGE, STATUS_LABEL } from "@/lib/adminFormat"
import { api } from "@/lib/trpc"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

type Outputs = inferRouterOutputs<AppRouter>
type SupportTicket = Outputs["support"]["list"][number]
type AdminUser = Outputs["users"]["list"][number]
type TicketStatus = "open" | "in_progress" | "resolved"
type TicketPriority = "low" | "normal" | "high"

const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved"]
const PRIORITIES: TicketPriority[] = ["low", "normal", "high"]

export default function SupportPage() {
  const { show } = useToast()
  const [tickets, setTickets] = React.useState<SupportTicket[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState("all")
  const [selected, setSelected] = React.useState<SupportTicket | null>(null)
  const [reply, setReply] = React.useState("")

  const refetch = React.useCallback(async () => {
    const [t, u] = await Promise.all([api.support.list.query(), api.users.list.query()])
    setTickets(t)
    setUsers(u)
  }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch()
      .catch(() => show("Impossible de charger les tickets.", "error"))
      .finally(() => setLoading(false))
  }, [refetch, show])

  function userLabel(userId: number) {
    const u = users.find((x) => x.id === userId)
    return u ? `${u.firstName} ${u.lastName}` : `#${userId}`
  }

  const filtered = tickets.filter((t) => {
    const matchesSearch = search.trim() === "" || t.subject.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "all" ? true : t.status === filter
    return matchesSearch && matchesFilter
  })

  async function updateStatus(ticket: SupportTicket, status: TicketStatus) {
    try {
      await api.support.updateStatus.mutate({ id: ticket.id, status })
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status } : t)))
      setSelected((prev) => (prev && prev.id === ticket.id ? { ...prev, status } : prev))
    } catch (err) {
      show(err instanceof Error ? err.message : "Action impossible.", "error")
    }
  }

  async function updatePriority(ticket: SupportTicket, priority: TicketPriority) {
    try {
      await api.support.updatePriority.mutate({ id: ticket.id, priority })
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, priority } : t)))
      setSelected((prev) => (prev && prev.id === ticket.id ? { ...prev, priority } : prev))
    } catch (err) {
      show(err instanceof Error ? err.message : "Action impossible.", "error")
    }
  }

  async function sendReply(ticket: SupportTicket) {
    if (reply.trim() === "") return
    try {
      await api.support.reply.mutate({ id: ticket.id, body: reply.trim() })
      const refreshed = await api.support.list.query()
      setTickets(refreshed)
      setSelected(refreshed.find((t) => t.id === ticket.id) ?? null)
      setReply("")
      show("Réponse envoyée.")
    } catch (err) {
      show(err instanceof Error ? err.message : "Envoi impossible.", "error")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
          Support
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">Tickets utilisateurs.</p>
      </div>

      <KpiRow
        items={[
          {
            label: "Ouverts",
            value: String(tickets.filter((t) => t.status === "open").length),
          },
          {
            label: "En cours",
            value: String(tickets.filter((t) => t.status === "in_progress").length),
          },
          {
            label: "Résolus",
            value: String(tickets.filter((t) => t.status === "resolved").length),
          },
          {
            label: "Priorité haute",
            value: String(tickets.filter((t) => t.priority === "high").length),
          },
        ]}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Sujet du ticket..."
        filters={[
          { label: "Ouverts", value: "open" },
          { label: "En cours", value: "in_progress" },
          { label: "Résolus", value: "resolved" },
          { label: "Tous", value: "all" },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
      />

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">
          Chargement des tickets...
        </div>
      ) : (
        <DataTable
          columns={[
            {
              header: "Utilisateur",
              render: (t: SupportTicket) => userLabel(t.userId),
            },
            { header: "Sujet", render: (t: SupportTicket) => t.subject },
            {
              header: "Priorité",
              render: (t: SupportTicket) => (
                <Badge
                  variant={
                    t.priority === "high" ? "error" : t.priority === "normal" ? "default" : "neutral"
                  }
                >
                  {STATUS_LABEL[t.priority]}
                </Badge>
              ),
            },
            {
              header: "Statut",
              render: (t: SupportTicket) => (
                <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              ),
            },
            {
              header: "Mise à jour",
              render: (t: SupportTicket) =>
                formatDateTime(t.messages.at(-1)?.createdAt ?? t.createdAt),
            },
          ]}
          rows={filtered}
          getRowKey={(t) => t.id}
          onRowClick={(t) => {
            setSelected(t)
            setReply("")
          }}
          emptyLabel="Aucun ticket."
        />
      )}

      <ModuleDrawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.subject ?? ""}
        subtitle={selected ? userLabel(selected.userId) : ""}
        footer={
          selected && (
            <div className="flex w-full gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Répondre..."
                className="flex-1"
              />
              <Button onClick={() => sendReply(selected)}>Envoyer</Button>
            </div>
          )
        }
      >
        {selected && (
          <>
            <div className="flex gap-2">
              <select
                value={selected.status}
                onChange={(e) => updateStatus(selected, e.target.value as TicketStatus)}
                className="rounded border border-gray-200 bg-transparent px-2 py-1 text-xs dark:border-gray-800"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                value={selected.priority}
                onChange={(e) => updatePriority(selected, e.target.value as TicketPriority)}
                className="rounded border border-gray-200 bg-transparent px-2 py-1 text-xs dark:border-gray-800"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {STATUS_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              {selected.messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.authorRole === "user"
                      ? "bg-gray-100 dark:bg-gray-900"
                      : "ml-auto bg-slate-50 dark:bg-slate-500/10"
                  }`}
                >
                  <p className="text-gray-700 dark:text-gray-300">{m.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{formatDateTime(m.createdAt)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </ModuleDrawer>
    </div>
  )
}
