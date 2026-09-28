"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegDrawer, LegPill, LegReasonDialog, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDate, formatDateTime } from "@/lib/adminFormat"
import { LINK_STATUS_LABEL, LINK_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, cardLabel, isOpenPayment, money, publicPayUrl } from "@/lib/paymentLinkFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type PaymentLinkDetail = Outputs["admin"]["paymentLinks"]["get"]
type PaymentRow = PaymentLinkDetail["payments"][number]

/**
 * Fiche d'un lien de paiement : adresse publique, chiffres, rattachement (société, compte crédité) et paiements reçus.
 * Suspendre / réactiver un lien, revérifier ou rembourser un paiement se font ici — chaque action exige un motif et entre au journal.
 * Les boutons reflètent les droits ; le serveur décide (`paymentlinks.manage`).
 */
export function PaymentLinkDrawer({ linkId, me, onClose, onChanged }: { linkId: number | null; me: { id: number; role: PlatformRole }; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [detail, setDetail] = React.useState<PaymentLinkDetail | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<null | "status" | "refund" | "reconcile">(null)
  const [statusDialog, setStatusDialog] = React.useState<null | "disabled" | "active">(null)
  const [refunding, setRefunding] = React.useState<PaymentRow | null>(null)
  const [reconciling, setReconciling] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const canManage = isAdmin(me.role)

  const load = React.useCallback(async (id: number) => {
    setLoadError(null)
    try {
      setDetail(await api.admin.paymentLinks.get.query({ id }))
    } catch (error) {
      setDetail(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger le lien.")
    }
  }, [])

  React.useEffect(() => {
    setCopied(false)
    if (linkId === null) return // le dernier lien reste affiché le temps que le tiroir se referme
    setDetail(null); setLoadError(null)
    void load(linkId)
  }, [linkId, load])

  async function afterChange(message: string) {
    show(message)
    if (linkId !== null) await load(linkId)
    await onChanged()
  }

  async function copyUrl() {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(publicPayUrl(detail.slug))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      show("Adresse copiée.")
    } catch {
      show("Copie impossible : autorisez l'accès au presse-papiers dans le navigateur.", "error")
    }
  }

  async function reconcile(payment: PaymentRow) {
    setReconciling(payment.reference)
    try {
      const result = await api.admin.paymentLinks.reconcile.mutate({ reference: payment.reference })
      await afterChange(result.status === "succeeded" ? "Paiement vérifié : encaissé et crédité." : `Paiement vérifié : ${PAYMENT_STATUS_LABEL[result.status].toLowerCase()}.`)
    } catch (error) {
      show(error instanceof Error ? error.message : "Vérification impossible.", "error")
    } finally {
      setReconciling(null)
    }
  }

  const title = detail ? detail.name : loadError ? "Lien indisponible" : "Chargement…"
  const url = detail ? publicPayUrl(detail.slug) : ""

  return (
    <>
      <LegDrawer
        open={linkId !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche lien de paiement"
        title={title}
        subtitle={detail ? `${detail.business.brandName} · ${detail.mode === "unique" ? "Usage unique" : "Réutilisable"}` : undefined}
        footer={detail && canManage ? (
          detail.status === "active"
            ? <LegButton variant="secondary" icon="lock" onClick={() => setStatusDialog("disabled")}>Suspendre le lien</LegButton>
            : detail.status === "disabled"
              ? <LegButton icon="check" onClick={() => setStatusDialog("active")}>Réactiver le lien</LegButton>
              : undefined
        ) : undefined}
      >
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!detail && !loadError ? <p className="lg-sub" role="status">Chargement du lien…</p> : null}

        {detail ? (
          <>
            <section className="pl-hero" aria-label="Lien de paiement">
              <div className="pl-hero-top">
                <span className="lg-kicker">Montant demandé</span>
                <LegPill tone={LINK_STATUS_TONE[detail.status]}>{LINK_STATUS_LABEL[detail.status]}</LegPill>
              </div>
              <p className="pl-amount">{money(detail.amountCents, detail.currency)}</p>
              {detail.description ? <p className="pl-desc">{detail.description}</p> : null}
              <div className="pl-url" aria-label="Adresse publique">
                <code>{url}</code>
              </div>
              <div className="pl-hero-actions">
                <LegButton variant="secondary" icon={copied ? "check" : "copy"} onClick={() => void copyUrl()}>{copied ? "Copié" : "Copier l'adresse"}</LegButton>
                {detail.status === "active" ? <a className="lg-btn lg-btn--secondary" href={url} target="_blank" rel="noopener noreferrer"><LegIcon name="external" /><span>Ouvrir la page</span></a> : null}
              </div>
            </section>

            <div className="pl-stats" role="group" aria-label="Chiffres du lien">
              <span><small>Visites</small><b>{detail.visits.toLocaleString("fr-FR")}</b></span>
              <span><small>Paiements</small><b>{detail.paid.toLocaleString("fr-FR")}</b></span>
              <span><small>Encaissé</small><b>{money(detail.revenueCents, detail.currency)}</b></span>
            </div>

            {!canManage ? <p className="lg-notice"><LegIcon name="lock" />Lecture seule : suspendre un lien ou rembourser un paiement est réservé aux administrateurs.</p> : null}

            <LegSection title="Rattachement">
              <div className="lg-account-head">
                <LegSocle icon="building" tone="teal" size="md" />
                <span><strong>{detail.business.brandName}</strong><small>{detail.business.legalName} · Wallet Pro</small></span>
              </div>
              <LegRow label="Compte crédité" value={detail.target ? `${detail.target.label} · ${detail.target.currency}` : "Premier compte de l'entreprise"} />
              <LegRow label="Créé par" value={detail.createdBy} />
              <LegRow label="Créé le" value={formatDate(detail.createdAt)} />
              <LegRow label="Expire le" value={detail.expiresAt ? formatDate(detail.expiresAt) : "Jamais"} />
              <LegRow label="Dernière modification" value={formatDateTime(detail.updatedAt)} />
            </LegSection>

            <section>
              <p className="lg-kicker lg-section-title">Paiements reçus</p>
              {detail.payments.length === 0 ? <p className="lg-hint">Aucun paiement pour l'instant. Les visites sont comptées dès que quelqu'un ouvre le lien.</p> : (
                <div className="pl-pays" role="list" aria-label="Paiements du lien">
                  {detail.payments.map((payment) => (
                    <div key={payment.reference} className="pl-pay" role="listitem">
                      <LegSocle icon={payment.status === "succeeded" ? "check" : payment.status === "failed" ? "alert" : payment.status === "refunded" ? "undo" : "clock"} tone={payment.status === "succeeded" ? "green" : payment.status === "failed" ? "red" : payment.status === "refunded" ? "platinum" : "amber"} size="sm" />
                      <span className="pl-pay-main">
                        <strong>{payment.payerName ?? "Client"}</strong>
                        <small>{payment.payerEmail ?? "—"} · {cardLabel(payment.cardBrand, payment.cardLast4)}</small>
                        <small className="lg-mono">{payment.reference} · {formatDateTime(payment.createdAt)}{payment.mode !== "live" ? ` · ${payment.mode === "sim" ? "simulation" : "test"}` : ""}</small>
                        {payment.failureMessage ? <small className="pl-pay-fail">{payment.failureMessage}</small> : null}
                      </span>
                      <span className="pl-pay-side">
                        <b>{money(payment.amountCents, payment.currency)}</b>
                        <LegPill tone={PAYMENT_STATUS_TONE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</LegPill>
                        {canManage && isOpenPayment(payment.status) ? <LegButton variant="secondary" icon="refresh" loading={reconciling === payment.reference} onClick={() => void reconcile(payment)}>Revérifier</LegButton> : null}
                        {canManage && payment.status === "succeeded" ? <LegButton variant="ghost" icon="undo" onClick={() => setRefunding(payment)}>Rembourser</LegButton> : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </LegDrawer>

      <LegReasonDialog
        open={statusDialog !== null}
        onOpenChange={(open) => { if (!open) setStatusDialog(null) }}
        title={statusDialog === "disabled" ? "Suspendre ce lien ?" : "Réactiver ce lien ?"}
        description={statusDialog === "disabled" ? "La page de paiement devient indisponible immédiatement : plus aucun paiement ne peut démarrer. Les paiements déjà encaissés ne sont pas touchés." : "La page de paiement redevient accessible et le lien accepte de nouveau des paiements."}
        confirmLabel={statusDialog === "disabled" ? "Suspendre" : "Réactiver"}
        destructive={statusDialog === "disabled"}
        busy={busy === "status"}
        onConfirm={async (reason) => {
          if (!detail || !statusDialog) return
          setBusy("status")
          try {
            setDetail(await api.admin.paymentLinks.setStatus.mutate({ id: detail.id, status: statusDialog, reason }))
            setStatusDialog(null)
            show(statusDialog === "disabled" ? "Lien suspendu." : "Lien réactivé.")
            await onChanged()
          } catch (error) {
            show(error instanceof Error ? error.message : "Action impossible.", "error")
          } finally {
            setBusy(null)
          }
        }}
      />
      <LegReasonDialog
        open={refunding !== null}
        onOpenChange={(open) => { if (!open) setRefunding(null) }}
        title="Rembourser ce paiement ?"
        description={refunding ? `${money(refunding.amountCents, refunding.currency)} sont retirés du compte de ${detail?.business.brandName ?? "l'entreprise"} et remboursés sur la carte du payeur. L'opération est irréversible et journalisée.` : undefined}
        confirmLabel="Rembourser"
        destructive
        icon="undo"
        busy={busy === "refund"}
        onConfirm={async (reason) => {
          if (!refunding) return
          setBusy("refund")
          try {
            await api.admin.paymentLinks.refund.mutate({ reference: refunding.reference, reason })
            setRefunding(null)
            await afterChange("Paiement remboursé.")
          } catch (error) {
            show(error instanceof Error ? error.message : "Remboursement impossible.", "error")
          } finally {
            setBusy(null)
          }
        }}
      />
    </>
  )
}
