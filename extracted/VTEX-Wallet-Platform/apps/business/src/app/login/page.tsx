"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/Button"
import { api } from "@/lib/trpc"
import { canRevealDevelopmentOtp } from "@/lib/otp-preview"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [step, setStep] = React.useState<"credentials" | "otp">("credentials")
  const [userId, setUserId] = React.useState<number | null>(null)
  const [code, setCode] = React.useState("")
  const [devCode, setDevCode] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const showDevelopmentOtp = canRevealDevelopmentOtp()

  async function submitCredentials() {
    setError(null)
    setLoading(true)
    try {
      const result = await api.auth.login.mutate({ email, password })
      setUserId(result.userId)
      if (showDevelopmentOtp) {
        const otp = await api.auth.devPeekOtp.query({ userId: result.userId })
        setDevCode(otp.code)
      } else {
        setDevCode(null)
      }
      setStep("otp")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identifiants invalides.")
    } finally {
      setLoading(false)
    }
  }

  async function submitOtp() {
    if (!userId) return
    setError(null)
    setLoading(true)
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, code }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Code incorrect.")
      router.push("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--c-bg)] px-4">
      <div className="w-full max-w-[400px] rounded-[32px] border border-white/5 bg-[var(--c-s1)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--c-signature)] text-[13px] font-extrabold text-[#0a0d1e]">V</span>
          <div>
            <p className="text-[13px] font-extrabold tracking-[-0.01em] text-[var(--c-t1)]">VTEX Business</p>
            <p className="text-[11px] text-[var(--c-t3)]">{step === "credentials" ? "Connectez-vous à votre compte" : "Code de vérification"}</p>
          </div>
        </div>

        {step === "credentials" ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--c-t3)]">Email</label>
              <input id="email" type="email" autoComplete="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3 py-[10px] text-[13px] text-[var(--c-t1)] outline-none placeholder:text-[var(--c-t3)] focus:border-[var(--c-signature)]" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--c-t3)]">Mot de passe</label>
              <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCredentials()}
                className="w-full rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3 py-[10px] text-[13px] text-[var(--c-t1)] outline-none placeholder:text-[var(--c-t3)] focus:border-[var(--c-signature)]" />
            </div>
            {error && <p id="login-error" className="text-[12px] text-[var(--c-danger)]" role="alert">{error}</p>}
            <Button className="w-full" disabled={loading} onClick={submitCredentials}>{loading ? "Connexion..." : "Connexion"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="code" className="mb-1 block text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--c-t3)]">Code à 6 chiffres</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                className="w-full rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3 py-[10px] text-[13px] text-[var(--c-t1)] outline-none tracking-[.2em] focus:border-[var(--c-signature)]" />
            </div>
            {showDevelopmentOtp && devCode && (
              <p className="text-[11px] text-[var(--c-t3)]">Développement — aucun SMS envoyé, code : <span className="legday-mono">{devCode}</span></p>
            )}
            {error && <p id="login-error" className="text-[12px] text-[var(--c-danger)]" role="alert">{error}</p>}
            <Button className="w-full" disabled={loading} onClick={submitOtp}>{loading ? "Vérification..." : "Vérifier"}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
