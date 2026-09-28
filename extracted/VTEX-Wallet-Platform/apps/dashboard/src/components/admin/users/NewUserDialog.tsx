"use client"

import * as React from "react"

import { LegSocle, LegButton, LegModal } from "@/components/ui/legkit"
import { LegIcon } from "@/components/ui/LegIcon"
import { api } from "@/lib/trpc"
import { cx } from "@/lib/utils"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

export type CreateUserPayload = inferRouterInputs<AppRouter>["admin"]["users"]["create"]
export type CreatedUser = inferRouterOutputs<AppRouter>["admin"]["users"]["create"]
type CurrencyOption = inferRouterOutputs<AppRouter>["config"]["currencies"][number]

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", legalName: "", brandName: "", industry: "", siren: "", vatId: "", address: "", initialPassword: "" }

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div><label className="lg-label" htmlFor={id}>{label}</label>{children}</div>
}

/**
 * « Nouvel utilisateur » : identité, e-mail, type de wallet, devise initiale, statut et mot de passe initial.
 * Tout est créé par le serveur en UNE transaction (utilisateur, wallet, et société pour un wallet professionnel).
 */
export function NewUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (result: CreatedUser, email: string) => void | Promise<void> }) {
  const [form, setForm] = React.useState(EMPTY)
  const [walletType, setWalletType] = React.useState<"PERSONAL" | "PROFESSIONAL">("PERSONAL")
  const [currency, setCurrency] = React.useState("EUR")
  const [status, setStatus] = React.useState<"active" | "suspended">("active")
  const [passwordMode, setPasswordMode] = React.useState<"generate" | "manual">("generate")
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || currencies.length > 0) return
    api.config.currencies.query().then(setCurrencies).catch(() => setCurrencies([]))
  }, [open, currencies.length])

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [key]: event.target.value }))
  const professional = walletType === "PROFESSIONAL"
  const valid =
    form.firstName.trim() !== "" && form.lastName.trim() !== "" && form.email.includes("@") &&
    (!professional || (form.legalName.trim().length >= 2 && form.brandName.trim().length >= 2)) &&
    (passwordMode === "generate" || form.initialPassword.length >= 10)

  function reset() {
    setForm(EMPTY); setWalletType("PERSONAL"); setCurrency("EUR"); setStatus("active"); setPasswordMode("generate"); setError(null); setBusy(false)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const identity = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || undefined }
    const payload = {
      ...identity,
      walletType,
      currency: currency as CreateUserPayload["currency"],
      status,
      passwordMode,
      ...(passwordMode === "manual" ? { initialPassword: form.initialPassword } : {}),
      ...(professional ? { company: { legalName: form.legalName.trim(), brandName: form.brandName.trim(), industry: form.industry.trim() || undefined, siren: form.siren.trim() || undefined, vatId: form.vatId.trim() || undefined, address: form.address.trim() || undefined } } : {}),
    } satisfies CreateUserPayload
    try {
      const result = await api.admin.users.create.mutate(payload)
      reset()
      onOpenChange(false)
      await onCreated(result, identity.email)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.")
      setBusy(false)
    }
  }

  const choices = [
    { value: "PERSONAL", label: "Personnel", hint: "Un particulier et son compte.", tone: "violet" as const, icon: "user" as const },
    { value: "PROFESSIONAL", label: "Professionnel", hint: "Une société, son wallet Pro et son propriétaire.", tone: "teal" as const, icon: "building" as const },
  ]

  return (
    <LegModal
      open={open}
      onOpenChange={(value) => { onOpenChange(value); if (!value) reset() }}
      wide
      icon="plus"
      tone="navy"
      title="Nouvel utilisateur"
      description="Le wallet est créé en même temps que le compte, avec la devise choisie. Rien n’est enregistré si une étape échoue."
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</LegButton>
        <LegButton disabled={!valid} loading={busy} onClick={() => void submit()}>Créer le compte et le wallet</LegButton>
      </>}
    >
      <fieldset className="lg-fieldset">
        <legend className="lg-label">Type de wallet</legend>
        <div className="lg-choices" role="radiogroup" aria-label="Type de wallet">
          {choices.map((choice) => (
            <button key={choice.value} type="button" role="radio" aria-checked={walletType === choice.value} data-tone={choice.tone} className="lg-choice" onClick={() => setWalletType(choice.value as typeof walletType)}>
              <LegSocle icon={choice.icon} tone={choice.tone} size="md" />
              <span><strong>{choice.label}</strong><small>{choice.hint}</small></span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="lg-form-grid">
        <Field id="nu-firstName" label="Prénom"><input id="nu-firstName" className="lg-input" value={form.firstName} onChange={set("firstName")} autoComplete="off" /></Field>
        <Field id="nu-lastName" label="Nom"><input id="nu-lastName" className="lg-input" value={form.lastName} onChange={set("lastName")} autoComplete="off" /></Field>
        <Field id="nu-email" label="Adresse e-mail"><input id="nu-email" className="lg-input" type="email" value={form.email} onChange={set("email")} autoComplete="off" /></Field>
        <Field id="nu-phone" label="Téléphone"><input id="nu-phone" className="lg-input" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="off" /></Field>
        <Field id="nu-currency" label="Devise initiale">
          <select id="nu-currency" className="lg-input" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {(currencies.length ? currencies : [{ code: "EUR", name: "Euro", symbol: "€" }]).map((option) => <option key={option.code} value={option.code}>{option.symbol} {option.name} ({option.code})</option>)}
          </select>
        </Field>
        <Field id="nu-status" label="Statut initial">
          <select id="nu-status" className="lg-input" value={status} onChange={(event) => setStatus(event.target.value as "active" | "suspended")}>
            <option value="active">Actif</option>
            <option value="suspended">Suspendu (à activer plus tard)</option>
          </select>
        </Field>
      </div>

      {professional ? (
        <fieldset className="lg-fieldset lg-panel">
          <legend className="lg-label">Société</legend>
          <div className="lg-form-grid">
            <Field id="nu-legalName" label="Raison sociale"><input id="nu-legalName" className="lg-input" value={form.legalName} onChange={set("legalName")} /></Field>
            <Field id="nu-brandName" label="Nom commercial"><input id="nu-brandName" className="lg-input" value={form.brandName} onChange={set("brandName")} /></Field>
            <Field id="nu-industry" label="Secteur"><input id="nu-industry" className="lg-input" value={form.industry} onChange={set("industry")} /></Field>
            <Field id="nu-siren" label="SIREN"><input id="nu-siren" className="lg-input lg-input--mono" inputMode="numeric" value={form.siren} onChange={set("siren")} /></Field>
            <Field id="nu-vatId" label="N° de TVA"><input id="nu-vatId" className="lg-input lg-input--mono" value={form.vatId} onChange={set("vatId")} /></Field>
            <Field id="nu-address" label="Adresse"><input id="nu-address" className="lg-input" value={form.address} onChange={set("address")} /></Field>
          </div>
          <p className="lg-hint">La personne créée devient propriétaire de la société ; le compte principal est ouvert dans la devise choisie.</p>
        </fieldset>
      ) : null}

      <fieldset className="lg-fieldset">
        <legend className="lg-label">Mot de passe initial</legend>
        <div className="lg-seg" role="radiogroup" aria-label="Mode du mot de passe initial">
          <button type="button" role="radio" aria-checked={passwordMode === "generate"} aria-pressed={passwordMode === "generate"} onClick={() => setPasswordMode("generate")}><LegIcon name="key" />Générer</button>
          <button type="button" role="radio" aria-checked={passwordMode === "manual"} aria-pressed={passwordMode === "manual"} onClick={() => setPasswordMode("manual")}><LegIcon name="pencil" />Saisir</button>
        </div>
        <p className="lg-hint">{passwordMode === "generate" ? "Un mot de passe temporaire aléatoire est généré et affiché une seule fois." : "10 caractères minimum, une lettre et un chiffre."}</p>
        {passwordMode === "manual" ? <Field id="nu-initialPassword" label="Mot de passe temporaire"><input id="nu-initialPassword" className={cx("lg-input lg-input--mono")} type="password" autoComplete="new-password" value={form.initialPassword} onChange={set("initialPassword")} /></Field> : null}
        <p className="lg-hint">Dans les deux cas, la personne doit le remplacer à sa première connexion (validité : 72 h). Il n’est jamais stocké en clair.</p>
      </fieldset>

      {error ? <p role="alert" className="lg-error">{error}</p> : null}
    </LegModal>
  )
}
