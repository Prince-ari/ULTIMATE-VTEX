"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { HolderPicker, type HolderSelection } from "@/components/admin/banking/HolderPicker"
import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegDrawer, LegPill, LegReasonDialog, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDate, formatDateTime } from "@/lib/adminFormat"
import { KIND_LABEL, STATUS_LABEL_BANK, describeBankEvent, groupIban, maskIbanInput, toneForCurrency } from "@/lib/bankFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { cx } from "@/lib/utils"

type Outputs = inferRouterOutputs<AppRouter>
export type BankDetail = Outputs["admin"]["banking"]["get"]
type Revealed = { iban: string; receivedAt: number; maskAfterSeconds: number }

const MASK_AFTER_SECONDS = 30

/**
 * Fiche d'un RIB : IBAN masqué par défaut (affichage journalisé, remasquage auto), coordonnées, rattachement (attribuer / réattribuer /
 * retirer), relations société → compte → RIB → sous-RIB, historique. Les boutons reflètent les droits ; le serveur décide.
 */
export function BankAccountDrawer({ bankId, me, onNavigate, onClose, onChanged }: { bankId: number | null; me: { id: number; role: PlatformRole }; onNavigate: (id: number) => void; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [detail, setDetail] = React.useState<BankDetail | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [revealed, setRevealed] = React.useState<Revealed | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [mode, setMode] = React.useState<"view" | "edit" | "assign">("view")
  const [busy, setBusy] = React.useState<null | "reveal" | "save" | "status" | "assign" | "unassign">(null)
  const [statusDialog, setStatusDialog] = React.useState<null | "disabled" | "active">(null)
  const [unassignOpen, setUnassignOpen] = React.useState(false)
  const [assignReasonOpen, setAssignReasonOpen] = React.useState(false)
  const [selection, setSelection] = React.useState<HolderSelection | null>(null)
  const [copied, setCopied] = React.useState(false)
  const canManage = isAdmin(me.role)

  const load = React.useCallback(async (id: number) => {
    setLoadError(null)
    try {
      setDetail(await api.admin.banking.get.query({ id }))
    } catch (error) {
      setDetail(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger le RIB.")
    }
  }, [])

  React.useEffect(() => {
    setRevealed(null); setMode("view"); setSelection(null); setCopied(false)
    if (bankId === null) return // le dernier RIB reste affiché (masqué) le temps que le tiroir se referme
    setDetail(null); setLoadError(null)
    void load(bankId)
  }, [bankId, load])

  // Remasquage automatique : échéance, onglet en arrière-plan, page quittée.
  React.useEffect(() => {
    if (!revealed) return
    const deadline = revealed.receivedAt + revealed.maskAfterSeconds * 1000
    const tick = () => { if (Date.now() >= deadline) { setRevealed(null); show("IBAN remasqué automatiquement.") } else setNow(Date.now()) }
    const timer = window.setInterval(tick, 250)
    const hide = () => { if (document.hidden) setRevealed(null) }
    document.addEventListener("visibilitychange", hide)
    window.addEventListener("pagehide", hide as EventListener)
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide as EventListener) }
  }, [revealed, show])

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<BankDetail>, success: string) {
    setBusy(kind)
    try {
      setDetail(await action())
      setRevealed(null)
      show(success)
      await onChanged()
      return true
    } catch (error) {
      show(error instanceof Error ? error.message : "Action impossible.", "error")
      return false
    } finally {
      setBusy(null)
    }
  }

  async function reveal() {
    if (bankId === null) return
    setBusy("reveal")
    try {
      const result = await api.admin.banking.reveal.mutate({ id: bankId })
      setNow(Date.now())
      setRevealed({ iban: result.iban, receivedAt: Date.now(), maskAfterSeconds: MASK_AFTER_SECONDS })
      await load(bankId)
    } catch (error) {
      show(error instanceof Error ? error.message : "Affichage impossible.", "error")
    } finally {
      setBusy(null)
    }
  }

  async function copyIban() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.iban)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      show("IBAN copié.")
    } catch {
      show("Copie impossible : autorisez l'accès au presse-papiers dans le navigateur.", "error")
    }
  }

  const account = detail?.account
  const remaining = revealed ? Math.max(0, revealed.receivedAt + revealed.maskAfterSeconds * 1000 - now) / (revealed.maskAfterSeconds * 1000) : 0
  const secondsLeft = Math.ceil(remaining * MASK_AFTER_SECONDS)
  const title = account ? account.label : loadError ? "RIB indisponible" : "Chargement…"

  return (
    <>
      <LegDrawer
        open={bankId !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker={account ? `Fiche RIB · ${KIND_LABEL[account.kind]}` : "Fiche RIB"}
        title={title}
        subtitle={account ? (account.holder ? `${account.holder.name} · ${account.ledger?.label ?? ""}` : "Non attribué — dans le stock") : undefined}
        footer={account && canManage && mode === "view" ? (
          <>
            <LegButton icon="pencil" onClick={() => { setRevealed(null); setMode("edit") }}>Modifier</LegButton>
            {account.status === "active"
              ? <LegButton variant="secondary" icon="lock" onClick={() => setStatusDialog("disabled")}>Désactiver</LegButton>
              : <LegButton variant="secondary" icon="check" onClick={() => setStatusDialog("active")}>Réactiver</LegButton>}
          </>
        ) : undefined}
      >
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!detail && !loadError ? <p className="lg-sub" role="status">Chargement du RIB…</p> : null}

        {detail && account ? (
          <>
            <section className={cx("bk-hero", account.status === "disabled" && "is-disabled")} aria-label="IBAN">
              <div className="bk-hero-top">
                <span className="lg-kicker">IBAN</span>
                <span className="bk-hero-pills">
                  <LegPill tone={account.status === "active" ? "ok" : "danger"}>{STATUS_LABEL_BANK[account.status]}</LegPill>
                  <LegPill tone="navy">{KIND_LABEL[account.kind]}</LegPill>
                </span>
              </div>
              <output key={revealed ? "on" : "off"} className="bk-iban" data-revealed={Boolean(revealed)} data-testid="bank-iban" aria-live="polite">
                <IbanDigits text={revealed ? groupIban(revealed.iban) : account.ibanMasked} />
              </output>
              <div className="bk-hero-meta">
                <span><small>BIC</small><b className="lg-mono">{account.bic ?? "—"}</b></span>
                <span><small>Banque</small><b>{account.bankName}</b></span>
                <span><small>Devise</small><b>{account.currency}</b></span>
              </div>
              {isAdmin(me.role) ? (
                <div className="bk-hero-actions">
                  {revealed ? <LegButton icon="eye-off" onClick={() => setRevealed(null)}>Masquer</LegButton> : <LegButton icon="eye" loading={busy === "reveal"} onClick={() => void reveal()}>Afficher l'IBAN</LegButton>}
                  <LegButton variant="secondary" icon={copied ? "check" : "copy"} disabled={!revealed} onClick={() => void copyIban()}>{copied ? "Copié" : "Copier"}</LegButton>
                </div>
              ) : null}
              <p className={cx("cv-note", revealed && "cv-note--live")} role="status" aria-live="polite">
                <LegIcon name={revealed ? "clock" : "lock"} />
                {revealed ? `Se remasque dans ${secondsLeft} s` : isAdmin(me.role) ? "Masqué · chaque affichage est journalisé" : "Masqué · lecture réservée aux administrateurs"}
              </p>
              {revealed ? <div className="cf-timer bk-timer" aria-hidden="true"><i style={{ width: `${remaining * 100}%` }} /></div> : null}
            </section>

            {mode === "edit" ? (
              <EditForm key={account.id} account={account} busy={busy === "save"} onCancel={() => setMode("view")} onSubmit={async (input) => {
                const ok = await run("save", () => api.admin.banking.update.mutate({ id: account.id, ...input }), "RIB modifié et journalisé.")
                if (ok) setMode("view")
              }} />
            ) : (
              <>
                <LegSection title="Coordonnées">
                  <LegRow label="Titulaire du compte" value={account.accountHolderName} />
                  <LegRow label="Banque" value={account.bankName} />
                  <LegRow label="Devise" value={account.currency} />
                  <LegRow label="Créé le" value={formatDate(account.createdAt)} />
                  <LegRow label="Dernière modification" value={formatDateTime(account.updatedAt)} />
                  {account.disabledAt ? <LegRow label="Désactivé le" value={formatDateTime(account.disabledAt)} /> : null}
                </LegSection>

                <section>
                  <p className="lg-kicker lg-section-title">Rattachement</p>
                  <div className="lg-panel">
                    {account.holder ? (
                      <div className="lg-account-head">
                        <LegSocle icon={account.walletType === "PERSONAL" ? "user" : "building"} tone={account.walletType === "PERSONAL" ? "violet" : "teal"} size="md" />
                        <span><strong>{account.holder.name}</strong><small>{account.walletType === "PERSONAL" ? "Wallet personnel" : "Wallet Pro"} · {account.ledger?.label} · #{account.ledgerAccountId}</small></span>
                      </div>
                    ) : <p className="lg-hint">Ce sous-RIB n'est attribué à aucun compte : il attend dans le stock.</p>}
                    {account.kind === "SUB" && canManage ? (
                      mode === "assign" ? (
                        <div className="lg-stack">
                          <HolderPicker value={selection} onChange={setSelection} currency={account.currency} idPrefix="ba" />
                          <div className="lg-actions">
                            <LegButton disabled={!selection || selection.accountId === null} icon="link" onClick={() => setAssignReasonOpen(true)}>{account.holder ? "Réattribuer" : "Attribuer"}</LegButton>
                            <LegButton variant="ghost" onClick={() => { setMode("view"); setSelection(null) }}>Annuler</LegButton>
                          </div>
                        </div>
                      ) : (
                        <div className="lg-actions">
                          {account.status === "active" ? <LegButton variant="secondary" icon="link" onClick={() => setMode("assign")}>{account.holder ? "Réattribuer" : "Attribuer à un compte"}</LegButton> : <p className="lg-hint">Réactivez ce sous-RIB pour l'attribuer.</p>}
                          {account.holder ? <LegButton variant="ghost" icon="close" onClick={() => setUnassignOpen(true)}>Retirer du compte</LegButton> : null}
                        </div>
                      )
                    ) : account.kind === "MAIN" ? <p className="lg-hint">Un RIB principal appartient à son compte. Pour le changer, modifiez son IBAN (rotation journalisée).</p> : null}
                  </div>
                </section>

                {detail.relations.length > 1 ? (
                  <section>
                    <p className="lg-kicker lg-section-title">Relations</p>
                    <div className="bk-tree" role="tree" aria-label="Société, compte, RIB et sous-RIB">
                      <div className="bk-tree-root"><LegSocle icon={account.walletType === "PERSONAL" ? "user" : "building"} tone={account.walletType === "PERSONAL" ? "violet" : "teal"} size="sm" /><span><strong>{account.holder?.name}</strong><small>{account.ledger?.label}</small></span></div>
                      {detail.relations.map((relation) => (
                        <button key={relation.id} type="button" role="treeitem" aria-selected={relation.id === account.id} className={cx("bk-tree-node", relation.id === account.id && "is-current", relation.status === "disabled" && "is-disabled")} onClick={() => relation.id !== account.id && onNavigate(relation.id)}>
                          <LegSocle icon={relation.kind === "MAIN" ? "bank" : "hash"} tone={relation.kind === "MAIN" ? "navy" : toneForCurrency(relation.currency)} size="xs" />
                          <span><b>{relation.label}</b><small className="lg-mono">{relation.ibanMasked}</small></span>
                          <LegPill tone={relation.status === "active" ? "ok" : "danger"}>{KIND_LABEL[relation.kind]}</LegPill>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {detail.history ? (
                  <section>
                    <p className="lg-kicker lg-section-title">Historique</p>
                    {detail.history.length === 0 ? <p className="lg-hint">Aucun événement.</p> : (
                      <div className="lg-panel" role="list" aria-label="Historique du RIB">
                        {detail.history.map((entry) => {
                          const described = describeBankEvent(entry)
                          return (
                            <div key={entry.id} className="lg-event" role="listitem">
                              <div className="lg-event-head"><b className="bk-event-title">{described.title}</b><time>{formatDateTime(entry.createdAt)}</time></div>
                              <small>{entry.actorName ?? (entry.actorId ? `#${entry.actorId}` : "système")}{entry.actorRole ? ` · ${entry.actorRole}` : ""}{entry.ip ? ` · ${entry.ip}` : ""}</small>
                              {described.reason ? <small className="bk-event-reason">« {described.reason} »</small> : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </LegDrawer>

      <LegReasonDialog
        open={statusDialog !== null}
        onOpenChange={(open) => { if (!open) setStatusDialog(null) }}
        title={statusDialog === "disabled" ? "Désactiver ce RIB ?" : "Réactiver ce RIB ?"}
        description={statusDialog === "disabled" ? (account?.kind === "MAIN" ? "Le RIB principal disparaît des coordonnées du compte : le Wallet n'affichera plus d'IBAN tant qu'il n'est pas remplacé ou réactivé." : "Le sous-RIB n'est plus proposé au titulaire ; il reste dans l'historique.") : "Le RIB redevient visible pour son titulaire."}
        confirmLabel={statusDialog === "disabled" ? "Désactiver" : "Réactiver"}
        destructive={statusDialog === "disabled"}
        busy={busy === "status"}
        onConfirm={async (reason) => {
          if (!account || !statusDialog) return
          if (await run("status", () => api.admin.banking.setStatus.mutate({ id: account.id, status: statusDialog, reason }), statusDialog === "disabled" ? "RIB désactivé." : "RIB réactivé.")) setStatusDialog(null)
        }}
      />
      <LegReasonDialog
        open={unassignOpen}
        onOpenChange={setUnassignOpen}
        title="Retirer ce sous-RIB du compte ?"
        description="Le sous-RIB retourne dans le stock ; son titulaire ne le voit plus. Vous pourrez le réattribuer."
        confirmLabel="Retirer"
        destructive
        busy={busy === "unassign"}
        onConfirm={async (reason) => {
          if (!account) return
          if (await run("unassign", () => api.admin.banking.unassign.mutate({ id: account.id, reason }), "Sous-RIB retiré du compte.")) setUnassignOpen(false)
        }}
      />
      <LegReasonDialog
        open={assignReasonOpen}
        onOpenChange={setAssignReasonOpen}
        title={account?.holder ? "Réattribuer ce sous-RIB ?" : "Attribuer ce sous-RIB ?"}
        description={selection ? `Il sera rattaché à ${selection.holder.name} (${selection.holder.accounts.find((item) => item.id === selection.accountId)?.label ?? "compte"}). L'ancien rattachement est conservé dans l'historique.` : undefined}
        confirmLabel={account?.holder ? "Réattribuer" : "Attribuer"}
        busy={busy === "assign"}
        onConfirm={async (reason) => {
          if (!account || !selection || selection.accountId === null) return
          const ok = await run("assign", () => api.admin.banking.assign.mutate({ id: account.id, walletType: selection.holder.walletType, holderId: selection.holder.holderId, ledgerAccountId: selection.accountId!, reason }), "Sous-RIB attribué.")
          if (ok) { setAssignReasonOpen(false); setMode("view"); setSelection(null) }
        }}
      />
    </>
  )
}

/** IBAN affiché caractère par caractère : la révélation « retombe » chiffre par chiffre (même mouvement que la face de carte). */
function IbanDigits({ text }: { text: string }) {
  let index = 0
  return (
    <>
      {[...text].map((char, position) => char === " " ? <span key={position} className="cf-sp" /> : <span key={position} className="cf-ch" style={{ "--i": index++ } as React.CSSProperties}>{char}</span>)}
    </>
  )
}

function EditForm({ account, busy, onCancel, onSubmit }: { account: BankDetail["account"]; busy: boolean; onCancel: () => void; onSubmit: (input: { label?: string; bankName?: string; accountHolderName?: string; bic?: string | null; iban?: string; reason: string }) => Promise<void> }) {
  const [label, setLabel] = React.useState(account.label)
  const [bankName, setBankName] = React.useState(account.bankName)
  const [holderName, setHolderName] = React.useState(account.accountHolderName)
  const [bic, setBic] = React.useState(account.bic ?? "")
  const [iban, setIban] = React.useState("")
  const [reason, setReason] = React.useState("")
  const changed = label.trim() !== account.label || bankName.trim() !== account.bankName || holderName.trim() !== account.accountHolderName || bic.trim().toUpperCase() !== (account.bic ?? "") || iban.replace(/\s/g, "") !== ""
  const valid = changed && label.trim().length >= 2 && holderName.trim().length >= 2 && reason.trim().length >= 8

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    void onSubmit({
      ...(label.trim() !== account.label ? { label: label.trim() } : {}),
      ...(bankName.trim() !== account.bankName ? { bankName: bankName.trim() } : {}),
      ...(holderName.trim() !== account.accountHolderName ? { accountHolderName: holderName.trim() } : {}),
      ...(bic.trim().toUpperCase() !== (account.bic ?? "") ? { bic: bic.trim() || null } : {}),
      ...(iban.replace(/\s/g, "") ? { iban: iban.replace(/\s/g, "") } : {}),
      reason: reason.trim(),
    })
  }

  return (
    <form className="lg-stack" onSubmit={submit} noValidate autoComplete="off">
      <p className="lg-kicker">Modifier le RIB</p>
      <div className="lg-form-grid">
        <div><label className="lg-label" htmlFor="be-label">Libellé</label><input id="be-label" className="lg-input" value={label} onChange={(event) => setLabel(event.target.value)} /></div>
        <div><label className="lg-label" htmlFor="be-bank">Banque</label><input id="be-bank" className="lg-input" value={bankName} onChange={(event) => setBankName(event.target.value)} /></div>
        <div><label className="lg-label" htmlFor="be-holder">Titulaire du compte</label><input id="be-holder" className="lg-input" value={holderName} onChange={(event) => setHolderName(event.target.value)} /></div>
        <div><label className="lg-label" htmlFor="be-bic">BIC</label><input id="be-bic" className="lg-input lg-input--mono" value={bic} onChange={(event) => setBic(event.target.value.toUpperCase())} maxLength={11} /></div>
      </div>
      <div>
        <label className="lg-label" htmlFor="be-iban">Nouvel IBAN (rotation)</label>
        <input id="be-iban" className="lg-input lg-input--mono" value={iban} onChange={(event) => setIban(maskIbanInput(event.target.value))} placeholder="Laisser vide pour conserver l'IBAN actuel" autoComplete="off" />
        {iban ? <p className="lg-hint">L'ancien IBAN est remplacé partout et n'est conservé nulle part ; l'opération est journalisée.</p> : null}
      </div>
      <div>
        <label className="lg-label" htmlFor="be-reason">Motif (obligatoire)</label>
        <input id="be-reason" className="lg-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Conservé dans le journal (8 caractères minimum)" maxLength={250} />
      </div>
      <div className="lg-actions">
        <LegButton type="submit" icon="lock" disabled={!valid} loading={busy}>Enregistrer</LegButton>
        <LegButton variant="ghost" onClick={onCancel} disabled={busy}>Annuler</LegButton>
      </div>
    </form>
  )
}
