"use client"

import * as React from "react"

import { useSession } from "@/lib/session"

import { useToast } from "./Toast"

/**
 * Pop-up temps réel pour le personnel : un ticket ouvert, un justificatif remis ou un virement externe en attente
 * doivent atteindre l'administrateur où qu'il se trouve dans le Dashboard, pas seulement sur la page qui les liste.
 * Réutilise le flux SSE existant (`/api/events`) — aucune nouvelle infrastructure de notification.
 */
export function StaffLiveAlerts() {
  const session = useSession()
  const { show } = useToast()

  React.useEffect(() => {
    if (!session || session.role === "user") return
    const stream = new EventSource("/api/events")
    const onNotification = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { targetUserId: number | null; payload?: { title?: string } }
        if (parsed.targetUserId === session.id && parsed.payload?.title) show(parsed.payload.title)
      } catch {
        // Événement malformé : ignoré, jamais bloquant pour le reste de l'interface.
      }
    }
    stream.addEventListener("notification.created", onNotification)
    return () => stream.close()
  }, [session, show])

  return null
}
