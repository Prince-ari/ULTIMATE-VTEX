"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { api, clearToken } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type CurrentUser = Outputs["users"]["getMe"]
export type MyBusiness = Outputs["businesses"]["mine"][number]

type ContextValue = {
  user: CurrentUser
  business: MyBusiness
  businessId: number
  refresh: () => Promise<void>
}

const BusinessCtx = React.createContext<ContextValue | null>(null)

export function useBusinessContext(): ContextValue {
  const ctx = React.useContext(BusinessCtx)
  if (!ctx) throw new Error("useBusinessContext doit être utilisé sous BusinessAuthGuard.")
  return ctx
}

function isInvalidSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const candidate = error as { data?: { httpStatus?: number; code?: string }; message?: string }
  return candidate.data?.httpStatus === 401 || candidate.data?.code === "UNAUTHORIZED" || candidate.message === "UNAUTHORIZED"
}

type Status = "checking" | "ok" | "no-business" | "error"

export function BusinessAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = React.useState<Status>("checking")
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [business, setBusiness] = React.useState<MyBusiness | null>(null)

  const load = React.useCallback(async () => {
    setStatus("checking")
    try {
      // Mot de passe temporaire : le serveur refuse tout le reste tant qu'il n'est pas remplacé, on y conduit donc l'utilisateur.
      const me = await api.users.getMe.query()
      if (me.mustChangePassword) {
        router.replace("/change-password")
        return
      }
      const businesses = await api.businesses.mine.query()
      setUser(me)
      if (businesses.length === 0) {
        setStatus("no-business")
        return
      }
      setBusiness(businesses[0])
      setStatus("ok")
    } catch (error) {
      if (isInvalidSessionError(error)) {
        clearToken()
        router.replace("/login")
        return
      }
      setStatus("error")
    }
  }, [router])

  React.useEffect(() => { void load() }, [load])

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--c-bg)]">
        <div className="rounded-[24px] border border-white/5 bg-[var(--c-s1)] px-8 py-6 text-center">
          <p className="legday-kicker mb-1">Vérification de session</p>
          <p className="text-[13px] text-[var(--c-t2)]">Préparation de votre espace Business…</p>
        </div>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--c-bg)]">
        <div className="max-w-sm rounded-[24px] border border-white/5 bg-[var(--c-s1)] px-8 py-6 text-center">
          <p className="legday-kicker mb-1">Service indisponible</p>
          <p className="text-[13px] text-[var(--c-t2)]">Impossible de joindre le service Wallet Pro pour le moment.</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-full bg-[var(--c-signature)] px-4 py-2 text-[12px] font-bold text-[#0a0d1e]">Réessayer</button>
        </div>
      </div>
    )
  }

  if (status === "no-business") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--c-bg)] px-4">
        <div className="max-w-sm rounded-[24px] border border-white/5 bg-[var(--c-s1)] px-8 py-6 text-center">
          <p className="legday-kicker mb-1">Aucune entreprise</p>
          <p className="text-[13px] text-[var(--c-t2)]">Ce compte n’est rattaché à aucune entreprise Wallet Pro. Contactez votre administrateur pour être invité, ou ouvrez un compte Business depuis le Dashboard.</p>
          <button type="button" onClick={() => { clearToken(); router.replace("/login") }} className="mt-4 rounded-full border border-white/10 bg-white/[.06] px-4 py-2 text-[12px] font-bold text-[var(--c-t1)]">Changer de compte</button>
        </div>
      </div>
    )
  }

  return <BusinessCtx.Provider value={{ user: user!, business: business!, businessId: business!.id, refresh: load }}>{children}</BusinessCtx.Provider>
}
