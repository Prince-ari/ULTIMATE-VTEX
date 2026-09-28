"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/Button"
import { api, clearToken } from "@/lib/trpc"

const FIELD = "w-full rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3 py-[10px] text-[13px] text-[var(--c-t1)] outline-none placeholder:text-[var(--c-t3)] focus:border-[var(--c-signature)]"
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--c-t3)]"

/**
 * Remplacement du mot de passe temporaire. Tant qu'il n'est pas remplacé, le serveur refuse toute autre action (PASSWORD_CHANGE_REQUIRED) :
 * cette page est le seul chemin ouvert au titulaire d'un compte créé par un administrateur.
 */
export default function ChangePasswordPage() {
  const router = useRouter()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    api.users.getMe.query().catch(() => router.replace("/login"))
  }, [router])

  const mismatch = confirm !== "" && confirm !== next
  const valid = current !== "" && next.length >= 10 && /[A-Za-z]/.test(next) && /\d/.test(next) && next === confirm

  async function submit() {
    setError(null)
    setLoading(true)
    try {
      await api.auth.changePassword.mutate({ currentPassword: current, newPassword: next })
      router.replace("/")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Changement impossible.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--c-bg)] px-4">
      <form
        className="w-full max-w-[400px] rounded-[32px] border border-white/5 bg-[var(--c-s1)] p-8 shadow-[var(--shadow-card)]"
        onSubmit={(event) => { event.preventDefault(); if (valid && !loading) void submit() }}
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--c-signature)] text-[13px] font-extrabold text-[#0a0d1e]">V</span>
          <div>
            <p className="text-[13px] font-extrabold tracking-[-0.01em] text-[var(--c-t1)]">VTEX Business</p>
            <p className="text-[11px] text-[var(--c-t3)]">Choisissez votre mot de passe</p>
          </div>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-[var(--c-t2)]">Le mot de passe temporaire qui vous a été transmis ne sert qu’une fois : remplacez-le pour accéder à votre espace.</p>
        <div className="space-y-4">
          <div>
            <label htmlFor="current-password" className={LABEL}>Mot de passe temporaire</label>
            <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="new-password" className={LABEL}>Nouveau mot de passe</label>
            <input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="password-rules" className={FIELD} />
            <p id="password-rules" className="mt-1 text-[11px] text-[var(--c-t3)]">10 caractères minimum, avec au moins une lettre et un chiffre.</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className={LABEL}>Confirmer</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={FIELD} aria-invalid={mismatch} />
            {mismatch ? <p className="mt-1 text-[12px] text-[var(--c-danger)]" role="alert">Les deux mots de passe ne correspondent pas.</p> : null}
          </div>
          {error ? <p id="change-error" className="text-[12px] text-[var(--c-danger)]" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={!valid || loading}>{loading ? "Enregistrement…" : "Enregistrer et continuer"}</Button>
          <button type="button" className="w-full text-center text-[11px] text-[var(--c-t3)] underline" onClick={() => { clearToken(); router.replace("/login") }}>Se déconnecter</button>
        </div>
      </form>
    </div>
  )
}
