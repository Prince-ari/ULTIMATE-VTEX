/**
 * Formats d'affichage des cartes (Dashboard). Aucune donnée n'est conservée ici : ces fonctions ne font que présenter
 * ce que le serveur a renvoyé (masqué par défaut) ou ce que l'administrateur est en train de saisir.
 */

export type CardNetwork = "visa" | "mastercard" | "cb"
export type CardTheme = "navy" | "teal" | "brick"

export const NETWORK_LABEL: Record<CardNetwork, string> = { visa: "Visa", mastercard: "Mastercard", cb: "Carte Bancaire" }

export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "")
}

/** « 4111111111111111 » → « 4111 1111 1111 1111 » ; American Express (15 chiffres) se groupe 4-6-5. */
export function groupPan(pan: string): string {
  const digits = digitsOnly(pan)
  if (/^3[47]/.test(digits)) return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(" ")
  return (digits.match(/.{1,4}/g) ?? []).join(" ")
}

/** Numéro masqué : seuls les quatre derniers chiffres (déjà visibles sur la carte) restent lisibles. */
export function maskedPan(lastFour: string, length = 16): string {
  const groups = Math.max(1, Math.ceil(length / 4) - 1)
  return [...Array.from({ length: groups }, () => "••••"), lastFour].join(" ")
}

export function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`
}

/** Saisie libre → « MM/AA » : accepte « 0729 », « 07/29 », « 07/2029 ». Renvoie null tant que la saisie est incomplète ou invalide. */
export function parseExpiry(input: string): { month: number; year: number } | null {
  const digits = digitsOnly(input)
  if (digits.length !== 4 && digits.length !== 6) return null
  const month = Number(digits.slice(0, 2))
  const rawYear = Number(digits.slice(2))
  if (month < 1 || month > 12) return null
  const year = digits.length === 4 ? 2000 + rawYear : rawYear
  return { month, year }
}

/** Masque de saisie « MM/AA » : insère la barre après le mois, ignore tout ce qui n'est pas un chiffre. */
export function maskExpiryInput(input: string): string {
  const digits = digitsOnly(input).slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function isExpired(month: number, year: number, now = new Date()): boolean {
  return year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month < now.getUTCMonth() + 1)
}

/** Clé de Luhn : indication à la saisie (une vraie carte la respecte). Le serveur ne la rend pas bloquante. */
export function luhnValid(pan: string): boolean {
  const digits = digitsOnly(pan)
  if (digits.length < 12) return false
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

export function detectNetwork(pan: string): CardNetwork | "amex" | null {
  const digits = digitsOnly(pan)
  if (/^4/.test(digits)) return "visa"
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(digits)) return "mastercard"
  if (/^3[47]/.test(digits)) return "amex"
  return null
}

/** Thème de la face : une carte Wallet Pro porte le sien ; une carte personnelle est toujours « navy » (bleu profond du Wallet). */
export function themeFor(card: { theme: CardTheme | null }): CardTheme {
  return card.theme ?? "navy"
}

/** « il y a 3 min », « il y a 2 h », sinon la date — pour la dernière consultation d'une carte. */
export function relativeTime(value: string | Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 1000))
  if (seconds < 45) return "à l'instant"
  if (seconds < 3600) return `il y a ${Math.max(1, Math.round(seconds / 60))} min`
  if (seconds < 86400) return `il y a ${Math.round(seconds / 3600)} h`
  if (seconds < 86400 * 7) return `il y a ${Math.round(seconds / 86400)} j`
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}
