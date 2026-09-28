"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { HolderMultiPicker, type HolderChoice } from "@/components/admin/holders/HolderMultiPicker"
import { SuggestionDialog } from "@/components/admin/suggestions/SuggestionDialog"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegDrawer, LegPill, LegReasonDialog, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDate, formatDateTime } from "@/lib/adminFormat"
import { MANAGER_ROLE_HINT, MANAGER_ROLE_LABEL, MANAGER_STATUS_LABEL, MANAGER_STATUS_TONE, WALLET_TYPE_LABEL, activityLabel, initials, walletCountLabel } from "@/lib/managerFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type ManagerDetail = Outputs["admin"]["managers"]["get"]
type WalletRow = ManagerDetail["wallets"][number]

/**
 * Fiche d'un gestionnaire : identité, statut, portefeuille (wallets attribués), attribution / retrait, suggestion à ses wallets.
 * Les boutons reflètent les droits ; le serveur décide (`managers.manage`). Chaque attribution et chaque retrait est journalisé sur le wallet.
 */
export function ManagerDrawer({ managerId, me, onClose, onChanged }: { managerId: number | null; me: { id: number; role: PlatformRole }; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [detail, setDetail] = React.useState<ManagerDetail | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [picked, setPicked] = React.useState<HolderChoice[]>([])
  const [busy, setBusy] = React.useState<null | "assign" | "unassign" | "status">(null)
  const [removing, setRemoving] = React.useState<WalletRow | null>(null)
  const [statusDialog, setStatusDialog] = React.useState<null | "suspended" | "active">(null)
  const [suggestOpen, setSuggestOpen] = React.useState(false)
  const canManage = isAdmin(me.role)

  const load = React.useCallback(async (id: number) => {
    setLoadError(null)
    try {
      setDetail(await api.admin.managers.get.query({ id }))
    } catch (error) {
      setDetail(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger le gestionnaire.")
    }
  }, [])

  React.useEffect(() => {
    setAdding(false); setPicked([])
    if (managerId === null) return // le dernier gestionnaire reste affiché le temps que le tiroir se referme
    setDetail(null); setLoadError(null)
    void load(managerId)
  }, [managerId, load])

  const search = React.useCallback(async (query: string) => {
    const holders = await api.admin.managers.holders.query({ query })
    return holders.map(({ walletType, holderId, name, subtitle }) => ({ walletType, holderId, name, subtitle }))
  }, [])

  async function assignPicked() {
    if (!detail || picked.length === 0) return
    setBusy("assign")
    let done = 0
    try {
      for (const wallet of picked) {
        const result = await api.admin.managers.assign.mutate({ managerId: detail.id, walletType: wallet.walletType, holderId: wallet.holderId })
        if (result.created) done += 1
      }
      show(done === 0 ? "Ces wallets étaient déjà attribués." : `${done} wallet${done > 1 ? "s" : ""} attribué${done > 1 ? "s" : ""} et journalisé${done > 1 ? "s" : ""}.`)
      setAdding(false); setPicked([])
    } catch (error) {
      show(error instanceof Error ? error.message : "Attribution impossible.", "error")
    } finally {
      setBusy(null)
      await load(detail.id)
      await onChanged()
    }
  }

  const title = detail ? detail.name : loadError ? "Gestionnaire indisponible" : "Chargement…"
  const assigned = new Set((detail?.wallets ?? []).map((wallet) => `${wallet.walletType}:${wallet.holderId}`))
  const suggestTargets: HolderChoice[] = (detail?.wallets ?? []).map(({ walletType, holderId, name, subtitle }) => ({ walletType, holderId, name, subtitle }))

  return (
    <>
      <LegDrawer
        open={managerId !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche gestionnaire"
        title={title}
        subtitle={detail ? `${MANAGER_ROLE_LABEL[detail.role]} · ${detail.email}` : undefined}
        footer={detail && canManage && detail.id !== me.id ? (
          detail.status === "active"
            ? <LegButton variant="danger" icon="lock" onClick={() => setStatusDialog("suspended")}>Suspendre le compte</LegButton>
            : <LegButton icon="check" onClick={() => setStatusDialog("active")}>Réactiver le compte</LegButton>
        ) : undefined}
      >
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!detail && !loadError ? <p className="lg-sub" role="status">Chargement du gestionnaire…</p> : null}

        {detail ? (
          <>
            <section className="pl-hero" aria-label="Gestionnaire">
              <div className="pl-hero-top">
                <span className="mg-avatar" aria-hidden="true">{initials(detail.name)}</span>
                <span className="mg-hero-pills">
                  <LegPill tone={MANAGER_STATUS_TONE[detail.status as "active" | "suspended"] ?? "neutral"}>{MANAGER_STATUS_LABEL[detail.status as "active" | "suspended"] ?? detail.status}</LegPill>
                  <LegPill tone="navy">{MANAGER_ROLE_LABEL[detail.role]}</LegPill>
                </span>
              </div>
              <p className="mg-name">{detail.name}</p>
              <p className="pl-desc">{MANAGER_ROLE_HINT[detail.role]}</p>
            </section>

            <div className="pl-stats" role="group" aria-label="Activité du gestionnaire">
              <span><small>Portefeuille</small><b>{walletCountLabel(detail.wallets.length)}</b></span>
              <span><small>Dernière connexion</small><b>{activityLabel(detail.lastActiveAt)}</b></span>
              <span><small>Compte créé</small><b>{formatDate(detail.createdAt)}</b></span>
            </div>

            {detail.mustChangePassword ? <p className="lg-notice"><LegIcon name="key" />Mot de passe temporaire pas encore remplacé : la personne ne s'est pas encore connectée normalement.</p> : null}
            {!canManage ? <p className="lg-notice"><LegIcon name="lock" />Lecture seule : attribuer ou retirer un wallet, suspendre un compte sont réservés aux administrateurs.</p> : null}

            <section>
              <div className="mg-section-head">
                <p className="lg-kicker lg-section-title">Portefeuille</p>
                <span className="mg-section-actions">
                  {detail.wallets.length > 0 ? <LegButton variant="secondary" icon="pencil" onClick={() => setSuggestOpen(true)}>Suggestion à ses wallets</LegButton> : null}
                  {canManage && detail.status === "active" && !adding ? <LegButton icon="plus" onClick={() => setAdding(true)}>Attribuer</LegButton> : null}
                </span>
              </div>

              {adding ? (
                <div className="lg-panel">
                  <p className="lg-hint">Choisissez les wallets à confier à {detail.firstName}. Chaque attribution est journalisée sur le wallet et notifie le gestionnaire.</p>
                  <HolderMultiPicker value={picked} onChange={setPicked} search={search} idPrefix="mg" emptyLabel="Aucun wallet ne correspond." />
                  <div className="lg-actions">
                    <LegButton icon="check" disabled={picked.length === 0 || picked.every((wallet) => assigned.has(`${wallet.walletType}:${wallet.holderId}`))} loading={busy === "assign"} onClick={() => void assignPicked()}>{picked.length > 1 ? `Attribuer ${picked.length} wallets` : "Attribuer"}</LegButton>
                    <LegButton variant="ghost" onClick={() => { setAdding(false); setPicked([]) }} disabled={busy === "assign"}>Annuler</LegButton>
                  </div>
                </div>
              ) : null}

              {detail.wallets.length === 0 && !adding ? <p className="lg-hint">Aucun wallet attribué : ce gestionnaire ne voit rien pour l'instant.</p> : (
                <div className="mg-wallets" role="list" aria-label="Wallets attribués">
                  {detail.wallets.map((wallet) => (
                    <div key={`${wallet.walletType}:${wallet.holderId}`} className="mg-wallet" role="listitem">
                      <LegSocle icon={wallet.walletType === "PERSONAL" ? "user" : "building"} tone={wallet.walletType === "PERSONAL" ? "violet" : "teal"} size="md" />
                      <span className="mg-wallet-main">
                        <strong>{wallet.name}</strong>
                        <small>{WALLET_TYPE_LABEL[wallet.walletType]}{wallet.subtitle ? ` · ${wallet.subtitle}` : ""} · attribué le {formatDate(wallet.assignedAt)}</small>
                      </span>
                      {wallet.status !== "active" && wallet.status !== "unknown" ? <LegPill tone="warn">{wallet.status === "suspended" ? "Suspendu" : "Clôturé"}</LegPill> : null}
                      {canManage ? <LegButton variant="ghost" icon="close" aria-label={`Retirer ${wallet.name} du portefeuille`} onClick={() => setRemoving(wallet)}>Retirer</LegButton> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <LegSection title="Compte">
              <LegRow label="E-mail" value={detail.email} />
              <LegRow label="Rôle" value={MANAGER_ROLE_LABEL[detail.role]} />
              <LegRow label="Dernière activité" value={detail.lastActiveAt ? formatDateTime(detail.lastActiveAt) : "Jamais"} />
              <LegRow label="Identifiant" value={<span className="lg-mono">#{detail.id}</span>} />
            </LegSection>
          </>
        ) : null}
      </LegDrawer>

      <LegReasonDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null) }}
        title="Retirer ce wallet du portefeuille ?"
        description={removing && detail ? `${detail.firstName} ne verra plus « ${removing.name} » : l'accès disparaît immédiatement. Le retrait est journalisé sur le wallet et notifie le gestionnaire.` : undefined}
        confirmLabel="Retirer"
        destructive
        busy={busy === "unassign"}
        onConfirm={async (reason) => {
          if (!detail || !removing) return
          setBusy("unassign")
          try {
            await api.admin.managers.unassign.mutate({ managerId: detail.id, walletType: removing.walletType, holderId: removing.holderId, reason })
            setRemoving(null)
            show("Wallet retiré du portefeuille.")
            await load(detail.id)
            await onChanged()
          } catch (error) {
            show(error instanceof Error ? error.message : "Retrait impossible.", "error")
          } finally {
            setBusy(null)
          }
        }}
      />
      <LegReasonDialog
        open={statusDialog !== null}
        onOpenChange={(open) => { if (!open) setStatusDialog(null) }}
        title={statusDialog === "suspended" ? "Suspendre ce compte ?" : "Réactiver ce compte ?"}
        description={statusDialog === "suspended" ? "Ses sessions sont coupées immédiatement et il ne peut plus se connecter. Ses attributions sont conservées." : "Le gestionnaire peut de nouveau se connecter et retrouve son portefeuille."}
        confirmLabel={statusDialog === "suspended" ? "Suspendre" : "Réactiver"}
        destructive={statusDialog === "suspended"}
        busy={busy === "status"}
        onConfirm={async (reason) => {
          if (!detail || !statusDialog) return
          setBusy("status")
          try {
            setDetail(await api.admin.managers.setStatus.mutate({ id: detail.id, status: statusDialog, reason }))
            setStatusDialog(null)
            show(statusDialog === "suspended" ? "Compte suspendu." : "Compte réactivé.")
            await onChanged()
          } catch (error) {
            show(error instanceof Error ? error.message : "Action impossible.", "error")
          } finally {
            setBusy(null)
          }
        }}
      />
      <SuggestionDialog open={suggestOpen} onOpenChange={setSuggestOpen} initialWallets={suggestTargets} heading={detail ? `Suggestion aux wallets de ${detail.firstName}` : "Nouvelle suggestion"} />
    </>
  )
}
