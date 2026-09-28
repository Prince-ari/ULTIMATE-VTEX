import { and, eq } from "drizzle-orm"

import type { Db } from "../../db/client"
import { bankAccounts, type BankAccountRow, type WalletType } from "../../db/schema"
import { NotFoundError, ValidationError } from "../../auth/permissions"
import { formatIban, maskIbanValue, normalizeAndValidateBic, normalizeAndValidateIban } from "../../iban"
import { blindIndex, decryptSecret, encryptSecret } from "../vault/crypto"

/**
 * RIB principaux et sous-RIB — couche données. Aucune autorisation ici (le routeur d'administration vérifie les permissions et
 * journalise). L'IBAN n'existe en clair que le temps d'un appel : chiffré au repos, indexé par empreinte, jamais dans un journal.
 */

export type BankAccountKind = "MAIN" | "SUB"

/** Contexte authentifié du chiffré : lié à l'empreinte de SON IBAN (unique) — un chiffré recopié sur une autre ligne est rejeté. */
const aad = (fingerprint: string) => `bank_account:iban:${fingerprint}`

/** Empreinte (index aveugle) d'un IBAN normalisé : retrouver / dédoublonner un RIB sans jamais le déchiffrer. */
export const ibanFingerprint = (iban: string) => blindIndex(iban, "bank-iban")

export function sealIban(iban: string) {
  const fingerprint = ibanFingerprint(iban)
  const sealed = encryptSecret(iban, aad(fingerprint))
  return { ibanEnc: sealed.blob, ibanFingerprint: fingerprint, keyId: sealed.keyId, ibanLast4: iban.slice(-4), ibanCountry: iban.slice(0, 2) }
}

export function openIban(row: Pick<BankAccountRow, "ibanEnc" | "ibanFingerprint">): string {
  return decryptSecret(row.ibanEnc, aad(row.ibanFingerprint))
}

export interface BankAccountView {
  id: number
  walletType: WalletType
  holderId: number | null
  ledgerAccountId: number | null
  kind: BankAccountKind
  label: string
  accountHolderName: string
  bankName: string
  currency: string
  ibanMasked: string
  ibanLast4: string
  ibanCountry: string
  bic: string | null
  status: "active" | "disabled"
  keyId: string
  createdBy: number | null
  updatedBy: number | null
  disabledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Représentation sans secret : IBAN masqué (pays + clé + quatre derniers caractères). Le clair passe uniquement par `revealBankAccountIban`. */
export function bankAccountView(row: BankAccountRow): BankAccountView {
  return {
    id: row.id,
    walletType: row.walletType,
    holderId: row.holderId,
    ledgerAccountId: row.ledgerAccountId,
    kind: row.kind,
    label: row.label,
    accountHolderName: row.accountHolderName,
    bankName: row.bankName,
    currency: row.currency,
    ibanMasked: `${row.ibanCountry}•• •••• •••• ${row.ibanLast4}`,
    ibanLast4: row.ibanLast4,
    ibanCountry: row.ibanCountry,
    bic: row.bic,
    status: row.status,
    keyId: row.keyId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function revealBankAccountIban(row: BankAccountRow): { iban: string; ibanFormatted: string } {
  const iban = openIban(row)
  return { iban, ibanFormatted: formatIban(iban) }
}

/** Un RIB dont l'IBAN est valide : normalise, vérifie la clé MOD 97 et la longueur. */
function checkedIban(value: string): string {
  return normalizeAndValidateIban(value)
}

function isDuplicate(error: unknown, key: string): boolean {
  const candidate = error as { code?: string; errno?: number; message?: string; cause?: { code?: string; message?: string } } | null
  const code = candidate?.code ?? candidate?.cause?.code
  const message = `${candidate?.message ?? ""} ${candidate?.cause?.message ?? ""}`
  return (code === "ER_DUP_ENTRY" || candidate?.errno === 1062) && message.includes(key)
}

export interface NewBankAccount {
  walletType: WalletType
  holderId: number | null
  ledgerAccountId: number | null
  kind: BankAccountKind
  label: string
  accountHolderName: string
  bankName?: string
  currency: string
  iban: string
  bic?: string | null
  actorId: number | null
}

export async function insertBankAccount(db: Db, input: NewBankAccount): Promise<BankAccountRow> {
  const iban = checkedIban(input.iban)
  const bic = input.bic ? normalizeAndValidateBic(input.bic) : null
  if (input.kind === "MAIN" && (input.holderId === null || input.ledgerAccountId === null)) throw new ValidationError("Un RIB principal est toujours attribué à un compte.")
  if ((input.holderId === null) !== (input.ledgerAccountId === null)) throw new ValidationError("Le titulaire et le compte crédité vont ensemble.")
  const sealed = sealIban(iban)
  try {
    const [result] = await db.insert(bankAccounts).values({
      walletType: input.walletType,
      holderId: input.holderId,
      ledgerAccountId: input.ledgerAccountId,
      kind: input.kind,
      label: input.label.trim().slice(0, 100) || (input.kind === "MAIN" ? "RIB principal" : "Sous-RIB"),
      accountHolderName: input.accountHolderName.trim().slice(0, 160),
      bankName: (input.bankName?.trim() || "VTEX").slice(0, 120),
      currency: input.currency,
      bic,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      ...sealed,
    })
    return await getBankAccount(db, result.insertId)
  } catch (error) {
    if (isDuplicate(error, "bank_accounts_iban_fingerprint_unique")) throw new ValidationError("Cet IBAN est déjà enregistré sur un autre RIB.")
    if (isDuplicate(error, "bank_accounts_main_slot_unique")) throw new ValidationError("Ce compte a déjà un RIB principal actif : remplacez-le (modification) ou désactivez-le d'abord.")
    throw error
  }
}

export async function getBankAccount(db: Db, id: number): Promise<BankAccountRow> {
  const [row] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1)
  if (!row) throw new NotFoundError(`RIB #${id} introuvable.`)
  return row
}

export async function findActiveMain(db: Db, walletType: WalletType, ledgerAccountId: number): Promise<BankAccountRow | null> {
  const [row] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.walletType, walletType), eq(bankAccounts.ledgerAccountId, ledgerAccountId), eq(bankAccounts.kind, "MAIN"), eq(bankAccounts.status, "active"))).limit(1)
  return row ?? null
}

