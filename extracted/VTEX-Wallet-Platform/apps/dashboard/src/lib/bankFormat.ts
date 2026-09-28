/**
 * Présentation des RIB (Dashboard). Aucune donnée n'est conservée ici : l'IBAN n'arrive en clair que par une révélation explicite
 * (journalisée) et n'est jamais mis en cache par ces fonctions.
 */

/** « FR7630006000011234567890189 » → « FR76 3000 6000 0112 3456 7890 189 » (groupes de quatre). */
export function groupIban(iban: string): string {
  return (iban.replace(/\s+/g, "").match(/.{1,4}/g) ?? []).join(" ")
}

/** Saisie libre d'un IBAN : majuscules, espaces retirés puis regroupés par quatre, 34 caractères au plus. */
export function maskIbanInput(input: string): string {
  return groupIban(input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 34))
}

export const KIND_LABEL = { MAIN: "RIB principal", SUB: "Sous-RIB" } as const
export const STATUS_LABEL_BANK = { active: "Actif", disabled: "Désactivé" } as const

/** Teinte du socle d'un RIB selon sa devise : la même devise garde la même couleur partout (cycle chromatique stable). */
export function toneForCurrency(currency: string): "violet" | "amber" | "green" | "teal" {
  if (currency === "EUR") return "violet"
  if (currency === "XPF") return "amber"
  if (currency === "USD") return "green"
  return "teal"
}

const FIELD_LABEL: Record<string, string> = { label: "libellé", bankName: "banque", accountHolderName: "titulaire du compte", bic: "BIC", iban: "IBAN" }

export interface BankEvent {
  action: string
  detail: Record<string, unknown> | null
}

/** Phrase lisible d'un événement du journal d'un RIB (jamais de valeur sensible : le journal n'en contient pas). */
export function describeBankEvent(event: BankEvent): { title: string; reason: string | null; tone: "ok" | "warn" | "danger" | "neutral" } {
  const detail = event.detail ?? {}
  const reason = typeof detail.reason === "string" && detail.reason ? detail.reason : null
  switch (event.action) {
    case "bank.account.create":
      return { title: detail.generated ? "RIB créé (IBAN généré)" : "RIB créé", reason, tone: "ok" }
    case "bank.account.update": {
      const fields = Array.isArray(detail.fields) ? detail.fields.map((field) => FIELD_LABEL[String(field)] ?? String(field)) : []
      return { title: fields.length ? `Modifié : ${fields.join(", ")}` : "Modifié", reason, tone: "neutral" }
    }
    case "bank.account.disable":
      return { title: "Désactivé", reason, tone: "danger" }
    case "bank.account.enable":
      return { title: "Réactivé", reason, tone: "ok" }
    case "bank.account.assign":
      return { title: "Attribué à un compte", reason, tone: "ok" }
    case "bank.account.reassign":
      return { title: "Réattribué à un autre compte", reason, tone: "warn" }
    case "bank.account.unassign":
      return { title: "Retiré du compte", reason, tone: "warn" }
    case "bank.iban.reveal":
      return { title: "IBAN affiché", reason: null, tone: "neutral" }
    case "bank.iban.reveal_failed":
      return { title: "Affichage de l'IBAN impossible", reason: null, tone: "danger" }
    default:
      return { title: event.action, reason, tone: "neutral" }
  }
}
