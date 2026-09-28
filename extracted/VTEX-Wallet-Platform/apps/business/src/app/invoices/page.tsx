"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PageHeader } from "@/components/shell/PageHeader"
import { KpiTile } from "@/components/ui/KpiTile"
import { DataTable } from "@/components/ui/DataTable"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { api } from "@/lib/trpc"
import { useBusinessContext } from "@/lib/business-context"
import { parseToStored, useDisplayCurrency } from "@/lib/display-currency"

type Outputs = inferRouterOutputs<AppRouter>
type Invoice = Outputs["invoices"]["list"][number]
type Customer = Outputs["customers"]["list"][number]

const STATUS_TONE: Record<Invoice["status"], BadgeTone> = {
  draft: "neutral",
  sent: "signature",
  viewed: "signature",
  partial: "gold",
  paid: "positive",
  overdue: "danger",
  cancelled: "neutral",
}
const STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  viewed: "Vue",
  partial: "Partielle",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
}

export default function InvoicesPage() {
  const { businessId } = useBusinessContext()
  const { money } = useDisplayCurrency()
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<"all" | Invoice["status"]>("all")

  const load = React.useCallback(async () => {
    const [i, c] = await Promise.all([api.invoices.list.query({ businessId }), api.customers.list.query({ businessId })])
    setInvoices(i); setCustomers(c)
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  async function markPaid(invoiceId: number, amountCents: number) {
    const rows = await api.invoices.recordPayment.mutate({ businessId, invoiceId, amountCents })
    setInvoices(rows)
  }
  async function send(invoiceId: number) {
    const rows = await api.invoices.updateStatus.mutate({ businessId, invoiceId, status: "sent" })
    setInvoices(rows)
  }
  async function cancel(invoiceId: number) {
    const rows = await api.invoices.updateStatus.mutate({ businessId, invoiceId, status: "cancelled" })
    setInvoices(rows)
  }

  const paid = invoices.filter((i) => i.status === "paid")
  const overdue = invoices.filter((i) => i.status === "overdue")
  const outstanding = invoices.filter((i) => !["paid", "cancelled"].includes(i.status))
  const outstandingCents = outstanding.reduce((sum, i) => sum + i.amountCents, 0)
  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === filter)

  return (
    <>
      <PageHeader
        kicker="Sales"
        title="Facturation"
        description="Compose, envoie, suis. Chaque facture passe par un cycle explicite ; les états sont tenus par le serveur, jamais bricolés côté client."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="À encaisser" value={money(outstandingCents)} hint={`${outstanding.length} en attente`} tone="signature" />
        <KpiTile kicker="Payées" value={String(paid.length)} tone="positive" />
        <KpiTile kicker="En retard" value={String(overdue.length)} tone="danger" />
        <KpiTile kicker="Clients" value={String(customers.length)} hint="rattachés à cette entreprise" />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>Nouvelle facture</CardTitle><CardSubtitle>Créée en Brouillon, à envoyer ensuite.</CardSubtitle></div></CardHeader>
          <CardBody>
            <InvoiceComposer businessId={businessId} customers={customers} onCreated={load} />
          </CardBody>
        </Card>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div><CardTitle>Toutes les factures</CardTitle><CardSubtitle>{filtered.length} facture{filtered.length !== 1 ? "s" : ""}</CardSubtitle></div>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "draft", "sent", "paid", "overdue"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)}
                    className={"rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest " + (filter === f ? "bg-[var(--tint-primary)] text-[var(--c-signature)]" : "text-[var(--c-t3)] hover:text-[var(--c-t1)]")}>
                    {f === "all" ? "Toutes" : STATUS_LABEL[f]}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="px-6 pb-6">
                <DataTable
                  rows={filtered}
                  getRowKey={(i) => i.id}
                  emptyLabel={loading ? "Chargement…" : "Aucune facture."}
                  columns={[
                    { header: "N°", render: (i) => <span className="legday-mono">{i.number}</span> },
                    { header: "Client", render: (i) => <span className="font-bold text-[var(--c-t1)]">{customers.find((c) => c.id === i.customerId)?.name ?? `#${i.customerId}`}</span> },
                    { header: "Émise", render: (i) => new Date(i.issuedAt).toLocaleDateString("fr-FR") },
                    { header: "Échéance", render: (i) => <span className={i.status === "overdue" ? "font-bold text-[var(--c-danger)]" : ""}>{new Date(i.dueAt).toLocaleDateString("fr-FR")}</span> },
                    { header: "Montant", align: "right", render: (i) => <span className="legday-mono">{money(i.amountCents, i.currency)}</span> },
                    { header: "Statut", render: (i) => <Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge> },
                    { header: "", render: (i) => (
                      <div className="flex justify-end gap-1">
                        {i.status === "draft" ? <Button variant="ghost" size="sm" onClick={() => void send(i.id)} aria-label="Envoyer"><Icon name="external" size={14} /></Button> : null}
                        {!["paid", "cancelled"].includes(i.status) ? <Button variant="ghost" size="sm" onClick={() => void markPaid(i.id, i.amountCents)} aria-label="Marquer payée"><Icon name="approve" size={14} /></Button> : null}
                        {!["paid", "cancelled"].includes(i.status) ? <Button variant="ghost" size="sm" onClick={() => void cancel(i.id)} aria-label="Annuler"><Icon name="flag" size={14} /></Button> : null}
                      </div>
                    ) },
                  ]}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function InvoiceComposer({ businessId, customers, onCreated }: { businessId: number; customers: Customer[]; onCreated: () => Promise<void> }) {
  const { business } = useBusinessContext()
  const { display, symbol } = useDisplayCurrency()
  const [customerId, setCustomerId] = React.useState("")
  const [newCustomerName, setNewCustomerName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [dueAt, setDueAt] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    // Montant saisi dans la devise d'affichage (€ ou ₣), stocké dans la devise de l'entreprise à la parité fixe.
    const cents = parseToStored(amount, display, business.currency)
    if (!cents || cents <= 0 || !dueAt) return
    setBusy(true)
    try {
      let cid = customerId ? Number(customerId) : null
      if (!cid && newCustomerName.trim().length >= 2) {
        const created = await api.customers.create.mutate({ businessId, name: newCustomerName.trim() })
        cid = created[0]?.id ?? null
      }
      if (!cid) return
      await api.invoices.create.mutate({ businessId, customerId: cid, dueAt: new Date(dueAt), description: description.trim() || undefined, items: [{ description: description.trim() || "Prestation", quantity: 1, unitPriceCents: cents }] })
      await onCreated()
      setDescription(""); setAmount(""); setDueAt(""); setNewCustomerName("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="legday-kicker mb-1 block text-[9px]">Client</span>
        <div className="rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full appearance-none bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none">
            <option value="" className="bg-[var(--c-s2)]">Nouveau client…</option>
            {customers.map((c) => <option key={c.id} value={c.id} className="bg-[var(--c-s2)]">{c.name}</option>)}
          </select>
        </div>
      </label>
      {!customerId ? (
        <label className="block">
          <span className="legday-kicker mb-1 block text-[9px]">Nom du nouveau client</span>
          <div className="flex items-center rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
            <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Ademola Beltran" className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
          </div>
        </label>
      ) : null}
      <label className="block">
        <span className="legday-kicker mb-1 block text-[9px]">Description</span>
        <div className="flex items-center rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Prestation" className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
        </div>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="legday-kicker mb-1 block text-[9px]">Montant ({symbol})</span>
          <div className="flex items-center rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={display === "XPF" ? "537 000" : "4 500,00"} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
          </div>
        </label>
        <label className="block">
          <span className="legday-kicker mb-1 block text-[9px]">Échéance</span>
          <div className="flex items-center rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
          </div>
        </label>
      </div>
      <Button variant="primary" size="md" className="w-full" disabled={busy} onClick={() => void submit()}>
        <Icon name="invoice" size={14} /> {busy ? "Création…" : "Créer la facture"}
      </Button>
    </div>
  )
}
