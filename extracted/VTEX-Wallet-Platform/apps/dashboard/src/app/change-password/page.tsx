"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { api, clearToken } from "@/lib/trpc"

/**
 * Remplacement du mot de passe temporaire. Tant qu'il n'est pas remplacé, le serveur refuse toute autre action (PASSWORD_CHANGE_REQUIRED) :
 * cette page n'est donc pas un simple confort, c'est le seul chemin ouvert.
 */
export default function ChangePasswordPage() {
  const router = useRouter()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [email, setEmail] = React.useState<string | null>(null)

  React.useEffect(() => {
    api.users.getMe.query().then((me) => setEmail(me.email)).catch(() => router.replace("/login"))
  }, [router])

  const mismatch = confirm !== "" && confirm !== next
  const valid = current !== "" && next.length >= 10 && /[A-Za-z]/.test(next) && /\d/.test(next) && next === confirm

  async function submit() {
    setError(null)
    setLoading(true)
    try {
      await api.auth.changePassword.mutate({ currentPassword: current, newPassword: next })
      router.replace("/")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Changement impossible.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard-login-shell">
      <div className="dashboard-login-frame">
        <aside className="dashboard-login-aside" aria-hidden="true">
          <p className="dashboard-kicker">VTEX · Dashboard</p>
          <h1>Choisissez<br />votre mot de passe.</h1>
          <p>Le mot de passe temporaire qui vous a été transmis ne sert qu’une fois : remplacez-le pour accéder à votre espace.</p>
          <span><i />Environnement sécurisé</span>
        </aside>
        <div className="dashboard-login-card" aria-busy={loading}>
          <div>
            <div className="vtex-dashboard-brand-lockup">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/vtex-logo.png" alt="VTEX Core" className="vtex-dashboard-wordmark" />
            </div>
            <p className="dashboard-login-step">Nouveau mot de passe{email ? ` — ${email}` : ""}</p>
          </div>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (valid && !loading) void submit() }}>
            <div>
              <Label htmlFor="current-password">Mot de passe temporaire</Label>
              <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} aria-describedby="password-rules" />
              <p id="password-rules" className="mt-1 text-xs text-gray-500">10 caractères minimum, avec au moins une lettre et un chiffre.</p>
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} hasError={mismatch} />
              {mismatch ? <p className="mt-1 text-xs text-red-600" role="alert">Les deux mots de passe ne correspondent pas.</p> : null}
            </div>
            {error ? <p id="change-error" className="text-xs text-red-600" role="alert">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={!valid || loading} aria-describedby={error ? "change-error" : undefined}>
              {loading ? "Enregistrement…" : "Enregistrer et continuer"}
            </Button>
            <button type="button" className="w-full text-center text-xs text-gray-500 hover:underline" onClick={() => { clearToken(); router.replace("/login") }}>Se déconnecter</button>
          </form>
        </div>
      </div>
    </div>
  )
}
