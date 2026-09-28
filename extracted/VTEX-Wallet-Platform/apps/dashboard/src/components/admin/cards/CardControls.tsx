"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"
import { fromMajorUnits, isCurrencyCode, toMajorUnits, format as formatMoney, type Currency } from "@vtex/money"

import { useToast } from "@/components/admin/Toast"
import { LegButton, LegConfirm, LegPill, LegReasonDialog, LegRow, LegSection } from "@/components/ui/legkit"
import { relativeTime } from "@/lib/cardFormat"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type ControlledCard = Outputs["admin"]["cards"]["get"]

const STATUS_LABEL = { active: "Active", frozen: "Gelée", expired: "Expirée", cancelled: "Annulée" } as const
const STATUS_TONE = { active: "ok", frozen: "warn", expired: "neutral", cancelled: "danger" } as const

function moneyText(cents: number, currency: string) {
  return isCurrencyCode(currency) ? formatMoney(cents, currency) : `${cents} ${currency}`
}

/** Champ de montant en unités de la devise du compte (jamais de centimes à la saisie) ; renvoie null tant que la saisie est invalide. */
function parseAmount(text: string, currency: string): number | null {
  const value = Number(text.replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(value) || value <= 0 || !isCurrencyCode(currency)) return null
  return fromMajorUnits(value, currency as Currency)
}

function amountText(cents: number, currency: string) {
  return isCurrencyCode(currency) ? String(toMajorUnits(cents, currency as Currency)).replace(".", ",") : String(cents)
}

function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <div className="lg-switch-row">
      <span><b>{label}</b><small>{hint}</small></span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="lg-switch" disabled={disabled} onClick={() => onChange(!checked)}><i /></button>
    </div>
  )
}

/**
 * Statut, canaux autorisés et plafonds d'une carte, renouvellement / remplacement / annulation (carte personnelle).
 * Tout passe par le serveur (source de vérité) : le Wallet du titulaire relit l'état à sa prochaine requête. Les boutons reflètent
 * les droits ; le serveur décide (`cards.manage`).
 */
