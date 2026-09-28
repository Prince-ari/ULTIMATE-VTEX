"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PaymentLinkDrawer } from "@/components/admin/paymentlinks/PaymentLinkDrawer"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegPill, LegSocle, LegTabs } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"
import { LINK_STATUS_LABEL, LINK_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, cardLabel, formatTotals, isOpenPayment, money, socleFor, sumByCurrency } from "@/lib/paymentLinkFormat"
import type { PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type LinkRow = Outputs["admin"]["paymentLinks"]["list"][number]
type PaymentRow = Outputs["admin"]["paymentLinks"]["payments"][number]
type Tab = "links" | "payments"

export default function LiensDePaiementPage() {
  const { show } = useToast()
  const [links, setLinks] = React.useState<LinkRow[]>([])
  const [payments, setPayments] = React.useState<PaymentRow[]>([])
  const [me, setMe] = React.useState<{ id: number; role: PlatformRole } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<Tab>("links")
  const [search, setSearch] = React.useState("")
  const [linkStatus, setLinkStatus] = React.useState("all")
  const [paymentStatus, setPaymentStatus] = React.useState("all")
  const [selected, setSelected] = React.useState<number | null>(null)

  const refetch = React.useCallback(async () => {
    const [linkRows, paymentRows] = await Promise.all([api.admin.paymentLinks.list.query(), api.admin.paymentLinks.payments.query({ limit: 300 })])
    setLinks(linkRows)
    setPayments(paymentRows)
  }, [])

  React.useEffect(() => {
    api.users.getMe.query().then((user) => setMe({ id: user.id, role: user.role as PlatformRole })).catch(() => setMe(null))
  }, [])
  React.useEffect(() => {
    setLoading(true)
    refetch().catch((error) => show(error instanceof Error ? error.message : "Impossible de charger les liens de paiement.", "error")).finally(() => setLoading(false))
  }, [refetch, show])
  // Lien direct depuis une autre fiche : /liens-de-paiement?lien=12
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("lien")
    if (param && /^\d+$/.test(param)) setSelected(Number(param))
  }, [])

  const needle = search.trim().toLowerCase()
  const filteredLinks = links
    .filter((link) => linkStatus === "all" || link.status === linkStatus)
    .filter((link) => !needle || [link.name, link.slug, link.business.brandName, link.description ?? "", link.createdBy].some((value) => value.toLowerCase().includes(needle)))
  const filteredPayments = payments
    .filter((payment) => paymentStatus === "all" || (paymentStatus === "open" ? isOpenPayment(payment.status) : payment.status === paymentStatus))
    .filter((payment) => !needle || [payment.reference, payment.payerName ?? "", payment.payerEmail ?? "", payment.link.name, payment.business.brandName].some((value) => value.toLowerCase().includes(needle)))

  const active = links.filter((link) => link.status === "active").length
  const collected = payments.filter((payment) => payment.status === "succeeded")
  const revenue = formatTotals(sumByCurrency(collected.map((payment) => ({ currency: payment.currency, cents: payment.amountCents }))))
  const toReview = payments.filter((payment) => isOpenPayment(payment.status) || payment.status === "failed").length
  const count = tab === "links" ? filteredLinks.length : filteredPayments.length

  return (
    <div className="dashboard-home">
      <header className="dashboard-page-header">
        <div className="dashboard-page-intro">
          <p className="dashboard-kicker">Encaissements · Wallet Pro</p>
          <h1>Liens de paiement</h1>
          <p>Tous les liens créés par les entreprises et les paiements reçus. Un paiement n'est crédité qu'après vérification auprès du prestataire ; suspendre un lien ou rembourser un paiement se justifie et entre au journal.</p>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="dashboard-icon-button" onClick={() => void refetch().catch((error) => show(error instanceof Error ? error.message : "Actualisation impossible.", "error"))} aria-label="Actualiser" title="Actualiser"><LegIcon name="refresh" style={{ width: 20, height: 20 }} /></button>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Indicateurs liens de paiement">
        <Kpi tone="violet" icon="link" label="Liens" value={String(links.length)} detail="Toutes entreprises" onClick={() => { setTab("links"); setLinkStatus("all") }} />
        <Kpi tone="green" icon="check" label="Actifs" value={String(active)} detail="Acceptent des paiements" onClick={() => { setTab("links"); setLinkStatus("active") }} />
        <Kpi tone="teal" icon="wallet" label="Encaissé" value={revenue} detail={`${collected.length} paiement${collected.length > 1 ? "s" : ""}`} onClick={() => { setTab("payments"); setPaymentStatus("succeeded") }} />
        <Kpi tone="amber" icon="alert" label="À examiner" value={String(toReview)} detail="En cours ou refusés" onClick={() => { setTab("payments"); setPaymentStatus(payments.some((payment) => isOpenPayment(payment.status)) ? "open" : "failed") }} />
      </section>

      <div className="cards-toolbar">
        <LegTabs<Tab> idPrefix="pl" label="Vue" value={tab} onChange={setTab} tabs={[{ id: "links", label: `Liens (${links.length})` }, { id: "payments", label: `Paiements (${payments.length})` }]} />
        <div className="cards-search">
          <LegIcon name="search" className="lg-input-lead" />
          <input type="search" className="lg-input lg-input-icon" placeholder={tab === "links" ? "Nom, entreprise, adresse…" : "Payeur, e-mail, référence, lien…"} value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher" />
        </div>
        {tab === "links" ? (
          <select className="lg-input" value={linkStatus} onChange={(event) => setLinkStatus(event.target.value)} aria-label="Statut du lien">
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="disabled">Suspendus</option>
            <option value="expired">Expirés</option>
            <option value="draft">Brouillons</option>
          </select>
        ) : (
          <select className="lg-input" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} aria-label="Statut du paiement">
            <option value="all">Tous les statuts</option>
            <option value="succeeded">Encaissés</option>
            <option value="open">En cours</option>
            <option value="failed">Refusés</option>
            <option value="refunded">Remboursés</option>
            <option value="canceled">Annulés</option>
          </select>
        )}
        <span className="cards-count" role="status">{loading ? "Chargement…" : `${count} ${tab === "links" ? "lien" : "paiement"}${count > 1 ? "s" : ""}`}</span>
      </div>

      {loading ? (
        <section className="dashboard-page-state dashboard-page-state--loading" role="status" aria-live="polite"><span className="dashboard-page-state__indicator" aria-hidden="true" /><div><p className="dashboard-kicker">Liens de paiement</p><strong>Chargement…</strong></div></section>
      ) : tab === "links" ? (
        filteredLinks.length === 0 ? (
          <Empty icon="link" title={links.length === 0 ? "Aucun lien pour l'instant" : "Aucun lien ne correspond"} text={links.length === 0 ? "Les liens apparaissent ici dès qu'une entreprise en crée un depuis Wallet Pro." : "Modifiez la recherche ou le filtre."} />
        ) : (
          <div id="pl-panel-links" role="tabpanel" aria-labelledby="pl-tab-links" className="cards-list">
            {filteredLinks.map((link, index) => (
              <button key={link.id} type="button" className="pl-row" onClick={() => setSelected(link.id)}>
                <LegSocle icon="link" tone={socleFor(index)} size="md" />
                <span className="pl-row-main"><strong>{link.name}</strong><small>{link.status !== "active" ? `${LINK_STATUS_LABEL[link.status]} · ` : ""}{link.business.brandName}{link.target ? ` → ${link.target.label}` : ""} · /pay/{link.slug}</small></span>
                <span className="pl-row-amount">{money(link.amountCents, link.currency)}<small>{link.mode === "unique" ? "Usage unique" : "Réutilisable"} · {link.paid} payé{link.paid > 1 ? "s" : ""}</small></span>
                <LegPill tone={LINK_STATUS_TONE[link.status]} className="lg-pill--status">{LINK_STATUS_LABEL[link.status]}</LegPill>
                <span className="pl-row-total">{money(link.revenueCents, link.currency)}<small>encaissé</small></span>
                <LegIcon name="chevron" className="cards-row-chevron" />
              </button>
            ))}
          </div>
        )
      ) : filteredPayments.length === 0 ? (
        <Empty icon="wallet" title={payments.length === 0 ? "Aucun paiement pour l'instant" : "Aucun paiement ne correspond"} text={payments.length === 0 ? "Les paiements apparaissent ici dès que quelqu'un règle un lien." : "Modifiez la recherche ou le filtre."} />
      ) : (
        <div id="pl-panel-payments" role="tabpanel" aria-labelledby="pl-tab-payments" className="cards-list">
          {filteredPayments.map((payment) => (
            <button key={payment.reference} type="button" className="pl-row" onClick={() => setSelected(payment.link.id)}>
              <LegSocle icon={payment.status === "succeeded" ? "check" : payment.status === "failed" ? "alert" : payment.status === "refunded" ? "undo" : "clock"} tone={payment.status === "succeeded" ? "green" : payment.status === "failed" ? "red" : payment.status === "refunded" ? "platinum" : "amber"} size="md" />
              <span className="pl-row-main"><strong>{payment.payerName ?? "Client"}</strong><small>{PAYMENT_STATUS_LABEL[payment.status]} · {payment.link.name} · {payment.business.brandName}</small></span>
              <span className="pl-row-amount">{money(payment.amountCents, payment.currency)}<small>{cardLabel(payment.cardBrand, payment.cardLast4)}</small></span>
              <LegPill tone={PAYMENT_STATUS_TONE[payment.status]} className="lg-pill--status">{PAYMENT_STATUS_LABEL[payment.status]}</LegPill>
              <span className="pl-row-total pl-row-when">{formatDateTime(payment.createdAt)}<small className="lg-mono">{payment.reference}</small></span>
              <LegIcon name="chevron" className="cards-row-chevron" />
            </button>
          ))}
        </div>
      )}

      {me ? <PaymentLinkDrawer linkId={selected} me={me} onClose={() => setSelected(null)} onChanged={() => refetch().catch(() => undefined)} /> : null}
    </div>
  )
}

function Empty({ icon, title, text }: { icon: "link" | "wallet"; title: string; text: string }) {
  return (
    <div className="cards-empty" role="status">
      <LegSocle icon={icon} size="lg" tone="platinum" />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function Kpi({ tone, icon, label, value, detail, onClick }: { tone: "violet" | "green" | "teal" | "amber"; icon: "link" | "check" | "wallet" | "alert"; label: string; value: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="dashboard-metric-card lg-kpi" onClick={onClick}>
      <LegSocle icon={icon} tone={tone} size="md" />
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </button>
  )
}
