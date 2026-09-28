import { format as formatMoney, isCurrencyCode } from "@vtex/money"

/** Libellés, tons et montants des liens de paiement (Dashboard). Aucune logique métier : le serveur décide, ici on ne fait que présenter. */

export type LinkStatus = "active" | "expired" | "draft" | "disabled"
export type PaymentStatus = "pending" | "requires_action" | "processing" | "succeeded" | "failed" | "canceled" | "refunded"
export type Tone = "ok" | "warn" | "danger" | "neutral"

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = { active: "Actif", expired: "Expiré", draft: "Brouillon", disabled: "Suspendu" }
export const LINK_STATUS_TONE: Record<LinkStatus, Tone> = { active: "ok", expired: "neutral", draft: "warn", disabled: "danger" }

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "En attente",
  requires_action: "Validation banque",
  processing: "En cours",
  succeeded: "Encaissé",
  failed: "Refusé",
  canceled: "Annulé",
  refunded: "Remboursé",
}
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  pending: "warn",
  requires_action: "warn",
  processing: "warn",
  succeeded: "ok",
  failed: "danger",
  canceled: "neutral",
  refunded: "neutral",
}

/** Un paiement « ouvert » n'est ni encaissé ni définitivement échoué : il peut être revérifié auprès du prestataire. */
export const isOpenPayment = (status: PaymentStatus) => status === "pending" || status === "requires_action" || status === "processing"

export function money(cents: number, currency: string): string {
  return isCurrencyCode(currency) ? formatMoney(cents, currency) : `${cents} ${currency}`
}

/** Somme par devise : on n'additionne jamais des euros et des francs Pacifique. */
export function sumByCurrency(rows: ReadonlyArray<{ currency: string; cents: number }>): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) totals[row.currency] = (totals[row.currency] ?? 0) + row.cents
  return totals
}

export function formatTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).filter(([, cents]) => cents !== 0)
  return entries.length === 0 ? "—" : entries.map(([currency, cents]) => money(cents, currency)).join(" · ")
}

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB" }
export function cardLabel(brand: string | null, last4: string | null): string {
  if (!brand && !last4) return "Carte non renseignée"
  return `${brand ? BRANDS[brand.toLowerCase()] ?? brand : "Carte"} •••• ${last4 ?? "----"}`
}

/**
 * Adresse publique d'un lien. La page de paiement vit dans l'application Wallet Pro : son adresse vient de `NEXT_PUBLIC_BUSINESS_URL`.
 * En développement, elle retombe sur le port local ; en production sans variable, on n'invente pas de domaine (chemin relatif seulement).
 */
export function publicPayUrl(slug: string, base: string | undefined = process.env.NEXT_PUBLIC_BUSINESS_URL, development: boolean = process.env.NODE_ENV !== "production"): string {
  const origin = (base?.trim() || (development ? "http://localhost:3001" : "")).replace(/\/+$/, "")
  return `${origin}/pay/${slug}`
}

/** Un socle par famille de teinte, en cycle d'une ligne cliquable à l'autre (RULE 008). */
export const SOCLE_CYCLE = ["violet", "teal", "amber", "green", "brick"] as const
export const socleFor = (index: number) => SOCLE_CYCLE[index % SOCLE_CYCLE.length]!
