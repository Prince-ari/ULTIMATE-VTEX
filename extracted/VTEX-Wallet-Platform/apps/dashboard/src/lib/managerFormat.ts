/** Libellés et aides d'affichage des gestionnaires et des suggestions (Dashboard). Le serveur décide ; ici on ne fait que présenter. */

export type ManagerRole = "agent" | "account_manager"
export type Tone = "ok" | "warn" | "danger" | "neutral"

export const MANAGER_ROLE_LABEL: Record<ManagerRole, string> = { agent: "Support", account_manager: "Gestionnaire de compte" }
export const MANAGER_ROLE_HINT: Record<ManagerRole, string> = {
  agent: "Lit les fiches et écrit à n'importe quel wallet ; ne modifie rien.",
  account_manager: "Ne voit que les wallets qui lui sont attribués, en lecture seule, et leur écrit des suggestions.",
}

export const MANAGER_STATUS_LABEL = { active: "Actif", suspended: "Suspendu" } as const
export const MANAGER_STATUS_TONE: Record<"active" | "suspended", Tone> = { active: "ok", suspended: "danger" }

export const WALLET_TYPE_LABEL = { PERSONAL: "Personnel", PROFESSIONAL: "Pro" } as const

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?").slice(0, 2)
}

export function walletCountLabel(count: number): string {
  return count === 0 ? "Aucun wallet" : `${count} wallet${count > 1 ? "s" : ""}`
}

/** « il y a 3 min », « il y a 2 h », « il y a 5 j » — au-delà de 30 jours, la date ; « Jamais connecté » sans activité. */
export function activityLabel(value: Date | string | null, now = Date.now()): string {
  if (!value) return "Jamais connecté"
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "à l'instant"
  if (seconds < 3_600) return `il y a ${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `il y a ${Math.floor(seconds / 3_600)} h`
  if (seconds < 30 * 86_400) return `il y a ${Math.floor(seconds / 86_400)} j`
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

/** État d'une suggestion côté expéditeur : lue par le destinataire ou non. */
export const SUGGESTION_STATE_LABEL = { read: "Lue", unread: "Non lue" } as const
export const SUGGESTION_STATE_TONE: Record<"read" | "unread", Tone> = { read: "ok", unread: "warn" }
