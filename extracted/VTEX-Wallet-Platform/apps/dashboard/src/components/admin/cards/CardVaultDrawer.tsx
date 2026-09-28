"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { CardControls } from "@/components/admin/cards/CardControls"
import { CardFace } from "@/components/admin/cards/CardFace"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegConfirm, LegDrawer, LegPill, LegSocle } from "@/components/ui/legkit"
import { NETWORK_LABEL, detectNetwork, digitsOnly, formatExpiry, groupPan, isExpired, luhnValid, maskExpiryInput, maskedPan, parseExpiry, relativeTime, themeFor, type CardNetwork } from "@/lib/cardFormat"
import { api } from "@/lib/trpc"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { cx } from "@/lib/utils"

type Outputs = inferRouterOutputs<AppRouter>
export type AdminCard = Outputs["admin"]["cards"]["get"]
export type CardTarget = { walletType: "PERSONAL" | "PROFESSIONAL"; cardId: number }
type Revealed = { data: Outputs["admin"]["cards"]["reveal"]; receivedAt: number }

const empty = "Non renseigné"

function expiryOf(card: Pick<AdminCard, "expiresAt">) {
  const date = new Date(card.expiresAt)
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() }
}

/**
 * Fiche d'une carte : face de carte, données masquées par défaut, révélation explicite (permission `cards.reveal`, journalisée),
 * remasquage automatique, saisie manuelle chiffrée dans le coffre. Les valeurs ne vivent que dans l'état React de ce composant :
 * elles disparaissent au remasquage, à la fermeture du tiroir ou quand l'onglet passe en arrière-plan.
 * Les boutons reflètent les droits ; c'est le serveur qui décide (RBAC + journal).
 */
