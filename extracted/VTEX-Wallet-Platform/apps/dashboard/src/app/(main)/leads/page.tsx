"use client"

import * as React from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { KpiRow } from "@/components/admin/KpiRow"
import { FilterBar } from "@/components/admin/FilterBar"
import { DataTable } from "@/components/admin/DataTable"
import {
  DrawerRow,
  DrawerSection,
  ModuleDrawer,
} from "@/components/admin/ModuleDrawer"
import { useToast } from "@/components/admin/Toast"
import { formatDate, STATUS_BADGE, STATUS_LABEL } from "@/lib/adminFormat"
import { api } from "@/lib/trpc"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

type Outputs = inferRouterOutputs<AppRouter>
type AdminLead = Outputs["leads"]["list"][number]
type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost"

const KANBAN_COLUMNS: LeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"]

export default function LeadsPage() {
  const { show } = useToast()
  const [leads, setLeads] = React.useState<AdminLead[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState("all")
  const [selected, setSelected] = React.useState<AdminLead | null>(null)
  const [view, setView] = React.useState<"list" | "kanban">("list")

  const refetch = React.useCallback(async () => {
    const l = await api.leads.list.query()
    setLeads(l)
  }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch()
      .catch(() => show("Impossible de charger les leads.", "error"))
      .finally(() => setLoading(false))
  }, [refetch, show])

  const filtered = leads.filter((l) => {
    const matchesSearch =
      search.trim() === "" ||
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "all" ? true : l.status === filter
    return matchesSearch && matchesFilter
  })

  async function moveStatus(lead: AdminLead, status: LeadStatus) {
    try {
      await api.leads.update.mutate({ id: lead.id, status })
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)))
      setSelected((prev) => (prev && prev.id === lead.id ? { ...prev, status } : prev))
    } catch (err) {
      show(err instanceof Error ? err.message : "Action impossible.", "error")
    }
  }

  async function convert(lead: AdminLead) {
    if (!lead.email) {
      show("Ce lead n'a pas d'email — impossible de le convertir.", "error")
      return
    }
    const temporaryPassword = Math.random().toString(36).slice(2, 10) + "Aa1!"
    try {
      await api.leads.convertToUser.mutate({ id: lead.id, temporaryPassword })
      await refetch()
      show(`${lead.firstName} ${lead.lastName} converti — mot de passe temporaire : ${temporaryPassword}`)
      setSelected(null)
    } catch (err) {
      show(err instanceof Error ? err.message : "Conversion impossible.", "error")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Leads
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">Pipeline commercial.</p>
        </div>
        <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-gray-800">
          <button
            onClick={() => setView("list")}
            className={`rounded px-3 py-1 text-xs font-medium ${view === "list" ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "text-gray-500"}`}
          >
            Liste
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`rounded px-3 py-1 text-xs font-medium ${view === "kanban" ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900" : "text-gray-500"}`}
          >
            Kanban
          </button>
        </div>
      </div>

      <KpiRow
        items={[
          { label: "Total leads", value: String(leads.length) },
          {
            label: "Nouveaux",
            value: String(leads.filter((l) => l.status === "new").length),
          },
          {
            label: "Convertis",
            value: String(leads.filter((l) => l.status === "converted").length),
          },
          {
            label: "Taux de conversion",
            value: `${Math.round((leads.filter((l) => l.status === "converted").length / Math.max(leads.length, 1)) * 100)}%`,
          },
        ]}
      />

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">
          Chargement des leads...
        </div>
      ) : view === "list" ? (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nom du lead..."
            filters={[
              { label: "Tous", value: "all" },
              { label: "Nouveau", value: "new" },
              { label: "Contacté", value: "contacted" },
              { label: "Qualifié", value: "qualified" },
              { label: "Converti", value: "converted" },
              { label: "Perdu", value: "lost" },
            ]}
            activeFilter={filter}
            onFilterChange={setFilter}
          />
          <DataTable
            columns={[
              {
                header: "Nom",
                render: (l: AdminLead) => `${l.firstName} ${l.lastName}`,
              },
              {
                header: "Contact",
                render: (l: AdminLead) => l.email ?? l.phone ?? "—",
              },
              { header: "Source", render: (l: AdminLead) => l.source ?? "—" },
              {
                header: "Statut",
                render: (l: AdminLead) => (
                  <Badge variant={STATUS_BADGE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                ),
              },
              {
                header: "Créé le",
                render: (l: AdminLead) => formatDate(l.createdAt),
              },
            ]}
            rows={filtered}
            getRowKey={(l) => l.id}
            onRowClick={setSelected}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-3 lg:grid-cols-5">
          {KANBAN_COLUMNS.map((status) => (
            <div key={status} className="min-w-[200px]">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {STATUS_LABEL[status]} ({leads.filter((l) => l.status === status).length})
              </p>
              <div className="space-y-2">
                {leads
                  .filter((l) => l.status === status)
                  .map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900/60"
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{lead.source ?? "Source inconnue"}</p>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ModuleDrawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? `${selected.firstName} ${selected.lastName}` : ""}
        subtitle={selected?.email ?? selected?.phone ?? undefined}
        footer={
          selected &&
          selected.status !== "converted" && (
            <Button onClick={() => convert(selected)}>Convertir en utilisateur</Button>
          )
        }
      >
        {selected && (
          <>
            <DrawerSection title="Détails">
              <DrawerRow label="Source" value={selected.source ?? "—"} />
              <DrawerRow
                label="Statut"
                value={
                  <select
                    value={selected.status}
                    onChange={(e) => moveStatus(selected, e.target.value as LeadStatus)}
                    className="rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-xs dark:border-gray-800"
                  >
                    {KANBAN_COLUMNS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                }
              />
            </DrawerSection>
            <DrawerSection title="Notes">
              {selected.notes.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune note.</p>
              ) : (
                selected.notes.map((n, i) => (
                  <p key={i} className="text-sm text-gray-600 dark:text-gray-400">
                    {n.body}
                  </p>
                ))
              )}
            </DrawerSection>
          </>
        )}
      </ModuleDrawer>
    </div>
  )
}
