"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegConfirm, LegDrawer, LegPill, LegReasonDialog, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"
import { CATEGORY_LABEL, REVIEW_LABEL, documentState, downloadUrl, formatSize, historyEntry } from "@/lib/documentFormat"
import { MANAGER_ROLE_LABEL, WALLET_TYPE_LABEL } from "@/lib/managerFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type DocumentDetail = Outputs["admin"]["documents"]["get"]

type Pending = null | { kind: "review"; decision: "validated" | "rejected" } | { kind: "status"; status: "active" | "archived" | "revoked" }

const STATUS_COPY = {
  archived: { title: "Archiver ce document ?", text: "Il disparaît des « Documents » du titulaire mais reste consultable ici, et peut être rétabli.", confirm: "Archiver", destructive: false, icon: "archive" },
  revoked: { title: "Retirer ce document ?", text: "Le titulaire est notifié et ne peut plus l'ouvrir. Le fichier et son historique sont conservés.", confirm: "Retirer", destructive: true, icon: "trash" },
  active: { title: "Rétablir ce document ?", text: "Il redevient disponible dans les « Documents » du titulaire.", confirm: "Rétablir", destructive: false, icon: "undo" },
} as const

/**
 * Fiche d'un document remis : fichier, destinataire, expéditeur, consultation, examen et historique complet.
 * Valider / refuser une pièce, archiver, retirer ou rétablir se justifient et entrent au journal ; les boutons reflètent les droits, le serveur décide.
 * Un gestionnaire de compte n'y voit que les documents de son portefeuille, sans historique d'audit.
 */
