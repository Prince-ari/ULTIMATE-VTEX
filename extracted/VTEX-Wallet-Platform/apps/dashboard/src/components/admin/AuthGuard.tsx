"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { api, clearToken } from "@/lib/trpc"
import { isDemoPreview } from "@/lib/demoPreview"
import { MANAGER_HOME, canUseDashboard, isManagerPath, type PlatformRole } from "@/lib/roles"
import { SessionProvider, type SessionUser } from "@/lib/session"

function isInvalidSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const candidate = error as { data?: { httpStatus?: number; code?: string }; message?: string }
  return candidate.data?.httpStatus === 401 || candidate.data?.code === "UNAUTHORIZED" || candidate.message === "UNAUTHORIZED"
}

function recoverableIssue(error: unknown) {
  const candidate = error as { message?: string }
  return /network|réseau|fetch|econn|connection/i.test(candidate?.message ?? "") ? "network" : "service"
}

type GuardStatus = "checking" | "ok" | "error" | "forbidden"

function GuardState({
  tone,
  eyebrow,
  title,
  children,
}: {
  tone: "loading" | "warning" | "error"
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="dashboard-session-shell" aria-busy={tone === "loading" ? "true" : undefined}>
      <div className="dashboard-session-brand" aria-hidden="true"><strong>VTEX</strong><span>Dashboard</span></div>
      <div className={`dashboard-session-state dashboard-session-state--${tone}`} role={tone === "loading" ? "status" : "alert"} aria-live="polite">
        <span className="dashboard-session-state__indicator" aria-hidden="true" />
        <p className="dashboard-session-state__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="dashboard-session-state__content">{children}</div>
      </div>
    </section>
  )
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = React.useState<SessionUser | null>(null)
  const [status, setStatus] = React.useState<GuardStatus>("checking")
  const [issue, setIssue] = React.useState<"network" | "service">("network")
  const [demoEnabled, setDemoEnabled] = React.useState(false)

  const verifySession = React.useCallback(async () => {
    setStatus("checking")
    const previewRequested = new URLSearchParams(window.location.search).get("demo") === "1"
    if (previewRequested) window.sessionStorage.setItem("vtex-demo-preview", "1")
    const demoPreview = isDemoPreview(
      window.location.hostname,
      process.env.NODE_ENV,
      previewRequested || window.sessionStorage.getItem("vtex-demo-preview") === "1",
    )
    if (demoPreview) {
      setDemoEnabled(true)
      setStatus("ok")
      return
    }

    setDemoEnabled(false)
    try {
      const me = await api.users.getMe.query()
      // Mot de passe temporaire : le serveur refuse tout le reste tant qu'il n'est pas remplacé, on y conduit donc l'utilisateur.
      if (me.mustChangePassword) {
        router.replace("/change-password")
        return
      }
      if (!canUseDashboard(me.role as PlatformRole)) {
        setStatus("forbidden")
        return
      }
      setSession({ id: me.id, role: me.role as PlatformRole, firstName: me.firstName, lastName: me.lastName })
      setStatus("ok")
    } catch (error) {
      if (isInvalidSessionError(error)) {
        clearToken()
        router.replace("/login")
        return
      }
      setIssue(recoverableIssue(error))
      setStatus("error")
    }
  }, [router])

  React.useEffect(() => {
    void verifySession()
  }, [verifySession])

  // Navigation côté client d'un gestionnaire vers une page qui ne lui est pas proposée : retour à son accueil.
  React.useEffect(() => {
    if (session?.role === "account_manager" && !isManagerPath(pathname)) router.replace(MANAGER_HOME)
  }, [pathname, session, router])

  if (status === "checking") {
    return <GuardState tone="loading" eyebrow="Vérification de session" title="Préparation de votre espace opérateur"><p>Nous vérifions vos droits avant d’afficher des données administratives.</p></GuardState>
  }

  if (status === "error") {
    const copy = issue === "network"
      ? "La session locale est conservée. Vérifiez votre réseau puis relancez la vérification."
      : "Le service de session ne répond pas pour le moment. Aucune donnée ou commande opérateur n’est affichée."
    return (
      <GuardState tone="error" eyebrow={issue === "network" ? "Connexion indisponible" : "Service indisponible"} title="Connexion au Dashboard indisponible">
        <p>{copy}</p>
        <div className="dashboard-session-state__actions"><button type="button" onClick={() => void verifySession()}>Réessayer</button></div>
      </GuardState>
    )
  }

  if (status === "forbidden") {
    return (
      <GuardState tone="warning" eyebrow="Accès restreint" title="Accès opérateur requis">
        <p>Votre session est valide, mais ce compte ne dispose pas des droits administrateur ou support nécessaires pour consulter cette surface.</p>
        <div className="dashboard-session-state__actions"><button type="button" onClick={() => { clearToken(); router.replace("/login") }}>Revenir à la connexion</button></div>
      </GuardState>
    )
  }

  // Un gestionnaire de compte n'a que son portefeuille et ses suggestions : sur toute autre page, rien n'est affiché le temps du retour à son accueil
  // (le serveur refuse de toute façon tout le reste).
  if (session?.role === "account_manager" && !isManagerPath(pathname)) {
    return <GuardState tone="loading" eyebrow="Redirection" title="Retour à votre portefeuille"><p>Cette page n’est pas disponible pour votre rôle.</p></GuardState>
  }

  return <SessionProvider user={session}>
    {demoEnabled ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100" role="status">Mode aperçu local : session simulée, données métier indisponibles et actions réelles désactivées.</div> : null}
    {children}
  </SessionProvider>
}
