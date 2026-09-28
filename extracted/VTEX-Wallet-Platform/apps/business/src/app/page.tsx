"use client"

import * as React from "react"
import Link from "next/link"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { HeroCard } from "@/components/dashboard/HeroCard"
import { CardStage3D } from "@/components/dashboard/CardStage3D"
import { KaleidoTile } from "@/components/dashboard/KaleidoTile"
import { Icon } from "@/components/ui/Icon"
import { api } from "@/lib/trpc"
import { useBusinessContext } from "@/lib/business-context"
import { useDisplayCurrency } from "@/lib/display-currency"
import { canConvert, convert, type Currency } from "@vtex/money"

type Outputs = inferRouterOutputs<AppRouter>

function relativeTime(value: Date | string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "à l’instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(value))
}

/** Accueil Business — composition bento asymétrique appliquant strictement
 *  LEGDAY §4 (gradient 158°), §5 (protocole Leg Day 4 couches), §8 (grille
 *  radius 14/20/32/44), §10 (timeline dotted). Branché sur le vrai backend :
 *  solde, KPIs 30 j, alertes et activité viennent de packages/business. */
export default function DashboardPage() {
  const { business, businessId } = useBusinessContext()
  const { money, numeric, symbol, display } = useDisplayCurrency()
  const [accounts, setAccounts] = React.useState<Outputs["wallet"]["accounts"]>([])
  const [kpis, setKpis] = React.useState<Outputs["businesses"]["kpis"] | null>(null)
  const [transactions, setTransactions] = React.useState<Outputs["wallet"]["listTransactions"]>([])
  const [invoices, setInvoices] = React.useState<Outputs["invoices"]["list"]>([])
  const [payouts, setPayouts] = React.useState<Outputs["payouts"]["list"]>([])
  const [disputes, setDisputes] = React.useState<Outputs["resolution"]["listDisputes"]>([])
  const [riskFlags, setRiskFlags] = React.useState<Outputs["resolution"]["listRiskFlags"]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.wallet.accounts.query({ businessId }),
      api.businesses.kpis.query({ businessId }),
      api.wallet.listTransactions.query({ businessId, limit: 8 }),
      api.invoices.list.query({ businessId }),
      api.payouts.list.query({ businessId }),
      api.resolution.listDisputes.query({ businessId }),
      api.resolution.listRiskFlags.query({ businessId }),
    ]).then(([a, k, t, i, p, d, r]) => {
      if (cancelled) return
      setAccounts(a); setKpis(k); setTransactions(t); setInvoices(i); setPayouts(p); setDisputes(d); setRiskFlags(r)
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [businessId])

  /* Solde total dans la devise d'affichage (€ ou ₣, parité fixe) ; un éventuel compte en dollars n'est jamais converti : il reste hors du total. */
  const convertible = accounts.filter((a) => canConvert(a.currency as Currency, display))
  const totalAvailableCents = convertible.reduce((sum, a) => sum + convert(a.availableBalanceCents, a.currency as Currency, display), 0)
  const excludedAccounts = accounts.length - convertible.length
  const currencies = new Set(accounts.map((a) => a.currency))
  const overdueInvoices = invoices.filter((i) => i.status === "overdue")
  const pendingPayouts = payouts.filter((p) => p.status === "pending_approval")
  const openDisputes = disputes.filter((d) => d.status === "open")
  const openRiskFlags = riskFlags.filter((f) => f.status === "open")

  const kpiCards = kpis ? [
    { kicker: "Encaissé (30 j)", value: money(kpis.revenueCents30d, business.currency), hint: "crédits des 30 derniers jours" },
    { kicker: "Paiements reçus", value: String(kpis.paymentsCount30d), hint: "sur les 30 derniers jours" },
    { kicker: "Panier moyen", value: money(kpis.averageBasketCents, business.currency), hint: "30 derniers jours" },
    { kicker: "Nouveaux clients", value: String(kpis.newCustomers30d), hint: "sur les 30 derniers jours" },
  ] : []

  const alerts: Array<{ tone: "warm" | "signature" | "danger" | "positive"; title: string; body: string; href: string }> = []
  if (overdueInvoices.length > 0) alerts.push({ tone: "warm", title: `${overdueInvoices.length} facture${overdueInvoices.length > 1 ? "s" : ""} en retard`, body: `Total ${money(overdueInvoices.reduce((s, i) => s + i.amountCents, 0), business.currency)}`, href: "/invoices" })
  if (pendingPayouts.length > 0) alerts.push({ tone: "signature", title: `${pendingPayouts.length} payout${pendingPayouts.length > 1 ? "s" : ""} à approuver`, body: "Validation requise avant exécution", href: "/payouts" })
  if (openDisputes.length > 0) alerts.push({ tone: "danger", title: `${openDisputes.length} litige${openDisputes.length > 1 ? "s" : ""} à traiter`, body: "Résolution en attente", href: "/disputes" })
  if (openRiskFlags.length > 0) alerts.push({ tone: "danger", title: `${openRiskFlags.length} signal${openRiskFlags.length > 1 ? "aux" : ""} de risque`, body: "À examiner", href: "/risk" })
  if (alerts.length === 0) alerts.push({ tone: "positive", title: "Score de risque : sain", body: "0 alerte active · surveillance en continu", href: "/risk" })

  return (
    <div className="space-y-8">
      <HeroCard
        brand={business.brandName}
        legalName={business.legalName}
        balanceLabel={loading ? "…" : numeric(totalAvailableCents, display)}
        currency={loading ? "" : symbol}
        delta="Solde disponible en temps réel"
        deltaPositive
        meta={`${accounts.length} compte${accounts.length !== 1 ? "s" : ""} actif${accounts.length !== 1 ? "s" : ""} · ${currencies.size || 1} devise${currencies.size > 1 ? "s" : ""}${excludedAccounts > 0 ? ` · ${excludedAccounts} en dollars hors total` : ""}`}
        sparkline={[1, 1, 1, 1, 1, 1, 1, 1]}
      />

      <CardStage3D key={display} />

      <section aria-labelledby="quick-heading">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="legday-kicker mb-1">Actions rapides</p>
            <h2 id="quick-heading" className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--c-t1)]">
              Ce qui déclenche de la valeur maintenant
            </h2>
          </div>
          <Link href="/settings/business" className="hidden text-[12px] font-semibold text-[var(--c-t3)] hover:text-[var(--c-t1)] sm:inline">
            Personnaliser →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KaleidoTile kicker="Payments · lien" title="Encaisser en un lien" hint="Génère une URL de paiement à partager · unique ou récurrent." href="/payment-links" icon="link" palette="forest" featured />
          <KaleidoTile kicker="Sales · facture" title="Créer une facture" hint="Compose, envoie et suis le cycle Brouillon → Payée côté serveur." href="/invoices" icon="invoice" palette="blueDeep" featured />
          <KaleidoTile kicker="Finance · payout" title="Payer en masse" hint="Importe un lot ou paie ligne par ligne, avec workflow d'approbation." href="/payouts" icon="send" palette="brick" featured />
          <KaleidoTile kicker="Team · invitation" title="Inviter un membre" hint="Rôle Owner / Admin / Finance / Support / Viewer avec permissions fines." href="/team/users" icon="team" palette="teal" featured />
        </div>
      </section>

      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Indicateurs clés</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(loading ? Array.from({ length: 4 }) : kpiCards).map((k, idx) => (
            <article key={idx} className="relative overflow-hidden rounded-[20px] border border-white/5 bg-[var(--c-s1)] p-5 shadow-[var(--shadow-card)]">
              {k ? <>
                <p className="legday-kicker mb-2">{(k as typeof kpiCards[number]).kicker}</p>
                <div className="text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-[var(--c-t1)]">{(k as typeof kpiCards[number]).value}</div>
                <p className="mt-2 truncate text-[11px] text-[var(--c-t3)]">{(k as typeof kpiCards[number]).hint}</p>
              </> : <div className="h-[70px] animate-pulse rounded-[12px] bg-white/[.04]" />}
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="rounded-[32px] border border-white/5 bg-[var(--c-s1)] p-6 shadow-[var(--shadow-card)]">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="legday-kicker mb-1">Activité récente</p>
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-[var(--c-t1)]">Dernières opérations</h2>
              <p className="mt-1 text-[12px] text-[var(--c-t3)]">Transactions du compte Wallet Pro, les plus récentes en premier.</p>
            </div>
            <Link href="/transactions" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[var(--c-s2)] px-3 py-[6px] text-[11px] font-bold text-[var(--c-t2)] hover:text-[var(--c-t1)] legday-focus">
              Voir tout <Icon name="external" size={10} />
            </Link>
          </header>

          {transactions.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--c-t3)]">{loading ? "Chargement…" : "Aucune transaction pour le moment."}</p>
          ) : (
            <ol className="relative">
              {transactions.map((t, i) => {
                const isLast = i === transactions.length - 1
                const dot = t.direction === "credit" ? DOT_STYLE.credit : DOT_STYLE.debit
                return (
                  <li key={t.id} className="relative flex items-start gap-4 pb-4">
                    <div className="relative flex flex-col items-center">
                      <span className="mt-[6px] flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-4" style={{ background: dot.bg, boxShadow: `0 0 0 4px ${dot.ring}` }} aria-hidden="true" />
                      {!isLast && <span className="mt-1 flex-1 border-l-2 border-dotted" style={{ borderColor: "rgba(168,175,208,.20)", minHeight: 24 }} aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="legday-mono text-[11px] text-[var(--c-t3)]">{relativeTime(t.createdAt)}</span>
                            <span className="text-[13px] font-bold text-[var(--c-t1)]">{t.reference}</span>
                          </div>
                          <p className="mt-[2px] truncate text-[13px] text-[var(--c-t2)]">{(t.description ?? t.type.replaceAll("_", " "))} · {t.status}</p>
                        </div>
                        <div className={"legday-mono shrink-0 text-[14px] font-bold " + (t.direction === "credit" ? "text-[var(--c-positive)]" : "text-[var(--c-warm)]")}>
                          {t.direction === "credit" ? "+" : "−"}{money(t.amountCents, t.currency)}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </article>

        <article className="rounded-[32px] border border-white/5 bg-[var(--c-s1)] p-6 shadow-[var(--shadow-card)]">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="legday-kicker mb-1">Opérations</p>
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-[var(--c-t1)]">Alertes actives</h2>
            </div>
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--c-warm)]/20 px-2 text-[11px] font-bold text-[var(--c-warm)]" aria-label={`${alerts.length} alertes`}>{alerts.length}</span>
          </header>
          <ul className="space-y-3">
            {alerts.map((alert) => {
              const tone = ALERT_STYLE[alert.tone]
              return (
                <li key={alert.title}>
                  <Link href={alert.href} className="group flex items-start gap-3 rounded-[20px] border border-white/5 bg-[var(--c-s2)] p-4 legday-focus hover:bg-[var(--c-s3)]" style={{ borderLeft: `3px solid ${tone.border}` }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tone.socleBg, color: tone.socleFg, boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), 0 3px 8px -2px rgba(0,0,0,.28)" }} aria-hidden="true">
                      <Icon name={tone.icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-[var(--c-t1)]">{alert.title}</div>
                      <div className="mt-[2px] text-[12px] leading-[1.5] text-[var(--c-t2)]">{alert.body}</div>
                    </div>
                    <Icon name="external" size={12} className="mt-[6px] text-[var(--c-t3)] transition-colors group-hover:text-[var(--c-t1)]" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </article>
      </section>
    </div>
  )
}

/* ────── Styles utilitaires internes ────── */

const DOT_STYLE: Record<"credit" | "debit", { bg: string; ring: string }> = {
  credit: { bg: "#5FB03E", ring: "rgba(95,176,62,.16)" },
  debit: { bg: "#E85820", ring: "rgba(232,88,32,.16)" },
}

const ALERT_STYLE: Record<"warm" | "signature" | "danger" | "positive", { border: string; socleBg: string; socleFg: string; icon: "invoice" | "approve" | "flag" | "shield" }> = {
  warm: { border: "#E85820", socleBg: "#E5903F", socleFg: "#0a0d1e", icon: "invoice" },
  signature: { border: "#8ea9ff", socleBg: "#8ea9ff", socleFg: "#0a0d1e", icon: "approve" },
  danger: { border: "#ef5a67", socleBg: "#ef5a67", socleFg: "#f5f7fc", icon: "flag" },
  positive: { border: "#5FB03E", socleBg: "#97CE5E", socleFg: "#0a0d1e", icon: "shield" },
}
