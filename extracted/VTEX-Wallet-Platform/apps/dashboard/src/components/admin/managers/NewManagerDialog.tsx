"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { LegButton, LegModal, LegSocle } from "@/components/ui/legkit"
import { MANAGER_ROLE_HINT, MANAGER_ROLE_LABEL, type ManagerRole } from "@/lib/managerFormat"
import { api } from "@/lib/trpc"

export type CreatedManager = inferRouterOutputs<AppRouter>["admin"]["managers"]["create"]

const EMPTY = { firstName: "", lastName: "", email: "", phone: "" }

/**
 * « Nouveau gestionnaire » : identité, e-mail professionnel et rôle. Le compte est créé avec un mot de passe temporaire aléatoire (montré une seule fois,
 * haché en base, à remplacer à la première connexion). Le gestionnaire n'a AUCUN wallet tant qu'on ne lui en attribue pas.
 */
export function NewManagerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (result: CreatedManager, email: string) => void | Promise<void> }) {
  const [form, setForm] = React.useState(EMPTY)
  const [role, setRole] = React.useState<ManagerRole>("account_manager")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [key]: event.target.value }))
  const valid = form.firstName.trim() !== "" && form.lastName.trim() !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())

  function reset() { setForm(EMPTY); setRole("account_manager"); setError(null); setBusy(false) }

  async function submit() {
    setBusy(true)
    setError(null)
    const email = form.email.trim().toLowerCase()
    try {
      const result = await api.admin.managers.create.mutate({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email, phone: form.phone.trim() || undefined, role })
      reset()
      onOpenChange(false)
      await onCreated(result, email)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.")
      setBusy(false)
    }
  }

  return (
    <LegModal
      open={open}
      onOpenChange={(value) => { onOpenChange(value); if (!value) reset() }}
      wide
      icon="plus"
      tone="navy"
      title="Nouveau gestionnaire"
      description="Un compte d'équipe sans aucun wallet : vous lui attribuez ensuite les wallets qu'il suit. Rien n'est enregistré si l'étape échoue."
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</LegButton>
        <LegButton disabled={!valid} loading={busy} onClick={() => void submit()}>Créer le compte</LegButton>
      </>}
    >
      <fieldset className="lg-fieldset">
        <legend className="lg-label">Rôle</legend>
        <div className="lg-choices" role="radiogroup" aria-label="Rôle du gestionnaire">
          {(["account_manager", "agent"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={role === value} className="lg-choice" data-tone={value === "agent" ? "teal" : "violet"} onClick={() => setRole(value)}>
              <LegSocle icon={value === "agent" ? "shield" : "user"} tone={value === "agent" ? "teal" : "violet"} size="md" />
              <span><strong>{MANAGER_ROLE_LABEL[value]}</strong><small>{MANAGER_ROLE_HINT[value]}</small></span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="lg-form-grid">
        <div><label className="lg-label" htmlFor="nm-firstName">Prénom</label><input id="nm-firstName" className="lg-input" value={form.firstName} onChange={set("firstName")} autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="nm-lastName">Nom</label><input id="nm-lastName" className="lg-input" value={form.lastName} onChange={set("lastName")} autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="nm-email">E-mail professionnel</label><input id="nm-email" className="lg-input" type="email" value={form.email} onChange={set("email")} autoComplete="off" /></div>
        <div><label className="lg-label" htmlFor="nm-phone">Téléphone (optionnel)</label><input id="nm-phone" className="lg-input" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="off" /></div>
      </div>
      <p className="lg-hint">Un mot de passe temporaire est généré et affiché une seule fois (validité 72 h) ; la personne doit le remplacer à sa première connexion.</p>
      {error ? <p role="alert" className="lg-error">{error}</p> : null}
    </LegModal>
  )
}
