import { db, logAction, NotFoundError, requirePermission, ValidationError, users, type Actor, type Db } from "@vtex/core"
import { isDisplayCurrency, type Currency } from "@vtex/money"
import { eq } from "drizzle-orm"

import { walletSettings } from "./db/schema"

export interface WalletSettingsView {
  /** Devise d'AFFICHAGE choisie (null : aucune préférence, le wallet reste en euros). */
  displayCurrency: Currency | null
}

function assertDisplayCurrency(value: string): asserts value is Currency {
  if (!isDisplayCurrency(value)) throw new ValidationError("Cette devise ne peut pas servir d'affichage : seules les devises à parité fixe avec l'euro le peuvent.")
}

async function read(executor: Db, userId: number): Promise<WalletSettingsView> {
  const [row] = await executor.select().from(walletSettings).where(eq(walletSettings.userId, userId)).limit(1)
  const value = row?.displayCurrency ?? null
  return { displayCurrency: value && isDisplayCurrency(value) ? value : null }
}

async function upsert(executor: Db, userId: number, updatedBy: number, displayCurrency: Currency) {
  await executor
    .insert(walletSettings)
    .values({ userId, displayCurrency, updatedBy })
    .onDuplicateKeyUpdate({ set: { displayCurrency, updatedBy, updatedAt: new Date() } })
}

/** Préférences du titulaire connecté. */
export async function getMyWalletSettings(actor: Actor): Promise<WalletSettingsView> {
  return read(db, actor.id)
}

/** Le titulaire choisit sa devise d'affichage : elle est conservée côté serveur et retrouvée sur tout appareil. */
export async function updateMyWalletSettings(actor: Actor, input: { displayCurrency: string }): Promise<WalletSettingsView> {
  assertDisplayCurrency(input.displayCurrency)
  await upsert(db, actor.id, actor.id, input.displayCurrency)
  await logAction(db, actor.id, "wallet.settings.update", "user", actor.id, { displayCurrency: input.displayCurrency }, { walletType: "PERSONAL", holderId: actor.id })
  return read(db, actor.id)
}

/** Lecture depuis la fiche utilisateur du Dashboard (permission wallets.read, vérifiée côté serveur). */
export async function adminGetWalletSettings(actor: Actor, userId: number): Promise<WalletSettingsView> {
  requirePermission(actor, "wallets.read")
  await assertUserExists(userId)
  return read(db, userId)
}

/** Réglage par un administrateur (permission wallets.manage) : le wallet du titulaire le relit à sa prochaine ouverture. */
export async function adminUpdateWalletSettings(actor: Actor, userId: number, input: { displayCurrency: string }): Promise<WalletSettingsView> {
  requirePermission(actor, "wallets.manage")
  assertDisplayCurrency(input.displayCurrency)
  await assertUserExists(userId)
  await upsert(db, userId, actor.id, input.displayCurrency)
  await logAction(db, actor.id, "wallet.settings.admin_update", "user", userId, { displayCurrency: input.displayCurrency }, { walletType: "PERSONAL", holderId: userId })
  return read(db, userId)
}

async function assertUserExists(userId: number) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new NotFoundError(`Utilisateur #${userId} introuvable.`)
}
