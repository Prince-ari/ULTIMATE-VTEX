"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PageHeader } from "@/components/shell/PageHeader"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { KpiTile } from "@/components/ui/KpiTile"
import { useBusinessContext } from "@/lib/business-context"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type Doc = Outputs["documents"]["listMine"][number]

const CATEGORY_LABEL: Record<string, string> = {
  statement: "Relevé", receipt: "Reçu", contract: "Contrat", identity: "Pièce d'identité", tax: "Fiscal", notice: "Avis",
  account_document: "Document de compte", rib: "RIB", transfer_proof: "Justificatif de virement", other: "Autre",
}
const REVIEW_LABEL: Record<string, string> = { pending: "En cours d'examen", validated: "Validé", rejected: "Refusé" }
const REVIEW_TONE: Record<string, BadgeTone> = { pending: "gold", validated: "positive", rejected: "danger" }
/** Un socle plein par famille de teinte (le maelström chromatique cycle d'une ligne cliquable à l'autre, RULE 008). */
const SOCLES = ["#97CE5E", "#5FA8D8", "#E5903F", "#BFE3A8"]

const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const day = (value: Date | string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
}

/** Un document envoyé par VTEX et jamais ouvert est « nouveau » : l'ouverture est horodatée côté serveur. */
const isFresh = (doc: Doc) => doc.source === "admin" && !doc.firstViewedAt

export default function DocumentsPage() {
  const { business, businessId } = useBusinessContext()
  const [docs, setDocs] = React.useState<Doc[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [category, setCategory] = React.useState<string>("all")

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const rows = await api.documents.listMine.query()
      // Les documents du wallet personnel de la même personne n'apparaissent pas ici : seulement ceux adressés à cette entreprise.
      setDocs(rows.filter((row) => row.walletType === "PROFESSIONAL" && row.holderId === businessId))
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les documents."))
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  const categories = [...new Set(docs.map((doc) => doc.documentType))]
  const shown = docs.filter((doc) => category === "all" || doc.documentType === category)
  const fresh = docs.filter(isFresh).length
  const latest = docs[0]?.createdAt

  return (
    <>
      <PageHeader
        kicker="Finance"
        title="Documents"
        description={`Relevés, contrats et avis que VTEX met à la disposition de ${business.brandName}. Les fichiers sont privés : ils ne s'ouvrent qu'avec votre session, et chaque ouverture est journalisée.`}
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiTile kicker="Documents" value={String(docs.length)} hint={docs.length > 0 ? `${categories.length} catégorie${categories.length > 1 ? "s" : ""}` : "aucun pour l'instant"} tone="signature" />
        <KpiTile kicker="Nouveaux" value={String(fresh)} hint={fresh > 0 ? "pas encore ouverts" : "tout est lu"} tone={fresh > 0 ? "positive" : "neutral"} />
        <KpiTile kicker="Dernier reçu" value={latest ? day(latest) : "—"} hint={docs[0]?.title ?? "en attente d'un envoi"} />
      </section>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}

      {categories.length > 1 ? (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Catégorie">
          {["all", ...categories].map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
              className={`legday-focus rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${category === key ? "bg-[var(--c-signature)] text-[var(--c-bg)]" : "bg-[var(--c-s2)] text-[var(--c-t2)] hover:text-[var(--c-t1)]"}`}
            >
              {key === "all" ? "Tous" : CATEGORY_LABEL[key] ?? key}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
      {!loading && !error && shown.length === 0 ? (
        <div className="legday-empty">{docs.length === 0 ? "Aucun document pour l'instant. Les relevés, contrats et avis que VTEX vous envoie apparaîtront ici." : "Aucun document dans cette catégorie."}</div>
      ) : null}

      <ul className="space-y-3" aria-label="Documents">
        {shown.map((doc, index) => (
          <li key={doc.id} className="rounded-[20px] bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--c-bg)] shadow-[var(--shadow-socle)]" style={{ background: SOCLES[index % SOCLES.length] }} aria-hidden="true"><Icon name="file" size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-[15px] font-bold text-[var(--c-t1)]">{doc.title}</b>
                  {isFresh(doc) ? <Badge tone="signature">Nouveau</Badge> : null}
                  {REVIEW_LABEL[doc.reviewStatus] ? <Badge tone={REVIEW_TONE[doc.reviewStatus] ?? "neutral"}>{REVIEW_LABEL[doc.reviewStatus]}</Badge> : null}
                </span>
                <span className="block text-[12px] text-[var(--c-t3)]">
                  {CATEGORY_LABEL[doc.documentType] ?? "Document"} · <span className="legday-mono">{doc.fileName}</span>{doc.sizeBytes !== null ? ` · ${sizeLabel(doc.sizeBytes)}` : ""} · {day(doc.createdAt)}
                </span>
              </span>
              <a
                className="legday-focus inline-flex h-9 items-center gap-2 rounded-full bg-[var(--c-s2)] px-4 text-[12px] font-bold text-[var(--c-t1)] hover:text-[var(--c-signature)]"
                href={`/api/media/documents/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Télécharger ${doc.title}`}
                onClick={() => { window.setTimeout(() => void load(), 1800) }}
              >
                <Icon name="download" size={14} /> Télécharger
              </a>
            </div>
            {doc.note ? <p className="mt-3 rounded-[14px] bg-[var(--c-s2)] px-4 py-3 text-[13px] italic leading-[1.5] text-[var(--c-t2)]">« {doc.note} »</p> : null}
            {doc.reviewStatus === "rejected" && doc.reviewReason ? <p className="mt-3 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">Motif du refus : {doc.reviewReason}</p> : null}
          </li>
        ))}
      </ul>
    </>
  )
}
