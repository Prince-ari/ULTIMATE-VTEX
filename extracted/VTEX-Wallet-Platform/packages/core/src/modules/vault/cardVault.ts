import { and, eq, sql } from "drizzle-orm"

import type { Db } from "../../db/client"
import { cardVault, type WalletType } from "../../db/schema"
import { ValidationError } from "../../auth/permissions"
import { activeVaultKeyId, blindIndex, decryptSecret, encryptSecret } from "./crypto"

/**
 * Coffre de cartes — couche données. Aucune autorisation ici : l'appelant (routeur admin) a déjà vérifié la permission et
 * journalise chaque écriture / révélation. Ce module ne journalise jamais de valeur.
 */

export type CardSecretField = "pan" | "cvv" | "pin"
export type CardRef = { walletType: WalletType; cardId: number }

/** Contexte authentifié du chiffré : ligne + colonne. Un chiffré déplacé vers une autre carte ou un autre champ est rejeté. */
function aad(ref: CardRef, field: CardSecretField): string {
  return `card:${ref.walletType}:${ref.cardId}:${field}`
}

/** Vérifie la clé de Luhn (toute carte réelle la respecte ; l'interface l'affiche en indication, le serveur ne la rend pas bloquante). */
export function luhnValid(pan: string): boolean {
  let sum = 0
  let double = false
  for (let index = pan.length - 1; index >= 0; index -= 1) {
    let digit = pan.charCodeAt(index) - 48
    if (digit < 0 || digit > 9) return false
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return pan.length > 0 && sum % 10 === 0
}

/** Réseau déduit du préfixe (indication d'affichage ; le réseau de la carte reste celui choisi à l'émission). */
export function detectNetwork(pan: string): "visa" | "mastercard" | "amex" | "unknown" {
  if (/^4/.test(pan)) return "visa"
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(pan)) return "mastercard"
  if (/^3[47]/.test(pan)) return "amex"
  return "unknown"
}

export function normalizePan(input: string): string {
  const pan = input.replace(/[\s-]+/g, "")
  if (!/^\d{12,19}$/.test(pan)) throw new ValidationError("Le numéro de carte doit contenir entre 12 et 19 chiffres.")
  return pan
}

export function normalizeCvv(input: string): string {
  const cvv = input.trim()
  if (!/^\d{3,4}$/.test(cvv)) throw new ValidationError("Le CVV doit contenir 3 ou 4 chiffres.")
  return cvv
}

export function normalizePin(input: string): string {
  const pin = input.trim()
  if (!/^\d{4}$/.test(pin)) throw new ValidationError("Le PIN doit contenir quatre chiffres.")
  return pin
}

/** Le CVV peut être refusé par configuration (`VTEX_VAULT_STORE_CVV=false`) : les règles PCI-DSS interdisent de le conserver après autorisation. */
export function cvvStorageAllowed(): boolean {
  return process.env.VTEX_VAULT_STORE_CVV?.trim().toLowerCase() !== "false"
}

export interface CardVaultStatus {
  configured: boolean
  hasPan: boolean
  hasCvv: boolean
  hasPin: boolean
  keyId: string | null
  updatedAt: Date | null
  lastRevealedAt: Date | null
  lastRevealedBy: number | null
  revealCount: number
}

/** État d'une carte sans donnée saisie. */
export const EMPTY_CARD_VAULT_STATUS: CardVaultStatus = { configured: false, hasPan: false, hasCvv: false, hasPin: false, keyId: null, updatedAt: null, lastRevealedAt: null, lastRevealedBy: null, revealCount: 0 }

function toStatus(row: typeof cardVault.$inferSelect | undefined): CardVaultStatus {
  if (!row) return EMPTY_CARD_VAULT_STATUS
  return {
    configured: true,
    hasPan: row.panEnc !== null,
    hasCvv: row.cvvEnc !== null,
    hasPin: row.pinEnc !== null,
    keyId: row.keyId,
    updatedAt: row.updatedAt,
    lastRevealedAt: row.lastRevealedAt,
    lastRevealedBy: row.lastRevealedBy,
    revealCount: row.revealCount,
  }
}

/** Statut (présence des champs) de plusieurs cartes d'un même type — jamais de valeur. Une seule requête. */
export async function cardVaultStatuses(db: Db, walletType: WalletType, cardIds: number[]): Promise<Map<number, CardVaultStatus>> {
  const result = new Map<number, CardVaultStatus>()
  if (cardIds.length === 0) return result
  const rows = await db.select().from(cardVault).where(and(eq(cardVault.walletType, walletType), sql`${cardVault.cardId} IN (${sql.join(cardIds.map((id) => sql`${id}`), sql`, `)})`))
  for (const row of rows) result.set(row.cardId, toStatus(row))
  return result
}

export async function cardVaultStatus(db: Db, ref: CardRef): Promise<CardVaultStatus> {
  const [row] = await db.select().from(cardVault).where(and(eq(cardVault.walletType, ref.walletType), eq(cardVault.cardId, ref.cardId))).limit(1)
  return toStatus(row)
}

