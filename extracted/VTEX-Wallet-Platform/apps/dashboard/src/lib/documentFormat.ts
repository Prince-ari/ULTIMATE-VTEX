import type { LegIconName } from "@/components/ui/LegIcon"

/** Libellés, tons et contrôles d'import des documents (Dashboard). Le serveur décide et revérifie tout ; ici on ne fait que présenter et éviter un aller-retour inutile. */

export type DocumentCategory = "statement" | "receipt" | "contract" | "identity" | "tax" | "notice" | "account_document" | "rib" | "other" | "transfer_proof"
export type DocumentStatus = "active" | "archived" | "revoked"
export type ReviewStatus = "none" | "pending" | "validated" | "rejected"
export type Tone = "ok" | "warn" | "danger" | "neutral"
export type SocleToneName = "violet" | "navy" | "green" | "amber" | "teal" | "brick" | "red" | "platinum"

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  statement: "Relevé",
  receipt: "Reçu",
  contract: "Contrat",
  identity: "Pièce d'identité",
  tax: "Fiscal",
  notice: "Avis",
  account_document: "Document de compte",
  rib: "RIB",
  other: "Autre",
  transfer_proof: "Justificatif de virement",
}

/** Catégories proposées à l'envoi (un justificatif de virement ne s'envoie pas : c'est le titulaire qui le remet). */
export const SEND_CATEGORIES = ["rib", "statement", "receipt", "contract", "identity", "tax", "notice", "account_document", "other"] as const satisfies ReadonlyArray<DocumentCategory>

export const STATUS_LABEL: Record<DocumentStatus, string> = { active: "Disponible", archived: "Archivé", revoked: "Retiré" }
export const REVIEW_LABEL: Record<ReviewStatus, string> = { none: "Sans examen", pending: "À examiner", validated: "Validé", rejected: "Refusé" }

export interface DocumentState {
  key: "sent" | "viewed" | "pending" | "validated" | "rejected" | "archived" | "revoked"
  label: string
  pill: Tone
  socle: SocleToneName
  icon: LegIconName
}

/**
 * L'état lisible d'une remise, du point de vue de l'administration : un document envoyé est « Envoyé » puis « Consulté » ;
 * une pièce remise par un titulaire est « À examiner » puis « Validée » ou « Refusée » ; un document archivé ou retiré l'emporte sur tout le reste.
 */
export function documentState(row: { status: DocumentStatus; reviewStatus: ReviewStatus; firstViewedAt: Date | string | null }): DocumentState {
  if (row.status === "revoked") return { key: "revoked", label: "Retiré", pill: "danger", socle: "red", icon: "close" }
  if (row.status === "archived") return { key: "archived", label: "Archivé", pill: "neutral", socle: "platinum", icon: "archive" }
  if (row.reviewStatus === "pending") return { key: "pending", label: "À examiner", pill: "warn", socle: "amber", icon: "clock" }
  if (row.reviewStatus === "validated") return { key: "validated", label: "Validé", pill: "ok", socle: "green", icon: "check" }
  if (row.reviewStatus === "rejected") return { key: "rejected", label: "Refusé", pill: "danger", socle: "red", icon: "alert" }
  if (row.firstViewedAt) return { key: "viewed", label: "Consulté", pill: "ok", socle: "green", icon: "eye" }
  return { key: "sent", label: "Envoyé", pill: "warn", socle: "violet", icon: "file" }
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const ACCEPTED_UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export const ACCEPT_ATTRIBUTE = ACCEPTED_UPLOAD_TYPES.join(",")

/** Contrôle d'un fichier avant import : `null` s'il convient, sinon le message à afficher. Le serveur revérifie le type, la taille ET le contenu. */
export function checkUpload(file: { name: string; type: string; size: number }): string | null {
  if (!(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return "Format refusé : importez un PDF, une image JPEG, PNG ou WebP."
  if (file.size <= 0) return "Ce fichier est vide."
  if (file.size > MAX_UPLOAD_BYTES) return `Fichier trop volumineux (${formatSize(file.size)}) : 8 Mo au maximum.`
  return null
}

/** « 12 o », « 340 Ko », « 1,2 Mo » (virgule décimale française) ; « — » pour un très ancien document sans taille connue. */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
}

/** Le titre proposé à l'import : le nom du fichier sans son extension, mis en forme lisible. */
export function titleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const withoutExtension = base.replace(/\.[a-z0-9]{1,8}$/i, "")
  const spaced = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return spaced.length === 0 ? "" : spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const downloadUrl = (id: number) => `/api/media/documents/${id}`

const HISTORY: Record<string, { label: string; icon: LegIconName; socle: SocleToneName }> = {
  "document.send": { label: "Envoyé au wallet", icon: "upload", socle: "violet" },
  "document.assign": { label: "Attribué", icon: "upload", socle: "violet" },
  "transfer_proof.submit": { label: "Remis par le titulaire", icon: "upload", socle: "teal" },
  "document.download": { label: "Téléchargé", icon: "download", socle: "navy" },
  "document.validate": { label: "Validé", icon: "check", socle: "green" },
  "document.reject": { label: "Refusé", icon: "alert", socle: "red" },
  "document.archive": { label: "Archivé", icon: "archive", socle: "platinum" },
  "document.restore": { label: "Rétabli", icon: "undo", socle: "green" },
  "document.revoke": { label: "Retiré", icon: "close", socle: "red" },
}

/** Ligne d'historique d'un document : libellé, icône et teinte ; une action inconnue s'affiche telle quelle plutôt que de disparaître. */
export function historyEntry(action: string): { label: string; icon: LegIconName; socle: SocleToneName } {
  return HISTORY[action] ?? { label: action, icon: "history", socle: "platinum" }
}

export function wallets(count: number): string {
  return `${count} wallet${count > 1 ? "s" : ""}`
}

/** Un socle par famille de teinte, en cycle d'une ligne cliquable à l'autre (RULE 008). */
export const SOCLE_CYCLE = ["violet", "teal", "amber", "green", "brick"] as const
export const socleFor = (index: number) => SOCLE_CYCLE[index % SOCLE_CYCLE.length]!
