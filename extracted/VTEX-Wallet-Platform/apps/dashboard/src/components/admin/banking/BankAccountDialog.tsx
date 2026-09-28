"use client"

import * as React from "react"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { HolderPicker, type HolderSelection } from "@/components/admin/banking/HolderPicker"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegModal } from "@/components/ui/legkit"
import { maskIbanInput } from "@/lib/bankFormat"
import { api } from "@/lib/trpc"

type CreateInput = inferRouterInputs<AppRouter>["admin"]["banking"]["create"]
export type CreatedBankAccount = inferRouterOutputs<AppRouter>["admin"]["banking"]["create"]
type CurrencyOption = inferRouterOutputs<AppRouter>["config"]["currencies"][number]

const EMPTY = { label: "", bankName: "", accountHolderName: "", iban: "", bic: "", reason: "" }

/**
 * Nouveau RIB : principal (rattaché à un compte) ou sous-RIB (IBAN virtuel, attribué ou laissé au stock).
 * L'IBAN est généré (valide, unique) ou saisi ; tout est vérifié et écrit par le serveur en une transaction, puis journalisé.
 */
export function BankAccountDialog({ open, onOpenChange, initialHolder, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; initialHolder?: HolderSelection | null; onCreated: (created: CreatedBankAccount) => void | Promise<void> }) {
  const [kind, setKind] = React.useState<"MAIN" | "SUB">("SUB")
  const [assignNow, setAssignNow] = React.useState(true)
  const [selection, setSelection] = React.useState<HolderSelection | null>(initialHolder ?? null)
  const [currency, setCurrency] = React.useState("EUR")
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([])
  const [ibanMode, setIbanMode] = React.useState<"generate" | "manual">("generate")
  const [form, setForm] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => { if (open) setSelection(initialHolder ?? null) }, [open, initialHolder])
  React.useEffect(() => {
    if (!open || currencies.length > 0) return
    api.config.currencies.query().then(setCurrencies).catch(() => setCurrencies([]))
  }, [open, currencies.length])

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [key]: event.target.value }))
  const assigned = kind === "MAIN" || assignNow
  const ledgerOk = !assigned || (selection !== null && selection.accountId !== null)
  const valid = form.label.trim().length >= 2 && ledgerOk && (ibanMode === "generate" || form.iban.replace(/\s/g, "").length >= 15)

  function reset() {
    setKind("SUB"); setAssignNow(true); setSelection(initialHolder ?? null); setCurrency("EUR"); setIbanMode("generate"); setForm(EMPTY); setError(null); setBusy(false)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const payload: CreateInput = {
      kind,
      label: form.label.trim(),
      generate: ibanMode === "generate",
      ...(ibanMode === "manual" ? { iban: form.iban.replace(/\s/g, "") } : {}),
      ...(form.bankName.trim() ? { bankName: form.bankName.trim() } : {}),
      ...(form.accountHolderName.trim() ? { accountHolderName: form.accountHolderName.trim() } : {}),
      ...(form.bic.trim() ? { bic: form.bic.trim() } : {}),
      ...(form.reason.trim().length >= 8 ? { reason: form.reason.trim() } : {}),
      ...(assigned && selection?.accountId ? { walletType: selection.holder.walletType, holderId: selection.holder.holderId, ledgerAccountId: selection.accountId } : { currency: currency as CreateInput["currency"] }),
    }
    try {
      const created = await api.admin.banking.create.mutate(payload)
      reset()
      onOpenChange(false)
      await onCreated(created)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.")
      setBusy(false)
    }
  }

  const kinds = [
    { value: "SUB" as const, label: "Sous-RIB", hint: "Un IBAN virtuel rattaché à un compte." },
    { value: "MAIN" as const, label: "RIB principal", hint: "Le RIB du compte : un seul actif par compte." },
  ]

  return (
    <LegModal
      open={open}
      onOpenChange={(value) => { onOpenChange(value); if (!value) reset() }}
      wide
      icon="bank"
      tone="navy"
      title="Nouveau RIB"
      description="Chaque création est journalisée. L'IBAN est chiffré au repos et n'apparaîtra masqué que dans les listes."
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</LegButton>
        <LegButton disabled={!valid} loading={busy} icon="plus" onClick={() => void submit()}>Créer le {kind === "MAIN" ? "RIB principal" : "sous-RIB"}</LegButton>
      </>}
    >
      <fieldset className="lg-fieldset">
        <legend className="lg-label">Type</legend>
        <div className="lg-choices" role="radiogroup" aria-label="Type de RIB">
          {kinds.map((choice) => (
            <button key={choice.value} type="button" role="radio" aria-checked={kind === choice.value} data-tone={choice.value === "MAIN" ? "violet" : "teal"} className="lg-choice" onClick={() => setKind(choice.value)}>
              <span className={`lg-socle lg-socle--md ${choice.value === "MAIN" ? "lg-socle--navy" : "lg-socle--teal"}`}><LegIcon name={choice.value === "MAIN" ? "bank" : "hash"} /></span>
              <span><strong>{choice.label}</strong><small>{choice.hint}</small></span>
            </button>
          ))}
        </div>
      </fieldset>

      {kind === "SUB" ? (
        <fieldset className="lg-fieldset">
          <legend className="lg-label">Attribution</legend>
          <div className="lg-seg" role="radiogroup" aria-label="Attribution du sous-RIB">
            <button type="button" role="radio" aria-checked={assignNow} aria-pressed={assignNow} onClick={() => setAssignNow(true)}><LegIcon name="user" />Attribuer maintenant</button>
            <button type="button" role="radio" aria-checked={!assignNow} aria-pressed={!assignNow} onClick={() => setAssignNow(false)}><LegIcon name="hash" />Laisser au stock</button>
          </div>
        </fieldset>
      ) : null}

      {assigned ? (
        <section>
          <p className="lg-label">Titulaire et compte</p>
          <HolderPicker value={selection} onChange={setSelection} idPrefix="bd" />
        </section>
      ) : (
        <div>
          <label className="lg-label" htmlFor="bd-currency">Devise du sous-RIB</label>
          <select id="bd-currency" className="lg-input" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {(currencies.length ? currencies : [{ code: "EUR", name: "Euro", symbol: "€" }]).map((option) => <option key={option.code} value={option.code}>{option.symbol} {option.name} ({option.code})</option>)}
          </select>
        </div>
      )}

      <div className="lg-form-grid">
        <div><label className="lg-label" htmlFor="bd-label">Libellé</label><input id="bd-label" className="lg-input" value={form.label} onChange={set("label")} placeholder={kind === "MAIN" ? "RIB principal" : "Ex. Marketing, Loyer…"} autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="bd-bank">Banque</label><input id="bd-bank" className="lg-input" value={form.bankName} onChange={set("bankName")} placeholder="VTEX" autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="bd-holder">Titulaire du compte</label><input id="bd-holder" className="lg-input" value={form.accountHolderName} onChange={set("accountHolderName")} placeholder="Par défaut : le titulaire" autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="bd-bic">BIC</label><input id="bd-bic" className="lg-input lg-input--mono" value={form.bic} onChange={set("bic")} placeholder={kind === "MAIN" ? "VTEXFRPPXXX" : "Facultatif"} maxLength={11} autoComplete="off" /></div>
      </div>

      <fieldset className="lg-fieldset">
        <legend className="lg-label">IBAN</legend>
        <div className="lg-seg" role="radiogroup" aria-label="Origine de l'IBAN">
          <button type="button" role="radio" aria-checked={ibanMode === "generate"} aria-pressed={ibanMode === "generate"} onClick={() => setIbanMode("generate")}><LegIcon name="refresh" />Générer</button>
          <button type="button" role="radio" aria-checked={ibanMode === "manual"} aria-pressed={ibanMode === "manual"} onClick={() => setIbanMode("manual")}><LegIcon name="pencil" />Saisir</button>
        </div>
        {ibanMode === "manual" ? <input id="bd-iban" className="lg-input lg-input--mono" value={form.iban} onChange={(event) => setForm((previous) => ({ ...previous, iban: maskIbanInput(event.target.value) }))} placeholder="FR76 0000 0000 0000 0000 0000 000" autoComplete="off" aria-label="IBAN" /> : <p className="lg-hint">Un IBAN valide (clé de contrôle correcte) et unique est généré{kind === "MAIN" ? " à partir du compte" : ""}.</p>}
      </fieldset>

      <div>
        <label className="lg-label" htmlFor="bd-reason">Motif (facultatif)</label>
        <input id="bd-reason" className="lg-input" value={form.reason} onChange={set("reason")} placeholder="Conservé dans le journal (8 caractères minimum s'il est renseigné)" maxLength={250} autoComplete="off" />
      </div>

      {kind === "MAIN" ? <p className="lg-notice"><LegIcon name="alert" /><span>Le RIB principal est aussi appliqué aux coordonnées du compte : le Wallet du titulaire le voit immédiatement.</span></p> : null}
      {error ? <p role="alert" className="lg-error">{error}</p> : null}
    </LegModal>
  )
}