export interface BankAccountPatch {
  label?: string
  accountHolderName?: string
  bankName?: string
  bic?: string | null
  iban?: string
}

/** Modifie les champs d'un RIB ; changer l'IBAN chiffre la nouvelle valeur (rotation) — l'ancienne n'est conservée nulle part. */
export async function updateBankAccount(db: Db, id: number, patch: BankAccountPatch, actorId: number | null): Promise<BankAccountRow> {
  const values: Partial<typeof bankAccounts.$inferInsert> = { updatedBy: actorId, updatedAt: new Date() }
  if (patch.label !== undefined) values.label = patch.label.trim().slice(0, 100)
  if (patch.accountHolderName !== undefined) values.accountHolderName = patch.accountHolderName.trim().slice(0, 160)
  if (patch.bankName !== undefined) values.bankName = patch.bankName.trim().slice(0, 120) || "VTEX"
  if (patch.bic !== undefined) values.bic = patch.bic ? normalizeAndValidateBic(patch.bic) : null
  if (patch.iban !== undefined) Object.assign(values, sealIban(checkedIban(patch.iban)))
  try {
    await db.update(bankAccounts).set(values).where(eq(bankAccounts.id, id))
  } catch (error) {
    if (isDuplicate(error, "bank_accounts_iban_fingerprint_unique")) throw new ValidationError("Cet IBAN est déjà enregistré sur un autre RIB.")
    throw error
  }
  return getBankAccount(db, id)
}

export async function setBankAccountStatus(db: Db, id: number, status: "active" | "disabled", actorId: number | null): Promise<BankAccountRow> {
  try {
    await db.update(bankAccounts).set({ status, disabledAt: status === "disabled" ? new Date() : null, updatedBy: actorId, updatedAt: new Date() }).where(eq(bankAccounts.id, id))
  } catch (error) {
    if (isDuplicate(error, "bank_accounts_main_slot_unique")) throw new ValidationError("Ce compte a déjà un autre RIB principal actif : désactivez-le avant de réactiver celui-ci.")
    throw error
  }
  return getBankAccount(db, id)
}

/** Rattache un sous-RIB à un titulaire et à un compte crédité (ou le retire : `null`). */
export async function attachBankAccount(db: Db, id: number, target: { holderId: number; ledgerAccountId: number } | null, actorId: number | null): Promise<BankAccountRow> {
  await db.update(bankAccounts).set({ holderId: target?.holderId ?? null, ledgerAccountId: target?.ledgerAccountId ?? null, updatedBy: actorId, updatedAt: new Date() }).where(eq(bankAccounts.id, id))
  return getBankAccount(db, id)
}

export interface MainBankRef {
  walletType: WalletType
  holderId: number
  ledgerAccountId: number
  currency: string
  accountHolderName: string
}

/**
 * Écriture jumelée du RIB principal : appelée par les services qui alimentent encore les colonnes `iban`/`bic` historiques d'un compte.
 * `iban = null` ⇒ RIB principal désactivé. Idempotente : même IBAN ⇒ seuls le BIC et le titulaire sont rafraîchis.
 * Renvoie l'action à journaliser (`create` | `rotate` | `update` | `disable` | `none`).
 */
export async function syncMainBankAccount(db: Db, ref: MainBankRef, iban: string | null, bic: string | null, actorId: number | null): Promise<{ action: "create" | "rotate" | "update" | "disable" | "none"; row: BankAccountRow | null }> {
  const existing = await findActiveMain(db, ref.walletType, ref.ledgerAccountId)
  if (iban === null) {
    if (!existing) return { action: "none", row: null }
    return { action: "disable", row: await setBankAccountStatus(db, existing.id, "disabled", actorId) }
  }
  const normalized = checkedIban(iban)
  if (!existing) {
    // Un ancien RIB principal désactivé avec ce même IBAN est réactivé plutôt que dupliqué (l'empreinte est unique).
    const fingerprint = ibanFingerprint(normalized)
    const [same] = await db.select().from(bankAccounts).where(eq(bankAccounts.ibanFingerprint, fingerprint)).limit(1)
    if (same && same.walletType === ref.walletType && same.ledgerAccountId === ref.ledgerAccountId && same.kind === "MAIN") {
      await setBankAccountStatus(db, same.id, "active", actorId)
      return { action: "create", row: await updateBankAccount(db, same.id, { bic, accountHolderName: ref.accountHolderName }, actorId) }
    }
    return { action: "create", row: await insertBankAccount(db, { walletType: ref.walletType, holderId: ref.holderId, ledgerAccountId: ref.ledgerAccountId, kind: "MAIN", label: "RIB principal", accountHolderName: ref.accountHolderName, currency: ref.currency, iban: normalized, bic, actorId }) }
  }
  const sameIban = ibanFingerprint(normalized) === existing.ibanFingerprint
  const row = await updateBankAccount(db, existing.id, { iban: sameIban ? undefined : normalized, bic, accountHolderName: ref.accountHolderName }, actorId)
  return { action: sameIban ? "update" : "rotate", row }
}

export { formatIban, maskIbanValue }