export function CardControls({ card, canManage, onChanged, onOpenCard }: { card: ControlledCard; canManage: boolean; onChanged: (next: ControlledCard) => void | Promise<void>; onOpenCard: (cardId: number) => void }) {
  const { show } = useToast()
  const [online, setOnline] = React.useState(card.controls.online)
  const [contactless, setContactless] = React.useState(card.controls.contactless)
  const [cash, setCash] = React.useState(card.controls.cash)
  const [perTx, setPerTx] = React.useState(amountText(card.limits.perTransactionCents, card.currency))
  const [day, setDay] = React.useState(amountText(card.limits.dailyCents, card.currency))
  const [month, setMonth] = React.useState(amountText(card.limits.monthlyCents, card.currency))
  const [busy, setBusy] = React.useState<null | "freeze" | "controls" | "cancel" | "reissue">(null)
  const [dialog, setDialog] = React.useState<null | "cancel" | "renew" | "replace">(null)
  const settled = card.status === "cancelled" || card.status === "expired"
  const ref = { walletType: card.walletType, cardId: card.id }

  React.useEffect(() => {
    setOnline(card.controls.online); setContactless(card.controls.contactless); setCash(card.controls.cash)
    setPerTx(amountText(card.limits.perTransactionCents, card.currency)); setDay(amountText(card.limits.dailyCents, card.currency)); setMonth(amountText(card.limits.monthlyCents, card.currency))
  }, [card])

  const limits = { perTransactionLimitCents: parseAmount(perTx, card.currency), dailyLimitCents: parseAmount(day, card.currency), monthlyLimitCents: parseAmount(month, card.currency) }
  const limitsValid = Object.values(limits).every((value) => value !== null) && limits.perTransactionLimitCents! <= limits.dailyLimitCents! && limits.dailyLimitCents! <= limits.monthlyLimitCents!
  const dirty = online !== card.controls.online || contactless !== card.controls.contactless || cash !== card.controls.cash
    || limits.perTransactionLimitCents !== card.limits.perTransactionCents || limits.dailyLimitCents !== card.limits.dailyCents || limits.monthlyLimitCents !== card.limits.monthlyCents

  async function run<T>(kind: NonNullable<typeof busy>, action: () => Promise<T>, success: string, after?: (result: T) => void | Promise<void>) {
    setBusy(kind)
    try {
      const result = await action()
      show(success)
      if (after) await after(result)
      return true
    } catch (error) {
      show(error instanceof Error ? error.message : "Action impossible.", "error")
      return false
    } finally {
      setBusy(null)
    }
  }

  const toggleFreeze = () => run("freeze", () => api.admin.cards.setFrozen.mutate({ ...ref, frozen: card.status === "active" }), card.status === "active" ? "Carte gelée : plus aucun paiement." : "Carte dégelée.", onChanged)
  const saveControls = () => run("controls", () => api.admin.cards.updateControls.mutate({
    ...ref,
    ...(online !== card.controls.online ? { onlinePaymentsEnabled: online } : {}),
    ...(contactless !== card.controls.contactless ? { contactlessEnabled: contactless } : {}),
    ...(cash !== card.controls.cash ? { cashWithdrawalEnabled: cash } : {}),
    ...(limits.perTransactionLimitCents !== card.limits.perTransactionCents ? { perTransactionLimitCents: limits.perTransactionLimitCents! } : {}),
    ...(limits.dailyLimitCents !== card.limits.dailyCents ? { dailyLimitCents: limits.dailyLimitCents! } : {}),
    ...(limits.monthlyLimitCents !== card.limits.monthlyCents ? { monthlyLimitCents: limits.monthlyLimitCents! } : {}),
  }), "Paramètres enregistrés : le Wallet les relit immédiatement.", onChanged)

  return (
    <>
      <LegSection title="Statut et dernière utilisation">
        <LegRow label="Statut" value={<LegPill tone={STATUS_TONE[card.status]}>{STATUS_LABEL[card.status]}</LegPill>} />
        <LegRow label="Dernière utilisation" value={card.lastUsedAt ? relativeTime(card.lastUsedAt) : "Jamais utilisée"} />
        <LegRow label="Référence prestataire" value={<span className="lg-mono">tok_••••{card.tokenTail}</span>} />
        <LegRow label="Compte" value={`${card.holder.name} · ${card.currency}`} />
        {canManage && !settled ? (
          <div className="lg-actions">
            <LegButton variant="secondary" icon={card.status === "active" ? "lock" : "unlock"} loading={busy === "freeze"} onClick={() => void toggleFreeze()}>{card.status === "active" ? "Geler la carte" : "Dégeler la carte"}</LegButton>
          </div>
        ) : null}
      </LegSection>

      <LegSection title="Canaux autorisés">
        <Switch label="Paiements en ligne" hint="Achats sur internet" checked={online} onChange={setOnline} disabled={!canManage || settled} />
        <Switch label="Sans contact" hint="Paiement NFC en magasin" checked={contactless} onChange={setContactless} disabled={!canManage || settled} />
        <Switch label="Retraits d'espèces" hint="Distributeurs automatiques" checked={cash} onChange={setCash} disabled={!canManage || settled} />
      </LegSection>

      <LegSection title={`Plafonds (${card.currency})`}>
        <div className="lg-form-grid">
          <div><label className="lg-label" htmlFor="cc-per">Par opération</label><input id="cc-per" className="lg-input lg-input--mono" inputMode="decimal" value={perTx} onChange={(event) => setPerTx(event.target.value)} disabled={!canManage || settled} aria-invalid={limits.perTransactionLimitCents === null ? true : undefined} /></div>
          <div><label className="lg-label" htmlFor="cc-day">Par jour</label><input id="cc-day" className="lg-input lg-input--mono" inputMode="decimal" value={day} onChange={(event) => setDay(event.target.value)} disabled={!canManage || settled} aria-invalid={limits.dailyLimitCents === null ? true : undefined} /></div>
          <div><label className="lg-label" htmlFor="cc-month">Par mois</label><input id="cc-month" className="lg-input lg-input--mono" inputMode="decimal" value={month} onChange={(event) => setMonth(event.target.value)} disabled={!canManage || settled} aria-invalid={limits.monthlyLimitCents === null ? true : undefined} /></div>
        </div>
        <p className="lg-hint">{limitsValid ? `Actuel : ${moneyText(card.limits.perTransactionCents, card.currency)} / opération · ${moneyText(card.limits.dailyCents, card.currency)} / jour · ${moneyText(card.limits.monthlyCents, card.currency)} / mois.` : "Trois montants positifs, avec par opération ≤ par jour ≤ par mois."}</p>
        {canManage && !settled ? <div className="lg-actions"><LegButton icon="check" disabled={!dirty || !limitsValid} loading={busy === "controls"} onClick={() => void saveControls()}>Enregistrer les paramètres</LegButton></div> : null}
      </LegSection>

      {canManage && card.walletType === "PERSONAL" && !settled ? (
        <section className="cv-danger" aria-label="Cycle de vie de la carte">
          <p>Renouveler ou remplacer émet une nouvelle carte et annule l'ancienne (son numéro, son CVV et son PIN sont purgés du coffre).</p>
          <div className="lg-actions">
            <LegButton variant="secondary" icon="refresh" onClick={() => setDialog("renew")}>Renouveler</LegButton>
            <LegButton variant="secondary" icon="copy" onClick={() => setDialog("replace")}>Remplacer</LegButton>
            <LegButton variant="danger" icon="trash" onClick={() => setDialog("cancel")}>Annuler la carte</LegButton>
          </div>
        </section>
      ) : null}

      <LegConfirm
        open={dialog === "cancel" || dialog === "renew"}
        onOpenChange={(open) => { if (!open) setDialog(null) }}
        title={dialog === "cancel" ? "Annuler définitivement cette carte ?" : "Renouveler cette carte ?"}
        description={dialog === "cancel" ? "La carte ne pourra plus servir et ses données du coffre sont supprimées. Le titulaire est notifié. L'action est journalisée et irréversible." : "Une nouvelle carte est émise pour trois ans ; l'ancienne est annulée. Le titulaire est notifié."}
        confirmLabel={dialog === "cancel" ? "Annuler la carte" : "Renouveler"}
        destructive={dialog === "cancel"}
        busy={busy === "cancel" || busy === "reissue"}
        onConfirm={async () => {
          if (dialog === "cancel") {
            if (await run("cancel", () => api.admin.cards.cancel.mutate(ref), "Carte annulée.", onChanged)) setDialog(null)
          } else if (await run("reissue", () => api.admin.cards.reissue.mutate({ ...ref, action: "renew", idempotencyKey: `renew-${card.id}-${crypto.randomUUID()}` }), "Nouvelle carte émise.", (next) => onOpenCard(next.id))) setDialog(null)
        }}
      />
      <LegReasonDialog
        open={dialog === "replace"}
        onOpenChange={(open) => { if (!open) setDialog(null) }}
        title="Remplacer cette carte ?"
        description="Une nouvelle carte est émise et l'ancienne annulée (perte, vol, défaut). Le motif est conservé dans le journal."
        confirmLabel="Remplacer"
        minLength={5}
        busy={busy === "reissue"}
        onConfirm={async (reason) => {
          if (await run("reissue", () => api.admin.cards.reissue.mutate({ ...ref, action: "replace", reason, idempotencyKey: `replace-${card.id}-${crypto.randomUUID()}` }), "Carte remplacée.", (next) => onOpenCard(next.id))) setDialog(null)
        }}
      />
    </>
  )
}
