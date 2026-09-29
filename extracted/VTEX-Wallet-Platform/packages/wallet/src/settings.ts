import { db, logAction, NotFoundError, requirePermission, ValidationError, users, type Actor, type Db } from "@vtex/core"
import { isDisplayCurrency, type Currency } from "@vtex/money"
import { eq } from "drizzle-orm"

import { walletSettings } from "./db/schema"

export interface WalletSettingsView {
  /** Devise d'AFFICHAGE choisie (null : aucune préférence, le wallet reste en euros). */
  displayCurrency: Currency | null
  /** Nom affiché aux CONTREPARTIES d'un virement (émetteur/destinataire) — jamais à VTEX ni à l'administration,
   * dont l'identité complète (KYC) reste inchangée et journalisée. null : le nom légal du titulaire est affiché. */
  displayName: string | null
}

function assertDisplayCurrency(value: string): asserts value is Currency {
  if (!isDisplayCurrency(value)) throw new ValidationError("Cette devise ne peut pas servir d'affichage : seules les devises à parité fixe avec l'euro le peuvent.")
}

function assertDisplayName(value: string): void {
  if (value.length < 2 || value.length > 60) throw new ValidationError("Le nom affiché doit contenir entre deux et soixante caractères.")
}

async function read(executor: Db, userId: number): Promise<WalletSettingsView> {
  const [row] = await executor.select().from(walletSettings).where(eq(walletSettings.userId, userId)).limit(1)
  const displayCurrency = row?.displayCurrency ?? null
  return {
    displayCurrency: displayCurrency && isDisplayCurrency(displayCurrency) ? displayCurrency : null,
    displayName: row?.displayName ?? null,
  }
}

async function upsert(executor: Db, userId: number, updatedBy: number, patch: { displayCurrency?: Currency; displayName?: string | null }) {
  const [existing] = await executor.select().from(walletSettings).where(eq(walletSettings.userId, userId)).limit(1)
  const next = {
    displayCurrency: patch.displayCurrency ?? existing?.displayCurrency ?? null,
    displayName: patch.displayName !== undefined ? patch.displayName : existing?.displayName ?? null,
  }
  await executor
    .insert(walletSettings)
    .values({ userId, updatedBy, ...next })
    .onDuplicateKeyUpdate({ set: { ...next, updatedBy, updatedAt: new Date() } })
}

/** Préférences du titulaire connecté. */
export async function getMyWalletSettings(actor: Actor): Promise<WalletSettingsView> {
  return read(db, actor.id)
}

/** Le titulaire choisit sa devise d'affichage et/ou le nom affiché à ses contreparties : conservés côté serveur, retrouvés sur tout appareil. */
export async function updateMyWalletSettings(actor: Actor, input: { displayCurrency?: string; displayName?: string | null }): Promise<WalletSettingsView> {
  if (input.displayCurrency !== undefined) assertDisplayCurrency(input.displayCurrency)
  const displayName = input.displayName === undefined ? undefined : input.displayName?.trim() || null
  if (displayName) assertDisplayName(displayName)
  await upsert(db, actor.id, actor.id, { displayCurrency: input.displayCurrency as Currency | undefined, displayName })
  await logAction(db, actor.id, "wallet.settings.update", "user", actor.id, { displayCurrency: input.displayCurrency, displayNameChanged: input.displayName !== undefined }, { walletType: "PERSONAL", holderId: actor.id })
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
  await upsert(db, userId, actor.id, { displayCurrency: input.displayCurrency })
  await logAction(db, actor.id, "wallet.settings.admin_update", "user", userId, { displayCurrency: input.displayCurrency }, { walletType: "PERSONAL", holderId: userId })
  return read(db, userId)
}

async function assertUserExists(userId: number) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new NotFoundError(`Utilisateur #${userId} introuvable.`)
}
