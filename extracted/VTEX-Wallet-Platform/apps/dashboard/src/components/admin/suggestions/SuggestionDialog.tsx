"use client"

import * as React from "react"

import { HolderMultiPicker, type HolderChoice } from "@/components/admin/holders/HolderMultiPicker"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegModal } from "@/components/ui/legkit"
import { api } from "@/lib/trpc"

const MAX_TITLE = 120
const MAX_BODY = 500

interface SendResult { sent: number; wallets: number; skipped: Array<{ name: string; reason: string }> }

/**
 * Rédiger et envoyer une suggestion à un ou plusieurs wallets. Chaque destinataire (titulaire, ou propriétaires et administrateurs d'une entreprise)
 * la reçoit dans « Notifications / Suggestions » de son wallet. Le serveur refuse tout wallet hors du périmètre de l'expéditeur.
 */
export function SuggestionDialog({ open, onOpenChange, initialWallets = [], onSent, heading = "Nouvelle suggestion" }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWallets?: HolderChoice[]
  onSent?: (result: SendResult) => void | Promise<void>
  heading?: string
}) {
  const [wallets, setWallets] = React.useState<HolderChoice[]>(initialWallets)
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<SendResult | null>(null)

  React.useEffect(() => {
    if (open) { setWallets(initialWallets); setTitle(""); setBody(""); setError(null); setResult(null); setBusy(false) }
    // Les portefeuilles initiaux ne sont relus qu'à l'ouverture : modifier la sélection ne doit pas la réinitialiser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const search = React.useCallback((query: string) => api.admin.suggestions.targets.query({ query }), [])
  const valid = wallets.length > 0 && title.trim().length >= 2 && body.trim().length >= 2

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const outcome = await api.admin.suggestions.send.mutate({ wallets: wallets.map(({ walletType, holderId }) => ({ walletType, holderId })), title: title.trim(), body: body.trim() })
      setResult(outcome)
      await onSent?.(outcome)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Envoi impossible.")
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <LegModal open={open} onOpenChange={onOpenChange} icon="check" tone="green" title={result.sent > 0 ? "Suggestion envoyée" : "Rien n'a été envoyé"} description={result.sent > 0 ? `${result.sent} destinataire${result.sent > 1 ? "s" : ""} sur ${result.wallets} wallet${result.wallets > 1 ? "s" : ""} ${result.sent > 1 ? "ont" : "a"} reçu le message.` : "Aucun des wallets choisis n'a de destinataire actif."} footer={<LegButton onClick={() => onOpenChange(false)}>Fermer</LegButton>}>
        {result.skipped.length > 0 ? (
          <p className="lg-notice" role="status"><LegIcon name="alert" /><span>Ignorés — {result.skipped.map((item) => `${item.name} (${item.reason.toLowerCase()})`).join(" · ")}</span></p>
        ) : null}
      </LegModal>
    )
  }

  return (
    <LegModal
      open={open}
      onOpenChange={onOpenChange}
      wide
      icon="pencil"
      tone="navy"
      title={heading}
      description="Le message apparaît dans les notifications du wallet, avec votre prénom et votre rôle. L'envoi est journalisé."
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</LegButton>
        <LegButton icon="check" disabled={!valid} loading={busy} onClick={() => void submit()}>{wallets.length > 1 ? `Envoyer à ${wallets.length} wallets` : "Envoyer"}</LegButton>
      </>}
    >
      <fieldset className="lg-fieldset">
        <legend className="lg-label">Wallets destinataires</legend>
        <HolderMultiPicker value={wallets} onChange={setWallets} search={search} idPrefix="sg" emptyLabel="Aucun wallet ne correspond à votre périmètre." />
      </fieldset>
      <div>
        <label className="lg-label" htmlFor="sg-title">Titre</label>
        <input id="sg-title" className="lg-input" value={title} maxLength={MAX_TITLE} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Complétez votre profil" autoComplete="off" />
      </div>
      <div>
        <label className="lg-label" htmlFor="sg-body">Message</label>
        <textarea id="sg-body" className="lg-input lg-textarea" rows={4} value={body} maxLength={MAX_BODY} onChange={(event) => setBody(event.target.value)} placeholder="Ce que vous voulez suggérer, en une ou deux phrases." />
        <p className="lg-hint" aria-live="polite">{body.length} / {MAX_BODY} caractères</p>
      </div>
      {error ? <p role="alert" className="lg-error">{error}</p> : null}
    </LegModal>
  )
}
