"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
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
        // Aide de recette uniquement : le routeur refuse cette procédure en production.
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard-login-shell">
      <div className="dashboard-login-frame">
        <aside className="dashboard-login-aside" aria-hidden="true">
          <p className="dashboard-kicker">VTEX · Dashboard</p>
          <h1>Décider avec<br />une vue nette.</h1>
          <p>Une surface d’administration pensée pour les opérations Wallet, l’identité et la relation client.</p>
          <span><i />Environnement sécurisé</span>
        </aside>
        <div className="dashboard-login-card" aria-busy={loading}>
          <div>
          <div className="vtex-dashboard-brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/vtex-logo.png" alt="VTEX Core" className="vtex-dashboard-wordmark" />
          </div>
          <p className="dashboard-login-step">
            {step === "credentials" ? "Connectez-vous à votre compte" : "Code de vérification"}
          </p>
        </div>

        {step === "credentials" ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCredentials()}
              />
            </div>
            {error && <p id="login-error" className="text-xs text-red-600" role="alert">{error}</p>}
            <Button className="w-full" disabled={loading} aria-describedby={error ? "login-error" : undefined} onClick={submitCredentials}>
              {loading ? "Connexion..." : "Connexion"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Code à 6 chiffres</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                maxLength={6}
              />
            </div>
            {showDevelopmentOtp && devCode && (
              <p className="text-xs text-gray-400">
                Développement — aucun SMS envoyé, code : <span className="font-mono">{devCode}</span>
              </p>
            )}
            {error && <p id="login-error" className="text-xs text-red-600" role="alert">{error}</p>}
            <Button className="w-full" disabled={loading} aria-describedby={error ? "login-error" : undefined} onClick={submitOtp}>
              {loading ? "Vérification..." : "Vérifier"}
            </Button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