export function CardVaultDrawer({ target, me, onNavigate, onClose, onChanged }: { target: CardTarget | null; me: { id: number; role: PlatformRole }; onNavigate: (target: CardTarget) => void; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [card, setCard] = React.useState<AdminCard | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [revealed, setRevealed] = React.useState<Revealed | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [busy, setBusy] = React.useState<null | "reveal" | "save" | "clear">(null)
  const [mode, setMode] = React.useState<"view" | "edit">("view")
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const canReveal = me.role === "super_admin"
  const canManage = isAdmin(me.role)

  const load = React.useCallback(async (next: CardTarget) => {
    setLoadError(null)
    try {
      setCard(await api.admin.cards.get.query(next))
    } catch (error) {
      setCard(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger la carte.")
    }
  }, [])

  const targetKey = target ? `${target.walletType}:${target.cardId}` : null
  React.useEffect(() => {
    setRevealed(null); setMode("view"); setCopied(null); setConfirmClear(false)
    if (!target) return // la dernière fiche reste affichée (masquée) le temps que le tiroir se referme
    setCard(null); setLoadError(null)
    void load(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé de la carte suffit ; `target` change d'identité à chaque rendu du parent
  }, [targetKey, load])

  // Remasquage automatique : échéance, onglet en arrière-plan, page quittée. Rien n'est gardé au-delà.
  React.useEffect(() => {
    if (!revealed) return
    const deadline = revealed.receivedAt + revealed.data.maskAfterSeconds * 1000
    const tick = () => {
      if (Date.now() >= deadline) { setRevealed(null); show("Carte remasquée automatiquement.") } else setNow(Date.now())
    }
    const timer = window.setInterval(tick, 250)
    const hide = () => { if (document.hidden) setRevealed(null) }
    document.addEventListener("visibilitychange", hide)
    window.addEventListener("pagehide", hide as EventListener)
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide as EventListener) }
  }, [revealed, show])

  async function reveal() {
    if (!target) return
    setBusy("reveal")
    try {
      const data = await api.admin.cards.reveal.mutate(target)
      setNow(Date.now())
      setRevealed({ data, receivedAt: Date.now() })
      await load(target)
    } catch (error) {
      show(error instanceof Error ? error.message : "Révélation impossible.", "error")
    } finally {
      setBusy(null)
    }
  }

  async function copy(key: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600)
      show(`${label} copié.`)
    } catch {
      show("Copie impossible : autorisez l'accès au presse-papiers dans le navigateur.", "error")
    }
  }

  async function clearAll() {
    if (!target) return
    setBusy("clear")
    try {
      setCard(await api.admin.cards.clearData.mutate(target))
      setRevealed(null)
      setConfirmClear(false)
      show("Données effacées du coffre.")
      await onChanged()
    } catch (error) {
      show(error instanceof Error ? error.message : "Effacement impossible.", "error")
    } finally {
      setBusy(null)
    }
  }

  const expiry = card ? expiryOf(card) : null
  const kind = card?.walletType === "PERSONAL" ? "Carte personnelle" : "Carte entreprise"
  const vault = card?.vault
  const hasAnyData = Boolean(vault && (vault.hasPan || vault.hasCvv || vault.hasPin))
  const remaining = revealed ? Math.max(0, (revealed.receivedAt + revealed.data.maskAfterSeconds * 1000 - now) / (revealed.data.maskAfterSeconds * 1000)) : null
  const secondsLeft = revealed && remaining !== null ? Math.ceil(remaining * revealed.data.maskAfterSeconds) : 0

  const editing = mode === "edit" && card !== null
  const title = card ? card.holder.name : loadError ? "Carte indisponible" : "Chargement…"

  return (
    <>
      <LegDrawer
        open={target !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche carte"
        title={title}
        subtitle={card ? `${card.label} · ${card.currency} · ${kind}` : undefined}
        footer={editing ? <EditFooter onDone={() => setMode("view")} busy={busy === "save"} /> : undefined}
      >
        {loadError ? <p role="alert" className="cv-locked"><LegIcon name="alert" />{loadError}</p> : null}
        {!card && !loadError ? <p className="lg-sub" role="status">Chargement de la carte…</p> : null}

        {card && expiry && !editing ? (
          <>
            <section className="cv-stage" aria-label="Carte">
              <CardFace
                theme={themeFor(card)}
                network={card.network}
                kind={kind}
                lastFour={card.lastFour}
                pan={revealed?.data.pan ?? null}
                holder={card.cardholderName}
                expiry={formatExpiry(expiry.month, expiry.year)}
                status={card.status}
                remaining={remaining}
              />
              {canReveal ? (
                <div className="cv-actions">
                  {revealed ? (
                    <LegButton icon="eye-off" onClick={() => setRevealed(null)}>Masquer</LegButton>
                  ) : hasAnyData ? (
                    <LegButton icon="eye" loading={busy === "reveal"} onClick={() => void reveal()}>Afficher les données</LegButton>
                  ) : (
                    <LegButton icon="plus" onClick={() => setMode("edit")}>Saisir les données</LegButton>
                  )}
                  {hasAnyData || revealed ? <LegButton variant="secondary" icon="pencil" onClick={() => { setRevealed(null); setMode("edit") }}>Modifier</LegButton> : null}
                </div>
              ) : null}
              <p className={cx("cv-note", revealed && "cv-note--live")} role="status" aria-live="polite">
                <LegIcon name={revealed ? "clock" : "lock"} />
                {revealed ? `Se remasque dans ${secondsLeft} s` : canReveal ? "Masquée · chaque affichage est journalisé" : "Masquée"}
              </p>
            </section>

            {!canReveal ? <p className="cv-locked" role="note"><LegIcon name="lock" />La lecture des données de carte est réservée au Super-administrateur. Vous voyez ici l'état masqué.</p> : null}

            <section aria-label="Données de la carte">
              <p className="lg-kicker lg-section-title">Données de la carte</p>
              <div className="cv-list">
                <Row icon="card" label="Numéro" value={revealed?.data.pan ? groupPan(revealed.data.pan) : vault?.hasPan ? maskedPan(card.lastFour) : null} masked={!revealed} copy={revealed?.data.pan ? { done: copied === "pan", onCopy: () => void copy("pan", revealed.data.pan!, "Numéro") } : undefined} testId="row-pan" />
                <Row icon="clock" label="Expiration" value={formatExpiry(expiry.month, expiry.year)} />
                <Row icon="shield" label="CVV" value={revealed ? revealed.data.cvv : vault?.hasCvv ? "•••" : null} masked={!revealed} copy={revealed?.data.cvv ? { done: copied === "cvv", onCopy: () => void copy("cvv", revealed.data.cvv!, "CVV") } : undefined} testId="row-cvv" />
                <Row icon="key" label="Code PIN" value={revealed ? revealed.data.pin : vault?.hasPin ? "••••" : null} masked={!revealed} copy={revealed?.data.pin ? { done: copied === "pin", onCopy: () => void copy("pin", revealed.data.pin!, "PIN") } : undefined} testId="row-pin" />
                <Row icon="user" label="Titulaire" value={card.cardholderName} text />
              </div>
            </section>

            <CardControls card={card} canManage={canManage} onChanged={async (next) => { setCard(next); await onChanged() }} onOpenCard={(cardId) => onNavigate({ walletType: "PERSONAL", cardId })} />

            <section className="cv-vault" aria-label="État du coffre">
              <div className="cv-vault-row">
                <LegSocle icon="shield" size="sm" />
                <span>{vault?.configured ? <><strong>Chiffré au repos</strong><small>AES-256-GCM · clé {vault.keyId}. Jamais renvoyé par les listes, les exports ni le journal.</small></> : <><strong>Aucune donnée saisie</strong><small>Le coffre est vide pour cette carte.</small></>}</span>
              </div>
              <div className="cv-vault-row">
                <LegSocle icon="history" size="sm" />
                <span><strong>{vault && vault.revealCount > 0 ? `${vault.revealCount} consultation${vault.revealCount > 1 ? "s" : ""}` : "Jamais consultée"}</strong><small>{vault?.lastRevealedAt ? `Dernière : ${card.lastRevealedByName ?? `#${vault.lastRevealedBy}`} · ${relativeTime(vault.lastRevealedAt)}` : "Chaque consultation est inscrite au journal, sans jamais en garder la valeur."}</small></span>
              </div>
              <div className="cv-vault-row">
                <LegSocle icon="clock" size="sm" />
                <span><strong>Remasquage automatique</strong><small>Après {revealed?.data.maskAfterSeconds ?? 30} s, à la fermeture, ou si l'onglet passe en arrière-plan.</small></span>
              </div>
            </section>

            {canReveal && vault?.configured ? (
              <div className="cv-danger">
                <p>Effacer supprime définitivement le numéro, le CVV et le PIN du coffre. La carte elle-même n'est pas touchée.</p>
                <LegButton variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>Effacer les données</LegButton>
              </div>
            ) : null}
          </>
        ) : null}

        {editing && card ? <EditForm key={targetKey ?? "none"} card={card} target={target!} onBusy={(value) => setBusy(value ? "save" : null)} onSaved={async (next) => { setCard(next); setMode("view"); setRevealed(null); show("Données enregistrées dans le coffre (chiffrées)."); await onChanged() }} /> : null}
      </LegDrawer>

      <LegConfirm
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Effacer les données de cette carte ?"
        description="Le numéro, le CVV et le PIN seront supprimés du coffre, définitivement. Vous pourrez en saisir de nouveaux à tout moment. L'action est journalisée."
        confirmLabel="Effacer"
        destructive
        busy={busy === "clear"}
        onConfirm={() => void clearAll()}
      />
    </>
  )
}

function Row({ icon, label, value, masked = false, text = false, copy, testId }: { icon: "card" | "clock" | "shield" | "key" | "user"; label: string; value: string | null; masked?: boolean; text?: boolean; copy?: { done: boolean; onCopy: () => void }; testId?: string }) {
  return (
    <div className="cv-row" data-testid={testId}>
      <LegSocle icon={icon} size="md" />
      <div className="cv-row-body">
        <span className="cv-row-label">{label}</span>
        <span className={cx("cv-row-value", text && "is-text", value === null && "is-empty", value !== null && masked && "is-masked")}>{value ?? empty}</span>
      </div>
      {copy ? <button type="button" className={cx("lg-socle-btn", copy.done && "is-done")} onClick={copy.onCopy} aria-label={`Copier : ${label}`}><LegIcon name={copy.done ? "check" : "copy"} /></button> : null}
    </div>
  )
}

/* ── Saisie manuelle ─────────────────────────────────────────────── */

const FORM_ID = "card-vault-form"

function EditFooter({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  return (
    <>
      <LegButton variant="ghost" onClick={onDone} disabled={busy}>Annuler</LegButton>
      <LegButton type="submit" form={FORM_ID} icon="lock" loading={busy}>Enregistrer dans le coffre</LegButton>
    </>
  )
}

function EditForm({ card, target, onBusy, onSaved }: { card: AdminCard; target: CardTarget; onBusy: (busy: boolean) => void; onSaved: (card: AdminCard) => Promise<void> }) {
  const { show } = useToast()
  const current = expiryOf(card)
  const [pan, setPan] = React.useState("")
  const [expiry, setExpiry] = React.useState(formatExpiry(current.month, current.year))
  const [cvv, setCvv] = React.useState("")
  const [pin, setPin] = React.useState("")
  const [holder, setHolder] = React.useState(card.cardholderName)
  const [showSecrets, setShowSecrets] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const digits = digitsOnly(pan)
  const detected = detectNetwork(digits)
  const previewNetwork: CardNetwork = detected === "visa" || detected === "mastercard" ? detected : card.network
  const parsedExpiry = parseExpiry(expiry)
  const previewExpiry = parsedExpiry ? formatExpiry(parsedExpiry.month, parsedExpiry.year) : expiry || "MM/AA"
  const luhn = digits.length >= 12 ? luhnValid(digits) : null

  function validate() {
    const next: Record<string, string> = {}
    if (digits && (digits.length < 12 || digits.length > 19)) next.pan = "Le numéro contient entre 12 et 19 chiffres."
    if (cvv && !/^\d{3,4}$/.test(cvv)) next.cvv = "3 ou 4 chiffres."
    if (pin && !/^\d{4}$/.test(pin)) next.pin = "4 chiffres."
    if (!parsedExpiry) next.expiry = "Format MM/AA."
    else if (isExpired(parsedExpiry.month, parsedExpiry.year)) next.expiry = "Cette date est dépassée."
    if (holder.trim().length < 2) next.holder = "Nom du titulaire requis."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate() || !parsedExpiry) return
    const payload: Parameters<typeof api.admin.cards.setData.mutate>[0] = { walletType: target.walletType, cardId: target.cardId }
    if (digits) payload.pan = digits
    if (cvv) payload.cvv = cvv
    if (pin) payload.pin = pin
    if (parsedExpiry.month !== current.month || parsedExpiry.year !== current.year) { payload.expiryMonth = parsedExpiry.month; payload.expiryYear = parsedExpiry.year }
    if (holder.trim() !== card.cardholderName) payload.cardholderName = holder.trim()
    if (!payload.pan && !payload.cvv && !payload.pin && payload.expiryMonth === undefined && payload.cardholderName === undefined) {
      setErrors({ pan: "Renseignez au moins une donnée à enregistrer." })
      return
    }
    onBusy(true)
    try {
      await onSaved(await api.admin.cards.setData.mutate(payload))
    } catch (error) {
      show(error instanceof Error ? error.message : "Enregistrement impossible.", "error")
    } finally {
      onBusy(false)
    }
  }

  const stored = card.vault
  return (
    <form id={FORM_ID} className="cv-form" onSubmit={(event) => void submit(event)} noValidate autoComplete="off">
      <section className="cv-stage" aria-label="Aperçu en direct">
        <CardFace theme={themeFor(card)} network={previewNetwork} kind={card.walletType === "PERSONAL" ? "Carte personnelle" : "Carte entreprise"} lastFour={digits.length >= 4 ? digits.slice(-4) : card.lastFour} pan={digits.length >= 12 ? digits : null} holder={holder} expiry={previewExpiry} status={card.status} />
        <p className="cv-note"><LegIcon name="eye" />Aperçu en direct de ce que vous saisissez</p>
      </section>

      <div>
        <label className="lg-label" htmlFor="cv-pan">Numéro de carte</label>
        <input id="cv-pan" className="lg-input lg-input--mono" inputMode="numeric" autoComplete="off" data-lpignore="true" placeholder={stored.hasPan ? "Laisser vide pour conserver le numéro" : "0000 0000 0000 0000"} value={groupPan(pan)} onChange={(event) => setPan(digitsOnly(event.target.value).slice(0, 19))} aria-invalid={errors.pan ? true : undefined} aria-describedby="cv-pan-hint" autoFocus />
        <div className="cv-inline-hint" id="cv-pan-hint">
          {errors.pan ? <LegPill tone="danger" icon="alert">{errors.pan}</LegPill> : digits ? (
            <>
              {detected ? <LegPill tone="navy">{detected === "amex" ? "American Express" : NETWORK_LABEL[detected]}</LegPill> : null}
              {luhn === null ? <LegPill tone="neutral">{digits.length} chiffre{digits.length > 1 ? "s" : ""}</LegPill> : luhn ? <LegPill tone="ok" icon="check">Clé de Luhn valide</LegPill> : <LegPill tone="warn" icon="alert">Clé de Luhn invalide — vérifiez la saisie</LegPill>}
            </>
          ) : stored.hasPan ? <LegPill tone="ok" icon="lock">Numéro déjà chiffré dans le coffre</LegPill> : null}
        </div>
      </div>

      <div className="cv-grid-2">
        <div>
          <label className="lg-label" htmlFor="cv-expiry">Expiration</label>
          <input id="cv-expiry" className="lg-input lg-input--mono" inputMode="numeric" autoComplete="off" placeholder="MM/AA" maxLength={5} value={expiry} onChange={(event) => setExpiry(maskExpiryInput(event.target.value))} aria-invalid={errors.expiry ? true : undefined} />
          {errors.expiry ? <p className="lg-hint" role="alert" style={{ color: "var(--vx-danger)" }}>{errors.expiry}</p> : null}
        </div>
        <div>
          <label className="lg-label" htmlFor="cv-cvv">CVV</label>
          <div className="lg-input-wrap">
            <input id="cv-cvv" className={cx("lg-input lg-input--mono lg-input--secret", showSecrets && "is-visible")} inputMode="numeric" autoComplete="off" data-lpignore="true" maxLength={4} placeholder={stored.hasCvv ? "Inchangé" : "000"} value={cvv} onChange={(event) => setCvv(digitsOnly(event.target.value).slice(0, 4))} aria-invalid={errors.cvv ? true : undefined} />
            <button type="button" className="lg-socle-btn" onClick={() => setShowSecrets((value) => !value)} aria-label={showSecrets ? "Masquer CVV et PIN" : "Afficher CVV et PIN"} aria-pressed={showSecrets}><LegIcon name={showSecrets ? "eye-off" : "eye"} /></button>
          </div>
          {errors.cvv ? <p className="lg-hint" role="alert" style={{ color: "var(--vx-danger)" }}>{errors.cvv}</p> : null}
        </div>
      </div>

      <div className="cv-grid-2">
        <div>
          <label className="lg-label" htmlFor="cv-pin">Code PIN</label>
          <input id="cv-pin" className={cx("lg-input lg-input--mono lg-input--secret", showSecrets && "is-visible")} inputMode="numeric" autoComplete="off" data-lpignore="true" maxLength={4} placeholder={stored.hasPin ? "Inchangé" : "0000"} value={pin} onChange={(event) => setPin(digitsOnly(event.target.value).slice(0, 4))} aria-invalid={errors.pin ? true : undefined} />
          {errors.pin ? <p className="lg-hint" role="alert" style={{ color: "var(--vx-danger)" }}>{errors.pin}</p> : null}
        </div>
        <div>
          <label className="lg-label" htmlFor="cv-holder">Titulaire</label>
          <input id="cv-holder" className="lg-input" autoComplete="off" value={holder} onChange={(event) => setHolder(event.target.value.toUpperCase())} aria-invalid={errors.holder ? true : undefined} />
          {errors.holder ? <p className="lg-hint" role="alert" style={{ color: "var(--vx-danger)" }}>{errors.holder}</p> : null}
        </div>
      </div>

      <p className="lg-hint">Les champs laissés vides restent inchangés. Les valeurs sont chiffrées (AES-256-GCM) avant d'être écrites{card.walletType === "PERSONAL" ? " ; le PIN saisi devient aussi celui de la carte pour son titulaire" : ""}. Elles ne sont jamais renvoyées par les listes, les exports ni le journal.</p>
    </form>
  )
}