export function DocumentDrawer({ documentId, me, onClose, onChanged }: { documentId: number | null; me: { id: number; role: PlatformRole }; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [detail, setDetail] = React.useState<DocumentDetail | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<Pending>(null)
  const [busy, setBusy] = React.useState(false)
  const canManage = isAdmin(me.role)
  const validating = pending?.kind === "review" && pending.decision === "validated"

  const load = React.useCallback(async (id: number) => {
    setLoadError(null)
    try {
      setDetail(await api.admin.documents.get.query({ id }))
    } catch (error) {
      setDetail(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger le document.")
    }
  }, [])

  React.useEffect(() => {
    if (documentId === null) return // le dernier document reste affiché le temps que le tiroir se referme
    setDetail(null); setLoadError(null)
    void load(documentId)
  }, [documentId, load])

  const state = detail ? documentState(detail) : null
  const senderRole = detail?.sender ? (MANAGER_ROLE_LABEL[detail.sender.role as keyof typeof MANAGER_ROLE_LABEL] ?? (detail.sender.role === "user" ? "Titulaire" : "Administration")) : null

  async function confirm(reason: string) {
    if (!detail || !pending) return
    setBusy(true)
    try {
      if (pending.kind === "review") {
        setDetail(await api.admin.documents.review.mutate({ id: detail.id, decision: pending.decision, reason }))
        show(pending.decision === "validated" ? "Pièce validée : le titulaire est prévenu." : "Pièce refusée : le titulaire est prévenu.")
      } else {
        setDetail(await api.admin.documents.setStatus.mutate({ id: detail.id, status: pending.status, reason }))
        show(pending.status === "archived" ? "Document archivé." : pending.status === "revoked" ? "Document retiré." : "Document rétabli.")
      }
      setPending(null)
      await load(detail.id)
      await onChanged()
    } catch (error) {
      show(error instanceof Error ? error.message : "Action impossible.", "error")
    } finally {
      setBusy(false)
    }
  }

  const footer = detail && canManage ? (
    <>
      {detail.status === "active" ? <LegButton variant="secondary" icon="archive" onClick={() => setPending({ kind: "status", status: "archived" })}>Archiver</LegButton> : null}
      {detail.status !== "active" ? <LegButton icon="undo" onClick={() => setPending({ kind: "status", status: "active" })}>Rétablir</LegButton> : null}
      {detail.status !== "revoked" ? <LegButton variant="danger" icon="trash" onClick={() => setPending({ kind: "status", status: "revoked" })}>Retirer</LegButton> : null}
    </>
  ) : undefined

  return (
    <>
      <LegDrawer
        open={documentId !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche document"
        title={detail ? detail.title : loadError ? "Document indisponible" : "Chargement…"}
        subtitle={detail ? `${CATEGORY_LABEL[detail.category]} · ${detail.holder?.name ?? detail.recipient.name}` : undefined}
        footer={footer}
      >
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!detail && !loadError ? <p className="lg-sub" role="status">Chargement du document…</p> : null}

        {detail && state ? (
          <>
            <section className="dc-hero" aria-label="Fichier">
              <div className="pl-hero-top">
                <span className="lg-kicker">{detail.mimeType === "application/pdf" ? "Document PDF" : "Image"}</span>
                <LegPill tone={state.pill} icon={state.icon}>{state.label}</LegPill>
              </div>
              <div className="dc-hero-file">
                <LegSocle icon="file" tone="navy" size="lg" />
                <span><strong>{detail.fileName}</strong><small>{formatSize(detail.sizeBytes)} · {CATEGORY_LABEL[detail.category]}</small></span>
              </div>
              {detail.note ? <p className="pl-desc">« {detail.note} »</p> : null}
              <div className="pl-hero-actions">
                <a className="lg-btn lg-btn--primary" href={downloadUrl(detail.id)} target="_blank" rel="noopener noreferrer"><LegIcon name="download" /><span>Télécharger</span></a>
              </div>
            </section>

            {detail.reviewStatus === "pending" ? (
              canManage ? (
                <section className="dc-review" aria-label="Examen de la pièce">
                  <p><strong>Pièce remise par le titulaire.</strong> Vérifiez le fichier, puis validez-la ou refusez-la avec un motif : le titulaire est prévenu.</p>
                  <div className="pl-hero-actions">
                    <LegButton icon="check" onClick={() => setPending({ kind: "review", decision: "validated" })}>Valider</LegButton>
                    <LegButton variant="danger" icon="close" onClick={() => setPending({ kind: "review", decision: "rejected" })}>Refuser</LegButton>
                  </div>
                </section>
              ) : <p className="lg-notice"><LegIcon name="clock" />Pièce en attente d'examen : la validation est réservée aux administrateurs.</p>
            ) : null}

            {detail.reviewStatus === "validated" || detail.reviewStatus === "rejected" ? (
              <LegSection title="Examen">
                <LegRow label="Décision" value={REVIEW_LABEL[detail.reviewStatus]} />
                <LegRow label="Examiné par" value={detail.reviewedBy ?? "—"} />
                <LegRow label="Le" value={detail.reviewedAt ? formatDateTime(detail.reviewedAt) : "—"} />
                {detail.reviewReason ? <LegRow label="Motif" value={detail.reviewReason} /> : null}
              </LegSection>
            ) : null}

            <LegSection title="Remise">
              <div className="lg-account-head">
                <LegSocle icon={detail.walletType === "PROFESSIONAL" ? "building" : "user"} tone={detail.walletType === "PROFESSIONAL" ? "teal" : "violet"} size="md" />
                <span><strong>{detail.holder?.name ?? detail.recipient.name}</strong><small>{detail.walletType ? `Wallet ${WALLET_TYPE_LABEL[detail.walletType]}` : "Wallet"}{detail.holder?.subtitle ? ` · ${detail.holder.subtitle}` : ""}</small></span>
              </div>
              <LegRow label="Destinataire" value={detail.recipient.name} />
              <LegRow label="Envoyé par" value={detail.sender ? `${detail.sender.name}${senderRole ? ` · ${senderRole}` : ""}` : "—"} />
              <LegRow label="Envoyé le" value={formatDateTime(detail.createdAt)} />
              <LegRow label="Première ouverture" value={detail.firstViewedAt ? formatDateTime(detail.firstViewedAt) : "Pas encore ouvert"} />
              {detail.archivedAt ? <LegRow label="Archivé le" value={formatDateTime(detail.archivedAt)} /> : null}
              {detail.batchSize > 1 ? <LegRow label="Envoi groupé" value={`Remis à ${detail.batchSize} destinataires dans le même envoi`} /> : null}
              {detail.transactionReference ? <LegRow label="Référence virement" value={<span className="lg-mono">{detail.transactionReference}</span>} /> : null}
              {detail.sha256 ? <LegRow label="Empreinte SHA-256" value={<span className="lg-mono dc-hash" title={detail.sha256}>{detail.sha256.slice(0, 12)}…{detail.sha256.slice(-6)}</span>} /> : null}
            </LegSection>

            {detail.history ? (
              <section>
                <p className="lg-kicker lg-section-title">Historique</p>
                {detail.history.length === 0 ? <p className="lg-hint">Aucun événement enregistré.</p> : (
                  <ol className="dc-history" aria-label="Historique du document">
                    {detail.history.map((entry) => {
                      const meta = historyEntry(entry.action)
                      const reason = typeof entry.detail?.reason === "string" ? entry.detail.reason : null
                      return (
                        <li key={entry.id} className="dc-event">
                          <LegSocle icon={meta.icon} tone={meta.socle} size="sm" />
                          <span className="dc-event-main">
                            <strong>{meta.label}</strong>
                            <small>{entry.actorName ?? "Système"}{entry.actorRole ? ` · ${MANAGER_ROLE_LABEL[entry.actorRole as keyof typeof MANAGER_ROLE_LABEL] ?? (entry.actorRole === "user" ? "Titulaire" : "Administration")}` : ""} · {formatDateTime(entry.createdAt)}</small>
                            {reason ? <small className="dc-event-reason">« {reason} »</small> : null}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </LegDrawer>

      <LegConfirm
        open={validating}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        title="Valider cette pièce ?"
        description="Le titulaire est prévenu que sa pièce est validée. La décision est définitive et journalisée."
        confirmLabel="Valider"
        busy={busy}
        onConfirm={() => void confirm("")}
      />
      <LegReasonDialog
        open={pending !== null && !validating}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        title={pending?.kind === "review" ? "Refuser cette pièce ?" : pending ? STATUS_COPY[pending.status].title : ""}
        description={pending?.kind === "review" ? "Le titulaire est prévenu du refus et lit votre motif : expliquez-lui ce qu'il doit corriger." : pending ? STATUS_COPY[pending.status].text : undefined}
        confirmLabel={pending?.kind === "review" ? "Refuser" : pending ? STATUS_COPY[pending.status].confirm : "Confirmer"}
        destructive={pending?.kind === "review" ? true : pending ? STATUS_COPY[pending.status].destructive : false}
        icon={pending?.kind === "review" ? "close" : pending ? STATUS_COPY[pending.status].icon : undefined}
        busy={busy}
        onConfirm={(reason) => void confirm(reason)}
      />
    </>
  )
}
