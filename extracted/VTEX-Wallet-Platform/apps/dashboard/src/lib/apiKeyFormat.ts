/** Libellés, tons et durées des clés d'API (Dashboard). Aucune logique métier : le serveur décide, ici on ne fait que présenter. */

export type KeyState = "active" | "expired" | "revoked" | "legacy"
export type Tone = "ok" | "warn" | "danger" | "neutral"

export const KEY_STATE_LABEL: Record<KeyState, string> = { active: "Active", expired: "Expirée", revoked: "Révoquée", legacy: "À recréer" }
export const KEY_STATE_TONE: Record<KeyState, Tone> = { active: "ok", expired: "neutral", revoked: "danger", legacy: "warn" }
export const MODE_LABEL = { live: "Production", sandbox: "Test" } as const

export const SCOPE_LABEL: Record<string, string> = {
  "wallet:read": "Lire les comptes et soldes",
  "transactions:read": "Lire les transactions",
  "payment_links:read": "Lire les liens de paiement",
  "payment_links:write": "Créer des liens de paiement",
}
export const isWriteScope = (scope: string) => scope.endsWith(":write")

/** « il y a 3 min », « il y a 2 h », « il y a 5 j » — au-delà de 30 jours, la date. */
export function sinceLabel(value: Date | string | null, now = Date.now()): string {
  if (!value) return "Jamais"
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "à l'instant"
  if (seconds < 3_600) return `il y a ${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `il y a ${Math.floor(seconds / 3_600)} h`
  if (seconds < 30 * 86_400) return `il y a ${Math.floor(seconds / 86_400)} j`
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

/** Jours restants avant l'expiration d'une clé (arrondi à l'entier supérieur) ; null si elle n'expire pas. */
export function daysUntil(value: Date | string | null, now = Date.now()): number | null {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - now) / 86_400_000)
}

/** Une clé active qui expire sous 14 jours doit être renouvelée. */
export function needsRenewal(key: { state: KeyState; expiresAt: Date | string | null }, now = Date.now()): boolean {
  const left = daysUntil(key.expiresAt, now)
  return key.state === "active" && left !== null && left <= 14
}

export function usedWithin(key: { lastUsedAt: Date | string | null }, hours: number, now = Date.now()): boolean {
  return key.lastUsedAt !== null && now - new Date(key.lastUsedAt).getTime() < hours * 3_600_000
}
