"use client"

import * as React from "react"
import Link from "next/link"
import { ChartBar, ArrowsClockwise } from "@phosphor-icons/react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { api } from "@/lib/trpc"
import { siteConfig } from "../../siteConfig"

type Outputs = inferRouterOutputs<AppRouter>
type FunnelRow = Outputs["analytics"]["leadsFunnel"][number]

const labels: Record<FunnelRow["status"], string> = {
  new: "Nouveaux",
  contacted: "Contactés",
  qualified: "Qualifiés",
  converted: "Convertis",
  lost: "Perdus",
}

export default function AnalyticsPage() {
  const [funnel, setFunnel] = React.useState<Outputs["analytics"]["leadsFunnel"]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setFunnel(await api.analytics.leadsFunnel.query())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de charger les analytics.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const total = funnel.reduce((sum, row) => sum + row.count, 0)
  const converted = funnel.find((row) => row.status === "converted")?.count ?? 0
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <p className="dashboard-kicker">Mesure transverse</p>
          <h1>Analytics Core</h1>
          <p>Suivez le funnel de leads sans importer de métriques financières ou de contrats Wallet.</p>
        </div>
        <button className="dashboard-icon-button" onClick={() => void load()} aria-label="Rafraîchir"><ArrowsClockwise /></button>
      </header>

      {error ? <div className="dashboard-panel"><p className="dashboard-empty">{error}</p></div> : null}
      {loading ? <div className="dashboard-loading">Chargement des analytics…</div> : (
        <>
          <section className="dashboard-kpi-grid" aria-label="Indicateurs de leads">
            <Metric label="Leads suivis" value={String(total)} />
            <Metric label="Leads convertis" value={String(converted)} />
            <Metric label="Taux de conversion" value={`${conversionRate} %`} />
            <Metric label="Contrat exposé" value="Core" />
          </section>

          <section className="dashboard-content-grid">
            <div className="dashboard-panel">
              <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Pipeline</span><h2>Funnel des leads</h2></div><ChartBar /></div>
              <div className="dashboard-activity-list">
                {funnel.length === 0 ? <p className="dashboard-empty">Aucun lead enregistré.</p> : funnel.map((row) => <div className="dashboard-activity-row" key={row.status}><span className="dashboard-activity-dot violet" /><span><strong>{labels[row.status]}</strong><small>{row.count} lead{row.count > 1 ? "s" : ""}</small></span><b>{total > 0 ? `${Math.round((row.count / total) * 100)} %` : "0 %"}</b></div>)}
              </div>
            </div>
            <div className="dashboard-panel">
              <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Architecture</span><h2>Frontière produit</h2></div></div>
              <p className="dashboard-empty">Les données financières, cartes, soldes et transactions appartiennent au futur Wallet. Le Dashboard conserve ici uniquement les indicateurs provenant du Core.</p>
              <Link href={siteConfig.baseLinks.leads} className="dashboard-action-card"><span className="dashboard-action-icon green"><ChartBar /></span><strong>Ouvrir les leads</strong><b>→</b></Link>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="dashboard-metric-card"><span><small>{label}</small><strong>{value}</strong></span></div>
}
