"use client"

import * as React from "react"

import type { PlatformRole } from "@/lib/roles"

/**
 * Identité de la session en cours, fournie par le garde de session (AuthGuard) à toute l'interface : la navigation s'adapte au rôle.
 * C'est de l'AFFICHAGE : chaque appel serveur revérifie de toute façon le rôle et le périmètre (RBAC côté serveur).
 */
export interface SessionUser { id: number; role: PlatformRole; firstName: string; lastName: string }

const SessionContext = React.createContext<SessionUser | null>(null)

export function SessionProvider({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
}

/** `null` tant que la session n'est pas vérifiée, ou en aperçu local (session simulée). */
export function useSession(): SessionUser | null {
  return React.useContext(SessionContext)
}