export interface StoreCardSecretsInput {
  /** Valeurs déjà normalisées. Un champ absent (`undefined`) est laissé tel quel ; `null` l'efface. */
  pan?: string | null
  cvv?: string | null
  pin?: string | null
  setBy: number
}

/**
 * Écrit (ou met à jour) les champs fournis. Le numéro est dédoublonné par index aveugle : un même numéro ne peut pas être
 * rattaché à deux cartes. À appeler dans la transaction qui met aussi à jour la ligne de carte.
 */
export async function storeCardSecrets(db: Db, ref: CardRef, input: StoreCardSecretsInput): Promise<void> {
  if (input.cvv && !cvvStorageAllowed()) throw new ValidationError("La conservation du CVV est désactivée sur cette plateforme (VTEX_VAULT_STORE_CVV=false).")

  const [existing] = await db.select().from(cardVault).where(and(eq(cardVault.walletType, ref.walletType), eq(cardVault.cardId, ref.cardId))).limit(1)
  const patch: Partial<typeof cardVault.$inferInsert> = { setBy: input.setBy, updatedAt: new Date() }
  const sealed = { keyId: null as string | null }

  const encrypt = (field: CardSecretField, value: string) => {
    const result = encryptSecret(value, aad(ref, field))
    sealed.keyId = result.keyId
    return result.blob
  }

  if (input.pan !== undefined) {
    if (input.pan === null) { patch.panEnc = null; patch.panFingerprint = null } else {
      const fingerprint = blindIndex(input.pan, "card-pan")
      const [clash] = await db.select({ walletType: cardVault.walletType, cardId: cardVault.cardId }).from(cardVault).where(eq(cardVault.panFingerprint, fingerprint)).limit(1)
      if (clash && !(clash.walletType === ref.walletType && clash.cardId === ref.cardId)) throw new ValidationError("Ce numéro de carte est déjà rattaché à une autre carte.")
      patch.panEnc = encrypt("pan", input.pan)
      patch.panFingerprint = fingerprint
    }
  }
  if (input.cvv !== undefined) patch.cvvEnc = input.cvv === null ? null : encrypt("cvv", input.cvv)
  if (input.pin !== undefined) patch.pinEnc = input.pin === null ? null : encrypt("pin", input.pin)
  if (sealed.keyId) patch.keyId = sealed.keyId

  if (existing) {
    await db.update(cardVault).set(patch).where(eq(cardVault.id, existing.id))
    return
  }
  // Nouvelle ligne : clé active par défaut, même si seul un champ « null » est écrit (aucun chiffré à dater).
  await db.insert(cardVault).values({ walletType: ref.walletType, cardId: ref.cardId, keyId: sealed.keyId ?? activeVaultKeyId(), ...patch })
}

export interface RevealedCardSecrets {
  pan: string | null
  cvv: string | null
  pin: string | null
}

/**
 * Déchiffre les champs d'une carte et enregistre la consultation (compteur + dernier lecteur). L'appelant journalise l'événement
 * dans le journal d'audit ; ce module ne conserve jamais de valeur en clair.
 */
export async function revealCardSecrets(db: Db, ref: CardRef, readerId: number): Promise<RevealedCardSecrets> {
  const [row] = await db.select().from(cardVault).where(and(eq(cardVault.walletType, ref.walletType), eq(cardVault.cardId, ref.cardId))).limit(1)
  if (!row) return { pan: null, cvv: null, pin: null }
  const revealed = {
    pan: row.panEnc ? decryptSecret(row.panEnc, aad(ref, "pan")) : null,
    cvv: row.cvvEnc ? decryptSecret(row.cvvEnc, aad(ref, "cvv")) : null,
    pin: row.pinEnc ? decryptSecret(row.pinEnc, aad(ref, "pin")) : null,
  }
  await db.update(cardVault).set({ lastRevealedAt: new Date(), lastRevealedBy: readerId, revealCount: sql`${cardVault.revealCount} + 1` }).where(eq(cardVault.id, row.id))
  return revealed
}

/** Supprime tout ou partie des secrets d'une carte (carte annulée, PIN changé par le titulaire, effacement demandé). */
export async function clearCardSecrets(db: Db, ref: CardRef, fields: CardSecretField[] = ["pan", "cvv", "pin"]): Promise<boolean> {
  const [row] = await db.select({ id: cardVault.id }).from(cardVault).where(and(eq(cardVault.walletType, ref.walletType), eq(cardVault.cardId, ref.cardId))).limit(1)
  if (!row) return false
  if (fields.length === 3) {
    await db.delete(cardVault).where(eq(cardVault.id, row.id))
    return true
  }
  const patch: Partial<typeof cardVault.$inferInsert> = { updatedAt: new Date() }
  if (fields.includes("pan")) { patch.panEnc = null; patch.panFingerprint = null }
  if (fields.includes("cvv")) patch.cvvEnc = null
  if (fields.includes("pin")) patch.pinEnc = null
  await db.update(cardVault).set(patch).where(eq(cardVault.id, row.id))
  return true
}
