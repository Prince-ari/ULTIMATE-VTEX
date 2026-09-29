import { createHash, randomBytes, scryptSync } from "node:crypto"
import { and, asc, desc, eq, gte, or, sql } from "drizzle-orm"
import {
  assertOperatorAccess,
  clearCardSecrets,
  createSystemNotification,
  db,
  formatMinor,
  generatedIban,
  isAdminRole,
  logAction,
  notifications,
  NotFoundError,
  requireRole,
  requireSelfOrRole,
  syncMainBankAccount,
  ValidationError,
  type Actor,
  type Db,
  type MainBankRef,
  users,
} from "@vtex/core"
import type { Currency } from "@vtex/money"

import {
  beneficiaries,
  cards,
  savingsGoals,
  transactions,
  walletAccounts,
  walletBankDetails,
  walletIdempotencyKeys,
  walletLedgerEntries,
  walletPermissions,
  walletSettings,
  type Beneficiary,
  type Card,
  type SavingsGoal,
  type WalletAccount,
  type WalletTransaction,
} from "./db/schema"
import { assertIdempotencyKey, assertPositiveCents, assertSupportedCurrency, assertValueDate, normalizeAndValidateBic, normalizeAndValidateIban } from "./validation"

type Executor = Db
type CardControls = Partial<Pick<Card, "onlinePaymentsEnabled" | "contactlessEnabled" | "cashWithdrawalEnabled">>
type CardLimits = Partial<Pick<Card, "dailyLimitCents" | "monthlyLimitCents" | "perTransactionLimitCents">>
type CardPaymentChannel = "online" | "contactless" | "cash_withdrawal"
export const walletPermissionNames = ["wallet.read", "wallet.accounts.manage", "wallet.cards.manage", "wallet.cards.pin", "wallet.transactions.review", "wallet.transactions.adjust", "wallet.beneficiaries.manage", "wallet.savings.manage", "wallet.emergency"] as const
export type WalletPermissionName = (typeof walletPermissionNames)[number]
const defaultAgentPermissions = new Set<WalletPermissionName>(["wallet.read", "wallet.cards.manage", "wallet.transactions.review", "wallet.beneficiaries.manage", "wallet.savings.manage"])

const adminCardColumns = {
  id: cards.id,
  walletAccountId: cards.walletAccountId,
  cardholderName: cards.cardholderName,
  lastFour: cards.lastFour,
  network: cards.network,
  label: cards.label,
  status: cards.status,
  dailyLimitCents: cards.dailyLimitCents,
  monthlyLimitCents: cards.monthlyLimitCents,
  perTransactionLimitCents: cards.perTransactionLimitCents,
  onlinePaymentsEnabled: cards.onlinePaymentsEnabled,
  contactlessEnabled: cards.contactlessEnabled,
  cashWithdrawalEnabled: cards.cashWithdrawalEnabled,
  expiresAt: cards.expiresAt,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
} as const

/** Empreinte du PIN d'une carte (scrypt, sel = référence de jeton) : la seule forme sous laquelle le PIN est vérifiable côté Wallet. */
export function hashCardPin(pin: string, tokenReference: string): string {
  return scryptSync(pin, tokenReference, 32).toString("hex")
}

export function generatedReference(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

export async function insertWalletNotification(executor: Executor, targetUserId: number, actorId: number, title: string, body: string) {
  await executor.insert(notifications).values({
    targetUserId,
    title,
    body,
    status: "sent",
    sentAt: new Date(),
    createdBy: actorId,
  })
}

export async function getAccountOrThrow(executor: Executor, accountId: number): Promise<WalletAccount> {
  const [account] = await executor.select().from(walletAccounts).where(eq(walletAccounts.id, accountId)).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet introuvable.")
  return account
}

async function ownedAccount(executor: Executor, actor: Actor, accountId: number, privilegedRoles: Actor["role"][] = ["admin", "agent"]) {
  const account = await getAccountOrThrow(executor, accountId)
  requireSelfOrRole(actor, account.userId, ...privilegedRoles)
  // Garde-fou de session d'accès (Sprint 8) : lu sur `db`, pas `executor` — un simple contrôle de permission, jamais une donnée de la transaction elle-même.
  if (actor.id !== account.userId) await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: account.userId })
  return account
}

/**
 * À utiliser à la place de `requireSelfOrRole(actor, ownerId, "admin", "agent")` sur un wallet PERSONAL : même
 * vérification de rôle, plus le garde-fou de session d'accès (Sprint 8) — si l'appelant a ouvert une session
 * EN LECTURE SEULE sur CE titulaire précis, la mutation est refusée même si son rôle l'autoriserait normalement.
 * Un titulaire qui agit sur son propre wallet (`actor.id === ownerId`) n'est jamais concerné : aucune session
 * n'est vérifiée dans ce cas, le comportement pour un utilisateur normal reste strictement inchangé.
 */
async function requireSelfOrStaffAccess(actor: Actor, ownerId: number): Promise<void> {
  requireSelfOrRole(actor, ownerId, "admin", "agent")
  if (actor.id !== ownerId) await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: ownerId })
}

export async function hasWalletPermission(actor: Actor, permission: WalletPermissionName, executor: Executor = db) {
  if (isAdminRole(actor.role)) return true
  if (actor.role !== "agent") return false
  const [override] = await executor.select({ allowed: walletPermissions.allowed }).from(walletPermissions).where(and(eq(walletPermissions.userId, actor.id), eq(walletPermissions.permission, permission))).limit(1)
  return override?.allowed ?? defaultAgentPermissions.has(permission)
}

export async function requireWalletPermission(actor: Actor, permission: WalletPermissionName, executor: Executor = db) {
  if (!(await hasWalletPermission(actor, permission, executor))) throw new ValidationError(`Permission Wallet requise : ${permission}.`)
}

export async function listWalletPermissions(actor: Actor, userId: number) {
  requireRole(actor, "admin")
  const rows = await db.select().from(walletPermissions).where(eq(walletPermissions.userId, userId))
  const overrides = new Map(rows.map((row) => [row.permission, row.allowed]))
  return walletPermissionNames.map((permission) => ({ permission, allowed: overrides.get(permission) ?? false, overridden: overrides.has(permission) }))
}

export async function updateWalletPermission(actor: Actor, input: { userId: number; permission: WalletPermissionName; allowed: boolean }) {
  requireRole(actor, "admin")
  const [existing] = await db.select().from(walletPermissions).where(and(eq(walletPermissions.userId, input.userId), eq(walletPermissions.permission, input.permission))).limit(1)
  if (existing) await db.update(walletPermissions).set({ allowed: input.allowed, updatedBy: actor.id, updatedAt: new Date() }).where(eq(walletPermissions.id, existing.id))
  else await db.insert(walletPermissions).values({ userId: input.userId, permission: input.permission, allowed: input.allowed, updatedBy: actor.id })
  await logAction(db, actor.id, "wallet.permission.update", "user", input.userId, { permission: input.permission, allowed: input.allowed })
  return listWalletPermissions(actor, input.userId)
}

export async function changeAvailable(executor: Executor, accountId: number, deltaCents: number): Promise<number> {
  const conditions = [eq(walletAccounts.id, accountId)]
  if (deltaCents < 0) conditions.push(gte(walletAccounts.availableBalanceCents, -deltaCents))
  const [result] = await executor
    .update(walletAccounts)
    .set({
      availableBalanceCents: sql`${walletAccounts.availableBalanceCents} + ${deltaCents}`,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
  if (result.affectedRows !== 1) throw new ValidationError("Solde disponible insuffisant.")
  return (await getAccountOrThrow(executor, accountId)).availableBalanceCents
}

async function changeReserved(executor: Executor, accountId: number, deltaCents: number): Promise<number> {
  const conditions = [eq(walletAccounts.id, accountId)]
  if (deltaCents < 0) conditions.push(gte(walletAccounts.reservedBalanceCents, -deltaCents))
  const [result] = await executor
    .update(walletAccounts)
    .set({
      reservedBalanceCents: sql`${walletAccounts.reservedBalanceCents} + ${deltaCents}`,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
  if (result.affectedRows !== 1) throw new ValidationError("Réservation de solde incohérente.")
  return (await getAccountOrThrow(executor, accountId)).reservedBalanceCents
}

export async function writeLedger(executor: Executor, input: {
  accountId: number
  transactionId: number
  entryKind: "available" | "reserved"
  deltaCents: number
  balanceAfterCents: number
}) {
  await executor.insert(walletLedgerEntries).values({
    walletAccountId: input.accountId,
    transactionId: input.transactionId,
    entryKind: input.entryKind,
    deltaCents: input.deltaCents,
    balanceAfterCents: input.balanceAfterCents,
  })
}

export async function insertTransaction(executor: Executor, input: Omit<typeof transactions.$inferInsert, "reference"> & { reference?: string }) {
  const [result] = await executor.insert(transactions).values({
    ...input,
    reference: input.reference ?? generatedReference("VTX"),
  })
  const [transaction] = await executor.select().from(transactions).where(eq(transactions.id, result.insertId)).limit(1)
  if (!transaction) throw new Error("La transaction n’a pas pu être relue.")
  return transaction
}

async function replayOrStart<T extends Record<string, unknown>>(
  executor: Executor,
  actor: Actor,
  operation: string,
  idempotencyKey: string,
  payload: unknown,
): Promise<T | null> {
  assertIdempotencyKey(idempotencyKey)
  const hash = requestHash(payload)
  const [existing] = await executor
    .select()
    .from(walletIdempotencyKeys)
    .where(eq(walletIdempotencyKeys.idempotencyKey, idempotencyKey))
    .limit(1)

  if (existing) {
    if (existing.userId !== actor.id || existing.operation !== operation || existing.requestHash !== hash) {
      throw new ValidationError("Cette clé d’idempotence a déjà été utilisée pour une autre opération.")
    }
    if (existing.status === "completed" && existing.response) {
      const response = typeof existing.response === "string" ? JSON.parse(existing.response) : existing.response
      if (!response || typeof response !== "object") throw new ValidationError("La réponse idempotente enregistrée est invalide.")
      return response as T
    }
    throw new ValidationError("Cette opération est déjà en cours de traitement.")
  }

  await executor.insert(walletIdempotencyKeys).values({
    idempotencyKey,
    userId: actor.id,
    operation,
    requestHash: hash,
    status: "processing",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  return null
}

async function completeIdempotency(executor: Executor, idempotencyKey: string, transactionId: number | null, response: Record<string, unknown>) {
  await executor
    .update(walletIdempotencyKeys)
    .set({ status: "completed", transactionId, response })
    .where(eq(walletIdempotencyKeys.idempotencyKey, idempotencyKey))
}

/** Compte principal d'un titulaire : le plus ancien, c'est-à-dire celui de sa devise initiale (les autres sont des comptes ouverts ensuite). */
export async function primaryAccount(executor: Executor, userId: number): Promise<WalletAccount | null> {
  const [row] = await executor.select().from(walletAccounts).where(eq(walletAccounts.userId, userId)).orderBy(asc(walletAccounts.id)).limit(1)
  return row ?? null
}

/**
 * Ouvre (ou retrouve) le compte d'un titulaire dans une devise, avec sa carte virtuelle.
 * `actor` est le TITULAIRE ; `opts.auditActorId` désigne l'administrateur qui agit lorsque le compte est ouvert pour un tiers.
 */
export async function ensureWalletAccount(actor: Actor, currency?: Currency, executor: Executor = db, opts: { auditActorId?: number } = {}): Promise<WalletAccount> {
  if (currency === undefined) {
    // Sans devise explicite : le compte PRINCIPAL du titulaire (le plus ancien = sa devise initiale) ; à défaut, un compte en euros.
    const primary = await primaryAccount(executor, actor.id)
    if (primary) return primary
    currency = "EUR"
  }
  assertSupportedCurrency(currency)
  const [existing] = await executor
    .select()
    .from(walletAccounts)
    .where(and(eq(walletAccounts.userId, actor.id), eq(walletAccounts.currency, currency)))
    .limit(1)
  if (existing) return existing

  const account = await insertAccountWithVirtualCard(executor, actor.id, currency)
  await logAction(executor, opts.auditActorId ?? actor.id, "wallet.account.create", "wallet_account", account.id, { currency }, { walletType: "PERSONAL", holderId: actor.id })
  return account
}

/** Compte + carte virtuelle : toujours les deux ensemble (l'appelant fournit la transaction lorsqu'il enchaîne d'autres écritures). */
async function insertAccountWithVirtualCard(executor: Executor, ownerUserId: number, currency: Currency): Promise<WalletAccount> {
  const [result] = await executor.insert(walletAccounts).values({ userId: ownerUserId, currency, status: "active" })
  const account = await getAccountOrThrow(executor, result.insertId)
  await executor.insert(cards).values({
    walletAccountId: account.id,
    cardholderName: "Client VTEX",
    lastFour: String(account.id).padStart(4, "0").slice(-4),
    network: "visa",
    label: "Carte virtuelle VTEX",
    tokenReference: `virtual_${randomBytes(18).toString("hex")}`,
    expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
  })
  return account
}

export async function getMyWallet(actor: Actor, currency?: Currency) {
  const account = await ensureWalletAccount(actor, currency)
  return {
    ...account,
    totalBalanceCents: account.availableBalanceCents + account.reservedBalanceCents,
  }
}

export async function bootstrapWallet(actor: Actor) {
  const account = await getMyWallet(actor)
  const [cardRows, transactionRows, beneficiaryRows, savingsGoalRows, userRows, settingsRows] = await Promise.all([
    db.select().from(cards).where(eq(cards.walletAccountId, account.id)).orderBy(desc(cards.createdAt)),
    db.select().from(transactions).where(eq(transactions.walletAccountId, account.id)).orderBy(desc(transactions.createdAt)).limit(100),
    db.select().from(beneficiaries).where(eq(beneficiaries.userId, actor.id)).orderBy(desc(beneficiaries.createdAt)),
    db.select().from(savingsGoals).where(eq(savingsGoals.userId, actor.id)).orderBy(desc(savingsGoals.createdAt)),
    db.select().from(users).where(eq(users.id, actor.id)).limit(1),
    db.select().from(walletSettings).where(eq(walletSettings.userId, actor.id)).limit(1),
  ])
  return {
    account,
    cards: cardRows.map(ownerCardView),
    transactions: transactionRows,
    beneficiaries: beneficiaryRows,
    savingsGoals: savingsGoalRows,
    user: userRows[0] ?? null,
    /** Préférences serveur du titulaire (devise d'affichage) : le wallet les applique à l'ouverture. */
    settings: { displayCurrency: settingsRows[0]?.displayCurrency ?? null },
  }
}

/** Carte telle que le titulaire la reçoit : jamais l'empreinte du PIN (un PIN à 4 chiffres se retrouve en quelques ms à partir de son empreinte) — seulement l'information « défini ». */
export function ownerCardView(card: Card): Omit<Card, "pinHash"> & { pinConfigured: boolean } {
  const { pinHash, ...rest } = card
  return { ...rest, pinConfigured: pinHash !== null }
}

export async function listMyCards(actor: Actor) {
  const account = await ensureWalletAccount(actor)
  const rows = await db.select().from(cards).where(eq(cards.walletAccountId, account.id)).orderBy(desc(cards.createdAt))
  return rows.map(ownerCardView)
}

/** Compte principal → référence du RIB principal dans `bank_accounts` (source de vérité) ; les colonnes iban/bic du compte restent alimentées en parallèle. */
async function mainBankRef(executor: Executor, account: WalletAccount): Promise<MainBankRef> {
  const [owner] = await executor.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, account.userId)).limit(1)
  return { walletType: "PERSONAL", holderId: account.userId, ledgerAccountId: account.id, currency: account.currency, accountHolderName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : "Titulaire VTEX" }
}
export async function provisionBankDetails(actor: Actor, walletAccountId?: number) {
  const account = walletAccountId ? await ownedAccount(db, actor, walletAccountId) : await ensureWalletAccount(actor)
  await requireSelfOrStaffAccess(actor, account.userId)
  const iban = account.iban ?? generatedIban(account.id)
  const bic = account.bic ?? "VTEXFRPPXXX"
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.accounts.manage")
  const normalizedIban = normalizeAndValidateIban(iban)
  const normalizedBic = normalizeAndValidateBic(bic)
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    if (!account.iban || !account.bic) {
      await executor.update(walletAccounts).set({ iban: normalizedIban, bic: normalizedBic, updatedAt: new Date() }).where(eq(walletAccounts.id, account.id))
      await executor.insert(walletBankDetails).values({ walletAccountId: account.id, iban: normalizedIban, bic: normalizedBic, createdBy: actor.id, reason: "Provisionnement initial" })
    }
    await syncMainBankAccount(executor, await mainBankRef(executor, account), normalizedIban, normalizedBic, actor.id)
  })
  await logAction(db, actor.id, "wallet.account.bank_details.provision", "wallet_account", account.id, { ibanLast4: normalizedIban.slice(-4), bic: normalizedBic })
  await insertWalletNotification(db, account.userId, actor.id, "Coordonnées bancaires disponibles", "Votre IBAN et votre BIC sont désormais disponibles dans l’espace Recevoir.")
  return { ...account, iban: normalizedIban, bic: normalizedBic }
}

export async function updateBankDetails(actor: Actor, input: { walletAccountId: number; iban: string; bic: string; reason: string }) {
  const account = await getAccountOrThrow(db, input.walletAccountId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.accounts.manage")
  if (input.reason.trim().length < 8) throw new ValidationError("Le motif RIB doit contenir au moins huit caractères.")
  const iban = normalizeAndValidateIban(input.iban)
  const bic = normalizeAndValidateBic(input.bic)
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    await executor.update(walletBankDetails).set({ status: "revoked", revokedAt: new Date(), reason: input.reason.trim() }).where(and(eq(walletBankDetails.walletAccountId, account.id), eq(walletBankDetails.status, "active")))
    await executor.update(walletAccounts).set({ iban, bic, updatedAt: new Date() }).where(eq(walletAccounts.id, account.id))
    await executor.insert(walletBankDetails).values({ walletAccountId: account.id, iban, bic, createdBy: actor.id, reason: input.reason.trim() })
    await syncMainBankAccount(executor, await mainBankRef(executor, account), iban, bic, actor.id)
  })
  await logAction(db, actor.id, "wallet.account.bank_details.rotate", "wallet_account", account.id, { ibanLast4: iban.slice(-4), bic, reason: input.reason.trim() })
  await insertWalletNotification(db, account.userId, actor.id, "Coordonnées bancaires mises à jour", "Vos coordonnées bancaires Wallet ont été mises à jour.")
  return getAccountOrThrow(db, account.id)
}

export async function revokeBankDetails(actor: Actor, input: { walletAccountId: number; reason: string }) {
  const account = await getAccountOrThrow(db, input.walletAccountId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.accounts.manage")
  if (input.reason.trim().length < 8) throw new ValidationError("Le motif de révocation doit contenir au moins huit caractères.")
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    await executor.update(walletBankDetails).set({ status: "revoked", revokedAt: new Date(), reason: input.reason.trim() }).where(and(eq(walletBankDetails.walletAccountId, account.id), eq(walletBankDetails.status, "active")))
    await executor.update(walletAccounts).set({ iban: null, bic: null, updatedAt: new Date() }).where(eq(walletAccounts.id, account.id))
    await syncMainBankAccount(executor, await mainBankRef(executor, account), null, null, actor.id)
  })
  await logAction(db, actor.id, "wallet.account.bank_details.revoke", "wallet_account", account.id, { reason: input.reason.trim() })
  await insertWalletNotification(db, account.userId, actor.id, "Coordonnées bancaires révoquées", "Vos coordonnées bancaires Wallet ont été révoquées.")
  return getAccountOrThrow(db, account.id)
}

export async function listBankDetailsHistory(actor: Actor, walletAccountId: number) {
  const account = await getAccountOrThrow(db, walletAccountId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.read")
  return db.select({ id: walletBankDetails.id, walletAccountId: walletBankDetails.walletAccountId, iban: walletBankDetails.iban, bic: walletBankDetails.bic, status: walletBankDetails.status, reason: walletBankDetails.reason, revokedAt: walletBankDetails.revokedAt, createdAt: walletBankDetails.createdAt }).from(walletBankDetails).where(eq(walletBankDetails.walletAccountId, walletAccountId)).orderBy(desc(walletBankDetails.createdAt))
}

async function cardWithAccount(cardId: number, executor: Executor = db) {
  const [row] = await executor
    .select({ card: cards, account: walletAccounts })
    .from(cards)
    .innerJoin(walletAccounts, eq(cards.walletAccountId, walletAccounts.id))
    .where(eq(cards.id, cardId))
    .limit(1)
  if (!row) throw new NotFoundError("Carte introuvable.")
  return row
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

async function cardSpendSince(executor: Executor, cardId: number, from: Date) {
  const [row] = await executor
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.cardId, cardId), eq(transactions.type, "card_payment"), eq(transactions.status, "completed"), gte(transactions.createdAt, from)))
  return Number(row?.total ?? 0)
}

export function assertCardPaymentAllowed(
  account: Pick<WalletAccount, "status">,
  card: Pick<Card, "status" | "expiresAt" | "onlinePaymentsEnabled" | "contactlessEnabled" | "cashWithdrawalEnabled" | "perTransactionLimitCents" | "dailyLimitCents" | "monthlyLimitCents">,
  input: Pick<Parameters<typeof authorizeCardPayment>[1], "amountCents" | "merchantName" | "channel">,
  spending: { dailySpentCents: number; monthlySpentCents: number },
  now = new Date(),
) {
  assertPositiveCents(input.amountCents, "Montant du paiement")
  if (input.merchantName.trim().length < 2 || input.merchantName.trim().length > 140) throw new ValidationError("Le commerçant doit contenir entre 2 et 140 caractères.")
  if (account.status !== "active") throw new ValidationError("Le compte Wallet n’est pas actif.")
  if (card.status === "frozen") throw new ValidationError("Cette carte est gelée.")
  if (card.status !== "active") throw new ValidationError("Cette carte n’est pas active.")
  if (card.expiresAt.getTime() <= now.getTime()) throw new ValidationError("Cette carte est expirée.")
  if (input.channel === "online" && !card.onlinePaymentsEnabled) throw new ValidationError("Les paiements en ligne sont désactivés pour cette carte.")
  if (input.channel === "contactless" && !card.contactlessEnabled) throw new ValidationError("Le sans contact est désactivé pour cette carte.")
  if (input.channel === "cash_withdrawal" && !card.cashWithdrawalEnabled) throw new ValidationError("Les retraits sont désactivés pour cette carte.")
  if (input.amountCents > card.perTransactionLimitCents) throw new ValidationError("Le paiement dépasse le plafond par opération de la carte.")
  if (spending.dailySpentCents + input.amountCents > card.dailyLimitCents) throw new ValidationError("Le paiement dépasse le plafond quotidien de la carte.")
  if (spending.monthlySpentCents + input.amountCents > card.monthlyLimitCents) throw new ValidationError("Le paiement dépasse le plafond mensuel de la carte.")
}

export async function authorizeCardPayment(actor: Actor, input: { cardId: number; amountCents: number; merchantName: string; channel: CardPaymentChannel; idempotencyKey: string }) {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "card_payment", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }
    const { card, account } = await cardWithAccount(input.cardId, executor)
    await requireSelfOrStaffAccess(actor, account.userId)
    const now = new Date()
    const [dailySpent, monthlySpent] = await Promise.all([cardSpendSince(executor, card.id, startOfUtcDay(now)), cardSpendSince(executor, card.id, startOfUtcMonth(now))])
    assertCardPaymentAllowed(account, card, input, { dailySpentCents: dailySpent, monthlySpentCents: monthlySpent }, now)
    const balanceAfterCents = await changeAvailable(executor, account.id, -input.amountCents)
    const reference = generatedReference("CPY")
    const transaction = await insertTransaction(executor, {
      reference,
      idempotencyKey: input.idempotencyKey,
      walletAccountId: account.id,
      cardId: card.id,
      initiatedByUserId: actor.id,
      type: "card_payment",
      direction: "debit",
      status: "completed",
      amountCents: input.amountCents,
      feeCents: 0,
      currency: account.currency,
      description: input.merchantName.trim(),
      metadata: { channel: input.channel, cardLastFour: card.lastFour },
      completedAt: now,
    })
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "available", deltaCents: -input.amountCents, balanceAfterCents })
    const response = { transactionId: transaction.id, reference, status: "completed" }
    await completeIdempotency(executor, input.idempotencyKey, transaction.id, response)
    await logAction(executor, actor.id, "wallet.card.authorize", "transaction", transaction.id, { cardId: card.id, amountCents: input.amountCents, channel: input.channel })
    await insertWalletNotification(executor, account.userId, actor.id, "Paiement carte autorisé", `${input.merchantName.trim()} a débité ${input.amountCents} unités minimales.`)
    return { ...response, replayed: false }
  })
}

export async function setCardFrozen(actor: Actor, cardId: number, frozen: boolean): Promise<Card> {
  const { card, account } = await cardWithAccount(cardId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (card.status === "expired" || card.status === "cancelled") throw new ValidationError("Cette carte ne peut plus être modifiée.")
  await db.update(cards).set({ status: frozen ? "frozen" : "active", updatedAt: new Date() }).where(eq(cards.id, cardId))
  const [updated] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!updated) throw new NotFoundError("Carte introuvable.")
  await logAction(db, actor.id, frozen ? "wallet.card.freeze" : "wallet.card.unfreeze", "card", cardId)
  await insertWalletNotification(db, account.userId, actor.id, frozen ? "Carte gelée" : "Carte dégelée", frozen ? `La carte se terminant par ${card.lastFour} a été gelée. Contactez le support client si vous n’êtes pas à l’origine de cette action.` : `La carte se terminant par ${card.lastFour} a été dégelée.`)
  return updated
}

export async function updateCardControls(actor: Actor, cardId: number, controls: CardControls, limits: CardLimits): Promise<Card> {
  const { account } = await cardWithAccount(cardId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.cards.manage")
  if (Object.keys(limits).length > 0) requireRole(actor, "admin", "agent")
  for (const value of Object.values(limits)) if (value !== undefined) assertPositiveCents(value, "Limite de carte")

  await db.update(cards).set({ ...controls, ...limits, updatedAt: new Date() }).where(eq(cards.id, cardId))
  const [updated] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!updated) throw new NotFoundError("Carte introuvable.")
  await logAction(db, actor.id, "wallet.card.update_controls", "card", cardId, { controls, limits })
  return updated
}

export async function createCard(actor: Actor, input: { walletAccountId: number; label: string; lastFour: string; network: "visa" | "mastercard" | "cb"; expiresAt: Date }) {
  requireRole(actor, "admin", "agent")
  if (!/^\d{4}$/.test(input.lastFour)) throw new ValidationError("Les quatre derniers chiffres de carte sont invalides.")
  const account = await getAccountOrThrow(db, input.walletAccountId)
  const [result] = await db.insert(cards).values({
    walletAccountId: account.id,
    cardholderName: `VTEX ${account.currency}`,
    label: input.label.trim().slice(0, 80) || "Carte VTEX",
    lastFour: input.lastFour,
    network: input.network,
    tokenReference: `tok_${randomBytes(18).toString("hex")}`,
    expiresAt: input.expiresAt,
  })
  const [card] = await db.select().from(cards).where(eq(cards.id, result.insertId)).limit(1)
  if (!card) throw new Error("La carte n’a pas pu être créée.")
  await logAction(db, actor.id, "wallet.card.create", "card", card.id, { walletAccountId: account.id })
  await insertWalletNotification(db, account.userId, actor.id, "Nouvelle carte disponible", `Une carte ${card.network.toUpperCase()} se terminant par ${card.lastFour} est disponible.`)
  return card
}

export async function setCardPin(actor: Actor, cardId: number, pin: string) {
  const { card, account } = await cardWithAccount(cardId)
  await requireSelfOrStaffAccess(actor, account.userId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.cards.pin")
  if (card.status === "cancelled" || card.status === "expired") throw new ValidationError("Le PIN d’une carte inactive ne peut pas être modifié.")
  const pinHash = hashCardPin(pin, card.tokenReference)
  await db.update(cards).set({ pinHash, pinUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(cards.id, cardId))
  // Le PIN conservé dans le coffre n'est plus celui de la carte : on l'efface plutôt que de le laisser périmé.
  await clearCardSecrets(db, { walletType: "PERSONAL", cardId }, ["pin"])
  await logAction(db, actor.id, "wallet.card.pin.update", "card", cardId)
  await insertWalletNotification(db, account.userId, actor.id, "PIN carte mis à jour", `Le PIN de la carte se terminant par ${card.lastFour} a été modifié.`)
  return { cardId, pinConfigured: true }
}

async function issueReplacementCard(actor: Actor, cardId: number, action: "renew" | "replace", idempotencyKey: string, reason?: string) {
  requireRole(actor, "admin", "agent")
  const operation = action === "renew" ? "card.renew" : "card.replace"
  const payload = { cardId, action, reason: reason ?? null }
  const replay = await replayOrStart<Card & { replayed?: boolean }>(db, actor, operation, idempotencyKey, payload)
  if (replay) return { ...replay, replayed: true }
  const { card, account } = await cardWithAccount(cardId)
  if (actor.id !== account.userId) await requireWalletPermission(actor, "wallet.cards.manage")
  if (card.status === "cancelled") throw new ValidationError("Cette carte est déjà annulée.")
  const next = await createCard(actor, {
    walletAccountId: account.id,
    label: action === "renew" ? `${card.label} · renouvelée` : `${card.label} · remplacement`,
    lastFour: String((Number(card.lastFour) + 1) % 10000).padStart(4, "0"),
    network: card.network,
    expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
  })
  await db.update(cards).set({ status: "cancelled", updatedAt: new Date() }).where(eq(cards.id, card.id))
  await clearCardSecrets(db, { walletType: "PERSONAL", cardId: card.id })
  await logAction(db, actor.id, `wallet.card.${action}`, "card", card.id, { replacementCardId: next.id, reason: reason ?? null })
  await completeIdempotency(db, idempotencyKey, null, next as unknown as Record<string, unknown>)
  return { ...next, replayed: false }
}

export async function renewCard(actor: Actor, cardId: number, idempotencyKey: string) {
  return issueReplacementCard(actor, cardId, "renew", idempotencyKey)
}

export async function replaceCard(actor: Actor, cardId: number, reason: string, idempotencyKey: string) {
  return issueReplacementCard(actor, cardId, "replace", idempotencyKey, reason)
}

export async function cancelCard(actor: Actor, cardId: number) {
  requireRole(actor, "admin")
  const { card, account } = await cardWithAccount(cardId)
  if (card.status === "cancelled") throw new ValidationError("Cette carte est déjà annulée.")
  await db.update(cards).set({ status: "cancelled", updatedAt: new Date() }).where(eq(cards.id, card.id))
  await clearCardSecrets(db, { walletType: "PERSONAL", cardId: card.id }) // minimisation : une carte annulée ne garde ni numéro, ni CVV, ni PIN
  const [updated] = await db.select(adminCardColumns).from(cards).where(eq(cards.id, card.id)).limit(1)
  if (!updated) throw new NotFoundError("Carte introuvable.")
  await logAction(db, actor.id, "wallet.card.cancel", "card", card.id)
  await insertWalletNotification(db, account.userId, actor.id, "Carte annulée", `La carte se terminant par ${card.lastFour} a été annulée.`)
  return updated
}

export async function createAdminBeneficiary(actor: Actor, input: { walletAccountId: number; fullName: string; nickname?: string; iban: string; bic?: string; internalWalletAccountId?: number | null }) {
  requireRole(actor, "admin")
  const account = await getAccountOrThrow(db, input.walletAccountId)
  await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: account.userId })
  const iban = normalizeAndValidateIban(input.iban)
  if (input.fullName.trim().length < 2) throw new ValidationError("Le nom du bénéficiaire est requis.")
  if (input.internalWalletAccountId) {
    const internalAccount = await getAccountOrThrow(db, input.internalWalletAccountId)
    if (internalAccount.userId === account.userId) throw new ValidationError("Un bénéficiaire interne doit correspondre à un autre compte Wallet.")
  }
  const [result] = await db.insert(beneficiaries).values({
    userId: account.userId,
    internalWalletAccountId: input.internalWalletAccountId ?? null,
    fullName: input.fullName.trim(),
    nickname: input.nickname?.trim() || null,
    iban,
    bic: input.bic?.replace(/\s+/g, "").toUpperCase() || null,
    verifiedAt: new Date(),
  })
  const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, result.insertId)).limit(1)
  if (!beneficiary) throw new Error("Le bénéficiaire n’a pas pu être créé.")
  await logAction(db, actor.id, "wallet.beneficiary.admin_create", "beneficiary", beneficiary.id, { walletAccountId: account.id, ibanLast4: iban.slice(-4) })
  await insertWalletNotification(db, account.userId, actor.id, "Bénéficiaire ajouté", `${beneficiary.fullName} est maintenant disponible pour vos virements.`)
  return beneficiary
}

export async function listMyBeneficiaries(actor: Actor): Promise<Beneficiary[]> {
  return db.select().from(beneficiaries).where(eq(beneficiaries.userId, actor.id)).orderBy(desc(beneficiaries.createdAt))
}

export async function createBeneficiary(actor: Actor, input: { fullName: string; nickname?: string; iban: string; bic?: string; internalWalletAccountId?: number | null }) {
  const iban = normalizeAndValidateIban(input.iban)
  if (input.fullName.trim().length < 2) throw new ValidationError("Le nom du bénéficiaire est requis.")
  if (input.internalWalletAccountId) {
    const internalAccount = await getAccountOrThrow(db, input.internalWalletAccountId)
    if (internalAccount.userId === actor.id) throw new ValidationError("Un bénéficiaire interne doit correspondre à un autre compte Wallet.")
  }
  const [result] = await db.insert(beneficiaries).values({
    userId: actor.id,
    internalWalletAccountId: input.internalWalletAccountId ?? null,
    fullName: input.fullName.trim(),
    nickname: input.nickname?.trim() || null,
    iban,
    bic: input.bic?.replace(/\s+/g, "").toUpperCase() || null,
    verifiedAt: new Date(),
  })
  const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, result.insertId)).limit(1)
  if (!beneficiary) throw new Error("Le bénéficiaire n’a pas pu être créé.")
  await logAction(db, actor.id, "wallet.beneficiary.create", "beneficiary", beneficiary.id, { ibanLast4: iban.slice(-4) })
  await insertWalletNotification(db, actor.id, actor.id, "Bénéficiaire ajouté", `${beneficiary.fullName} est maintenant disponible pour vos virements.`)
  return beneficiary
}

export async function updateBeneficiary(actor: Actor, id: number, input: { fullName?: string; nickname?: string; iban?: string; bic?: string; status?: "active" | "disabled"; internalWalletAccountId?: number | null }) {
  const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id)).limit(1)
  if (!beneficiary) throw new NotFoundError("Bénéficiaire introuvable.")
  requireSelfOrRole(actor, beneficiary.userId, "admin", "agent")
  if (input.internalWalletAccountId) {
    const internalAccount = await getAccountOrThrow(db, input.internalWalletAccountId)
    if (internalAccount.userId === beneficiary.userId) throw new ValidationError("Un bénéficiaire interne doit correspondre à un autre compte Wallet.")
  }
  const patch = {
    fullName: input.fullName?.trim(),
    nickname: input.nickname?.trim(),
    iban: input.iban ? normalizeAndValidateIban(input.iban) : undefined,
    bic: input.bic?.replace(/\s+/g, "").toUpperCase(),
    status: input.status,
    internalWalletAccountId: input.internalWalletAccountId,
    updatedAt: new Date(),
  }
  await db.update(beneficiaries).set(patch).where(eq(beneficiaries.id, id))
  const [updated] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id)).limit(1)
  if (!updated) throw new NotFoundError("Bénéficiaire introuvable.")
  await logAction(db, actor.id, "wallet.beneficiary.update", "beneficiary", id)
  return updated
}

export async function deleteBeneficiary(actor: Actor, id: number) {
  const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id)).limit(1)
  if (!beneficiary) throw new NotFoundError("Bénéficiaire introuvable.")
  requireSelfOrRole(actor, beneficiary.userId, "admin", "agent")
  try {
    await db.delete(beneficiaries).where(eq(beneficiaries.id, id))
  } catch (error) {
    if (error && typeof error === "object" && "errno" in error && (error as { errno?: number }).errno === 1451) {
      throw new ValidationError("Ce bénéficiaire a des transferts associés et ne peut pas être supprimé — désactivez-le pour conserver l’historique et le journal d’audit.")
    }
    throw error
  }
  await logAction(db, actor.id, "wallet.beneficiary.delete", "beneficiary", id)
  return { success: true as const }
}

export async function listMyTransactions(actor: Actor, input: { offset?: number; limit?: number }) {
  const account = await ensureWalletAccount(actor)
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletAccountId, account.id))
    .orderBy(desc(transactions.createdAt))
    .limit(limit + 1)
    .offset(offset)
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null }
}

export async function transferInternal(actor: Actor, input: { fromWalletAccountId: number; toWalletAccountId: number; amountCents: number; description?: string; idempotencyKey: string }) {
  assertPositiveCents(input.amountCents, "Montant du virement")
  if (input.fromWalletAccountId === input.toWalletAccountId) throw new ValidationError("Le compte source et le compte destinataire doivent être différents.")

  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "transfer_internal", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }

    const source = await ownedAccount(executor, actor, input.fromWalletAccountId, ["admin"])
    const destination = await getAccountOrThrow(executor, input.toWalletAccountId)
    if (source.status !== "active" || destination.status !== "active") throw new ValidationError("Un compte concerné n’est pas actif.")
    if (source.currency !== destination.currency) throw new ValidationError("Les virements internes exigent la même devise.")

    const sourceBalance = await changeAvailable(executor, source.id, -input.amountCents)
    const destinationBalance = await changeAvailable(executor, destination.id, input.amountCents)
    const reference = generatedReference("INT")
    const debit = await insertTransaction(executor, {
      reference,
      idempotencyKey: input.idempotencyKey,
      walletAccountId: source.id,
      counterpartyWalletAccountId: destination.id,
      initiatedByUserId: actor.id,
      type: "transfer_internal",
      direction: "debit",
      status: "completed",
      amountCents: input.amountCents,
      feeCents: 0,
      currency: source.currency,
      description: input.description?.trim() || null,
      completedAt: new Date(),
    })
    const credit = await insertTransaction(executor, {
      reference: `${reference}-C`,
      walletAccountId: destination.id,
      counterpartyWalletAccountId: source.id,
      initiatedByUserId: actor.id,
      type: "transfer_internal",
      direction: "credit",
      status: "completed",
      amountCents: input.amountCents,
      feeCents: 0,
      currency: source.currency,
      description: input.description?.trim() || null,
      completedAt: new Date(),
    })
    await writeLedger(executor, { accountId: source.id, transactionId: debit.id, entryKind: "available", deltaCents: -input.amountCents, balanceAfterCents: sourceBalance })
    await writeLedger(executor, { accountId: destination.id, transactionId: credit.id, entryKind: "available", deltaCents: input.amountCents, balanceAfterCents: destinationBalance })

    const response = { transactionId: debit.id, reference, status: "completed" }
    await completeIdempotency(executor, input.idempotencyKey, debit.id, response)
    await logAction(executor, actor.id, "wallet.transfer.internal", "transaction", debit.id, { amountCents: input.amountCents, from: source.id, to: destination.id })
    await insertWalletNotification(executor, source.userId, actor.id, "Virement interne exécuté", `Votre virement de ${input.amountCents} unités minimales a été exécuté.`)
    if (destination.userId !== source.userId) await insertWalletNotification(executor, destination.userId, actor.id, "Virement reçu", `Vous avez reçu ${input.amountCents} unités minimales.`)
    return { ...response, replayed: false }
  })
}

export async function transferExternal(actor: Actor, input: { walletAccountId: number; beneficiaryId: number; amountCents: number; description?: string; idempotencyKey: string }) {
  assertPositiveCents(input.amountCents, "Montant du virement")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "transfer_external", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }

    const account = await ownedAccount(executor, actor, input.walletAccountId, ["admin"])
    if (account.status !== "active") throw new ValidationError("Le compte Wallet est gelé ou fermé.")
    const [beneficiary] = await executor.select().from(beneficiaries).where(eq(beneficiaries.id, input.beneficiaryId)).limit(1)
    if (!beneficiary) throw new NotFoundError("Bénéficiaire introuvable.")
    requireSelfOrRole(actor, beneficiary.userId, "admin")
    if (beneficiary.status !== "active") throw new ValidationError("Le bénéficiaire est désactivé.")

    const availableBalance = await changeAvailable(executor, account.id, -input.amountCents)
    const reservedBalance = await changeReserved(executor, account.id, input.amountCents)
    const transaction = await insertTransaction(executor, {
      reference: generatedReference("EXT"),
      idempotencyKey: input.idempotencyKey,
      walletAccountId: account.id,
      beneficiaryId: beneficiary.id,
      initiatedByUserId: actor.id,
      type: "transfer_external",
      direction: "debit",
      status: "pending",
      amountCents: input.amountCents,
      feeCents: 0,
      currency: account.currency,
      description: input.description?.trim() || null,
    })
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "available", deltaCents: -input.amountCents, balanceAfterCents: availableBalance })
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "reserved", deltaCents: input.amountCents, balanceAfterCents: reservedBalance })
    const response = { transactionId: transaction.id, reference: transaction.reference, status: "pending" }
    await completeIdempotency(executor, input.idempotencyKey, transaction.id, response)
    await logAction(executor, actor.id, "wallet.transfer.external.request", "transaction", transaction.id, { beneficiaryId: beneficiary.id, amountCents: input.amountCents })
    await insertWalletNotification(executor, actor.id, actor.id, "Virement en attente", `Votre virement vers ${beneficiary.fullName} attend une validation.`)
    // Un débit externe (prélèvement) ne s'exécute jamais silencieusement : le personnel doit le voir apparaître pour le valider ou le refuser.
    const staff = await executor.select({ id: users.id }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "agent")))
    await Promise.all(staff.map((member) => createSystemNotification(executor, {
      targetUserId: member.id,
      createdBy: actor.id,
      title: "Virement externe à valider",
      body: `Un virement de ${formatMinor(input.amountCents, account.currency)} vers ${beneficiary.fullName} attend une décision.`,
    })))
    return { ...response, replayed: false }
  })
}

export async function shareFunds(actor: Actor, input: { fromWalletAccountId: number; recipients: { walletAccountId: number; amountCents: number }[]; description?: string; idempotencyKey: string }) {
  if (input.recipients.length === 0 || input.recipients.length > 20) throw new ValidationError("Le partage doit contenir entre un et vingt destinataires.")
  const recipientIds = new Set<number>()
  let totalCents = 0
  for (const recipient of input.recipients) {
    assertPositiveCents(recipient.amountCents, "Part du partage")
    if (recipient.walletAccountId === input.fromWalletAccountId || recipientIds.has(recipient.walletAccountId)) {
      throw new ValidationError("Chaque destinataire du partage doit être un compte distinct du compte source.")
    }
    recipientIds.add(recipient.walletAccountId)
    totalCents += recipient.amountCents
  }

  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "share_funds", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }
    const source = await ownedAccount(executor, actor, input.fromWalletAccountId, ["admin"])
    if (source.status !== "active") throw new ValidationError("Le compte Wallet source n’est pas actif.")
    const destinations = await Promise.all(input.recipients.map((recipient) => getAccountOrThrow(executor, recipient.walletAccountId)))
    if (destinations.some((destination) => destination.status !== "active" || destination.currency !== source.currency)) {
      throw new ValidationError("Tous les comptes destinataires doivent être actifs et dans la même devise.")
    }

    const sourceBalance = await changeAvailable(executor, source.id, -totalCents)
    const reference = generatedReference("SPL")
    const debit = await insertTransaction(executor, {
      reference,
      idempotencyKey: input.idempotencyKey,
      walletAccountId: source.id,
      initiatedByUserId: actor.id,
      type: "split_debit",
      direction: "debit",
      status: "completed",
      amountCents: totalCents,
      feeCents: 0,
      currency: source.currency,
      description: input.description?.trim() || "Partage de fonds",
      completedAt: new Date(),
    })
    await writeLedger(executor, { accountId: source.id, transactionId: debit.id, entryKind: "available", deltaCents: -totalCents, balanceAfterCents: sourceBalance })

    for (let index = 0; index < input.recipients.length; index += 1) {
      const recipient = input.recipients[index]
      const destination = destinations[index]
      const destinationBalance = await changeAvailable(executor, destination.id, recipient.amountCents)
      const credit = await insertTransaction(executor, {
        reference: `${reference}-C${index + 1}`,
        walletAccountId: destination.id,
        counterpartyWalletAccountId: source.id,
        initiatedByUserId: actor.id,
        type: "split_credit",
        direction: "credit",
        status: "completed",
        amountCents: recipient.amountCents,
        feeCents: 0,
        currency: source.currency,
        description: input.description?.trim() || "Partage de fonds",
        completedAt: new Date(),
      })
      await writeLedger(executor, { accountId: destination.id, transactionId: credit.id, entryKind: "available", deltaCents: recipient.amountCents, balanceAfterCents: destinationBalance })
      if (destination.userId !== source.userId) await insertWalletNotification(executor, destination.userId, actor.id, "Partage reçu", `Vous avez reçu ${recipient.amountCents} unités minimales via un partage VTEX.`)
    }

    const response = { transactionId: debit.id, reference, status: "completed" }
    await completeIdempotency(executor, input.idempotencyKey, debit.id, response)
    await logAction(executor, actor.id, "wallet.funds.share", "transaction", debit.id, { totalCents, recipients: input.recipients.length })
    await insertWalletNotification(executor, source.userId, actor.id, "Partage exécuté", `Votre partage de ${totalCents} unités minimales a été exécuté.`)
    return { ...response, replayed: false }
  })
}

export async function resolvePendingTransaction(actor: Actor, transactionId: number, approved: boolean, reason?: string) {
  requireRole(actor, "admin", "agent")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [transaction] = await executor.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1)
    if (!transaction) throw new NotFoundError("Transaction introuvable.")
    if (transaction.status !== "pending" || transaction.type !== "transfer_external") throw new ValidationError("Cette transaction n’est pas un virement externe en attente.")
    const total = transaction.amountCents + transaction.feeCents
    const account = await getAccountOrThrow(executor, transaction.walletAccountId)
    const reservedBalance = await changeReserved(executor, account.id, -total)
    let availableBalance = account.availableBalanceCents
    if (!approved) availableBalance = await changeAvailable(executor, account.id, total)
    await executor
      .update(transactions)
      .set({
        status: approved ? "completed" : "rejected",
        completedAt: approved ? new Date() : null,
        rejectedReason: approved ? null : (reason?.trim() || "Virement refusé par l’équipe opérationnelle."),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id))
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "reserved", deltaCents: -total, balanceAfterCents: reservedBalance })
    if (!approved) await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "available", deltaCents: total, balanceAfterCents: availableBalance })
    await logAction(executor, actor.id, approved ? "wallet.transfer.external.approve" : "wallet.transfer.external.reject", "transaction", transaction.id, { reason: reason?.trim() || null })
    await insertWalletNotification(executor, account.userId, actor.id, approved ? "Virement validé" : "Virement refusé", approved ? `Votre virement ${transaction.reference} a été validé.` : `Votre virement ${transaction.reference} a été refusé${reason ? ` : ${reason}` : ""}.`)
    return { transactionId: transaction.id, status: approved ? "completed" : "rejected" }
  })
}

export async function adjustWalletBalance(actor: Actor, input: { walletAccountId: number; deltaCents: number; reason: string; idempotencyKey: string; valueDate?: Date }) {
  requireRole(actor, "admin")
  if (!Number.isSafeInteger(input.deltaCents) || input.deltaCents === 0) throw new ValidationError("L’ajustement doit être un entier non nul.")
  if (input.reason.trim().length < 8) throw new ValidationError("Une justification d’au moins huit caractères est requise.")
  if (input.valueDate) assertValueDate(input.valueDate)
  await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: (await getAccountOrThrow(db, input.walletAccountId)).userId })

  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "adjustment", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }
    const account = await getAccountOrThrow(executor, input.walletAccountId)
    const balanceAfter = await changeAvailable(executor, account.id, input.deltaCents)
    const transaction = await insertTransaction(executor, {
      reference: generatedReference("ADJ"),
      idempotencyKey: input.idempotencyKey,
      walletAccountId: account.id,
      initiatedByUserId: actor.id,
      type: "adjustment",
      direction: input.deltaCents > 0 ? "credit" : "debit",
      status: "completed",
      amountCents: Math.abs(input.deltaCents),
      feeCents: 0,
      currency: account.currency,
      description: input.reason.trim(),
      completedAt: new Date(),
      valueDate: input.valueDate ?? null,
    })
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "available", deltaCents: input.deltaCents, balanceAfterCents: balanceAfter })
    const response = { transactionId: transaction.id, reference: transaction.reference, status: "completed" }
    await completeIdempotency(executor, input.idempotencyKey, transaction.id, response)
    await logAction(executor, actor.id, "wallet.balance.adjust", "wallet_account", account.id, { deltaCents: input.deltaCents, reason: input.reason.trim() })
    await insertWalletNotification(executor, account.userId, actor.id, "Solde ajusté", `Une correction de solde a été enregistrée sur votre compte : ${input.reason.trim()}`)
    return { ...response, replayed: false }
  })
}

export async function listSavingsGoals(actor: Actor): Promise<SavingsGoal[]> {
  return db.select().from(savingsGoals).where(eq(savingsGoals.userId, actor.id)).orderBy(desc(savingsGoals.createdAt))
}

export async function createSavingsGoal(actor: Actor, input: { walletAccountId: number; name: string; targetCents: number; dueAt?: Date }) {
  assertPositiveCents(input.targetCents, "Objectif d’épargne")
  const account = await ownedAccount(db, actor, input.walletAccountId, ["admin"])
  if (input.name.trim().length < 2) throw new ValidationError("Le nom de l’objectif est requis.")
  const [result] = await db.insert(savingsGoals).values({
    userId: account.userId,
    walletAccountId: account.id,
    name: input.name.trim(),
    currency: account.currency,
    targetCents: input.targetCents,
    dueAt: input.dueAt ?? null,
  })
  const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, result.insertId)).limit(1)
  if (!goal) throw new Error("L’objectif n’a pas pu être créé.")
  await logAction(db, actor.id, "wallet.savings_goal.create", "savings_goal", goal.id, { targetCents: goal.targetCents })
  return goal
}

export async function fundSavingsGoal(actor: Actor, input: { goalId: number; amountCents: number; idempotencyKey: string }) {
  assertPositiveCents(input.amountCents, "Montant d’épargne")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ transactionId: number; reference: string; status: string }>(executor, actor, "savings_deposit", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }
    const [goal] = await executor.select().from(savingsGoals).where(eq(savingsGoals.id, input.goalId)).limit(1)
    if (!goal) throw new NotFoundError("Objectif d’épargne introuvable.")
    requireSelfOrRole(actor, goal.userId, "admin")
    if (goal.status !== "active") throw new ValidationError("Cet objectif n’est plus actif.")
    const balanceAfter = await changeAvailable(executor, goal.walletAccountId, -input.amountCents)
    const nextCurrent = goal.currentCents + input.amountCents
    const nextStatus = nextCurrent >= goal.targetCents ? "completed" : "active"
    await executor.update(savingsGoals).set({ currentCents: nextCurrent, status: nextStatus, updatedAt: new Date() }).where(eq(savingsGoals.id, goal.id))
    const transaction = await insertTransaction(executor, {
      reference: generatedReference("SVG"),
      idempotencyKey: input.idempotencyKey,
      walletAccountId: goal.walletAccountId,
      initiatedByUserId: actor.id,
      type: "savings_deposit",
      direction: "debit",
      status: "completed",
      amountCents: input.amountCents,
      feeCents: 0,
      currency: goal.currency,
      description: `Alimentation de l’objectif ${goal.name}`,
      completedAt: new Date(),
    })
    await writeLedger(executor, { accountId: goal.walletAccountId, transactionId: transaction.id, entryKind: "available", deltaCents: -input.amountCents, balanceAfterCents: balanceAfter })
    const response = { transactionId: transaction.id, reference: transaction.reference, status: "completed" }
    await completeIdempotency(executor, input.idempotencyKey, transaction.id, response)
    await logAction(executor, actor.id, "wallet.savings_goal.fund", "savings_goal", goal.id, { amountCents: input.amountCents })
    return { ...response, replayed: false }
  })
}

export async function updateSavingsGoal(actor: Actor, goalId: number, input: { name?: string; targetCents?: number; dueAt?: Date | null }) {
  const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1)
  if (!goal) throw new NotFoundError("Objectif d’épargne introuvable.")
  requireSelfOrRole(actor, goal.userId, "admin")
  if (goal.status === "archived") throw new ValidationError("Un objectif archivé ne peut plus être modifié.")
  if (input.name !== undefined && input.name.trim().length < 2) throw new ValidationError("Le nom de l’objectif est requis.")
  if (input.targetCents !== undefined) {
    assertPositiveCents(input.targetCents, "Objectif d’épargne")
    if (input.targetCents < goal.currentCents) throw new ValidationError("La cible ne peut pas être inférieure à l’épargne déjà constituée.")
  }
  const changes = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.targetCents !== undefined ? { targetCents: input.targetCents } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    updatedAt: new Date(),
  }
  await db.update(savingsGoals).set(changes).where(eq(savingsGoals.id, goal.id))
  const [updated] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, goal.id)).limit(1)
  if (!updated) throw new Error("L’objectif n’a pas pu être relu après mise à jour.")
  await logAction(db, actor.id, "wallet.savings_goal.update", "savings_goal", goal.id, { changedFields: Object.keys(input) })
  return updated
}

export async function closeSavingsGoal(actor: Actor, input: { goalId: number; idempotencyKey: string }) {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ goalId: number; transactionId: number | null; reference: string | null; refundedCents: number; status: string }>(executor, actor, "savings_close", input.idempotencyKey, input)
    if (replay) return { ...replay, replayed: true }
    const [goal] = await executor.select().from(savingsGoals).where(eq(savingsGoals.id, input.goalId)).limit(1)
    if (!goal) throw new NotFoundError("Objectif d’épargne introuvable.")
    requireSelfOrRole(actor, goal.userId, "admin")
    if (goal.status === "archived") throw new ValidationError("Cet objectif est déjà archivé.")

    let transactionId: number | null = null
    let reference: string | null = null
    if (goal.currentCents > 0) {
      const balanceAfter = await changeAvailable(executor, goal.walletAccountId, goal.currentCents)
      const transaction = await insertTransaction(executor, {
        reference: generatedReference("SVW"),
        idempotencyKey: input.idempotencyKey,
        walletAccountId: goal.walletAccountId,
        initiatedByUserId: actor.id,
        type: "savings_withdrawal",
        direction: "credit",
        status: "completed",
        amountCents: goal.currentCents,
        feeCents: 0,
        currency: goal.currency,
        description: `Clôture de l’objectif ${goal.name}`,
        completedAt: new Date(),
      })
      transactionId = transaction.id
      reference = transaction.reference
      await writeLedger(executor, { accountId: goal.walletAccountId, transactionId: transaction.id, entryKind: "available", deltaCents: goal.currentCents, balanceAfterCents: balanceAfter })
    }
    await executor.update(savingsGoals).set({ status: "archived", updatedAt: new Date() }).where(eq(savingsGoals.id, goal.id))
    const response = { goalId: goal.id, transactionId, reference, refundedCents: goal.currentCents, status: "archived" }
    await completeIdempotency(executor, input.idempotencyKey, transactionId, response)
    await logAction(executor, actor.id, "wallet.savings_goal.close", "savings_goal", goal.id, { refundedCents: goal.currentCents })
    return { ...response, replayed: false }
  })
}

export async function listAdminWallets(actor: Actor, input: { limit?: number } = {}) {
  requireRole(actor, "admin", "agent")
  return db.select().from(walletAccounts).orderBy(desc(walletAccounts.createdAt)).limit(Math.min(input.limit ?? 100, 500))
}

export async function listAdminCards(actor: Actor, input: { limit?: number } = {}) {
  requireRole(actor, "admin", "agent")
  return db.select(adminCardColumns).from(cards).orderBy(desc(cards.createdAt)).limit(Math.min(input.limit ?? 100, 500))
}

export async function listAdminTransactions(actor: Actor, input: { status?: WalletTransaction["status"]; limit?: number } = {}) {
  requireRole(actor, "admin", "agent")
  return db
    .select()
    .from(transactions)
    .where(input.status ? eq(transactions.status, input.status) : undefined)
    .orderBy(desc(transactions.createdAt))
    .limit(Math.min(input.limit ?? 100, 500))
}

export async function financialKpis(actor: Actor) {
  requireRole(actor, "admin", "agent")
  const [balances] = await db.select({ available: sql<number>`COALESCE(SUM(${walletAccounts.availableBalanceCents}), 0)`, reserved: sql<number>`COALESCE(SUM(${walletAccounts.reservedBalanceCents}), 0)`, accounts: sql<number>`COUNT(*)` }).from(walletAccounts)
  const [pending] = await db.select({ count: sql<number>`COUNT(*)`, amount: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)` }).from(transactions).where(eq(transactions.status, "pending"))
  const [completed] = await db.select({ count: sql<number>`COUNT(*)`, volume: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)` }).from(transactions).where(eq(transactions.status, "completed"))
  return {
    availableBalanceCents: Number(balances?.available ?? 0),
    reservedBalanceCents: Number(balances?.reserved ?? 0),
    walletAccounts: Number(balances?.accounts ?? 0),
    pendingTransactions: Number(pending?.count ?? 0),
    pendingAmountCents: Number(pending?.amount ?? 0),
    completedTransactions: Number(completed?.count ?? 0),
    completedVolumeCents: Number(completed?.volume ?? 0),
  }
}

export async function reconciliationSummary(actor: Actor, input: { limit?: number } = {}) {
  requireRole(actor, "admin", "agent")
  const limit = Math.min(input.limit ?? 100, 500)
  const [accountRows, entryRows] = await Promise.all([
    db.select({ id: walletAccounts.id, currency: walletAccounts.currency, availableBalanceCents: walletAccounts.availableBalanceCents, reservedBalanceCents: walletAccounts.reservedBalanceCents }).from(walletAccounts).orderBy(desc(walletAccounts.updatedAt)).limit(limit),
    db.select({ id: walletLedgerEntries.id, walletAccountId: walletLedgerEntries.walletAccountId, entryKind: walletLedgerEntries.entryKind, deltaCents: walletLedgerEntries.deltaCents, balanceAfterCents: walletLedgerEntries.balanceAfterCents, createdAt: walletLedgerEntries.createdAt, transactionId: walletLedgerEntries.transactionId }).from(walletLedgerEntries).orderBy(desc(walletLedgerEntries.createdAt)).limit(limit * 8),
  ])
  const latestAvailable = new Map<number, typeof entryRows[number]>()
  const latestReserved = new Map<number, typeof entryRows[number]>()
  for (const entry of entryRows) {
    if (entry.entryKind === "available" && !latestAvailable.has(entry.walletAccountId)) latestAvailable.set(entry.walletAccountId, entry)
    if (entry.entryKind === "reserved" && !latestReserved.has(entry.walletAccountId)) latestReserved.set(entry.walletAccountId, entry)
  }
  const accounts = accountRows.map((account) => {
    const availableEntry = latestAvailable.get(account.id)
    const reservedEntry = latestReserved.get(account.id)
    const ledgerAvailableCents = Number(availableEntry?.balanceAfterCents ?? account.availableBalanceCents)
    return {
      ...account,
      ledgerAvailableCents,
      availableMatches: ledgerAvailableCents === Number(account.availableBalanceCents),
      latestAvailableEntryAt: availableEntry?.createdAt ?? null,
      latestReservedEntryAt: reservedEntry?.createdAt ?? null,
      ledgerEntries: entryRows.filter((entry) => entry.walletAccountId === account.id).slice(0, 8),
    }
  })
  return { checkedAt: new Date(), entriesAnalysed: entryRows.length, accounts, mismatches: accounts.filter((account) => !account.availableMatches).length }
}

export async function getAdminWalletDetail(actor: Actor, walletAccountId: number) {
  requireRole(actor, "admin", "agent")
  const account = await getAccountOrThrow(db, walletAccountId)
  const [ownerRows, cardRows, beneficiaryRows, goalRows, transactionRows] = await Promise.all([
    db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(eq(users.id, account.userId)).limit(1),
    db.select(adminCardColumns).from(cards).where(eq(cards.walletAccountId, account.id)).orderBy(desc(cards.createdAt)),
    db.select().from(beneficiaries).where(eq(beneficiaries.userId, account.userId)).orderBy(desc(beneficiaries.createdAt)),
    db.select().from(savingsGoals).where(eq(savingsGoals.walletAccountId, account.id)).orderBy(desc(savingsGoals.createdAt)),
    db.select().from(transactions).where(eq(transactions.walletAccountId, account.id)).orderBy(desc(transactions.createdAt)).limit(100),
  ])
  const owner = ownerRows[0]
  if (!owner) throw new NotFoundError("Titulaire Wallet introuvable.")
  return { account, owner, cards: cardRows, beneficiaries: beneficiaryRows, savingsGoals: goalRows, transactions: transactionRows }
}

export async function createAdminWallet(actor: Actor, input: { userId: number; currency: Currency }) {
  requireRole(actor, "admin")
  assertSupportedCurrency(input.currency)
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1)
  if (!owner) throw new NotFoundError("Titulaire Wallet introuvable.")
  const [existing] = await db.select({ id: walletAccounts.id }).from(walletAccounts).where(and(eq(walletAccounts.userId, input.userId), eq(walletAccounts.currency, input.currency))).limit(1)
  if (existing) throw new ValidationError("Ce titulaire possède déjà un compte dans cette devise.")
  // Compte, carte, journal et notification : tout ou rien.
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const account = await insertAccountWithVirtualCard(executor, input.userId, input.currency)
    await logAction(executor, actor.id, "wallet.account.admin_create", "wallet_account", account.id, { userId: input.userId, currency: input.currency }, { walletType: "PERSONAL", holderId: input.userId })
    await insertWalletNotification(executor, input.userId, actor.id, "Nouveau compte Wallet", `Un compte ${input.currency} a été créé sur votre Wallet.`)
    return account
  })
}

export async function updateAdminWalletStatus(actor: Actor, walletAccountId: number, status: WalletAccount["status"]) {
  requireRole(actor, "admin")
  const account = await getAccountOrThrow(db, walletAccountId)
  await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: account.userId })
  if (account.status === "closed" && status !== "closed") throw new ValidationError("Un compte clôturé ne peut pas être réactivé.")
  if (status === "closed" && (account.availableBalanceCents !== 0 || account.reservedBalanceCents !== 0)) {
    throw new ValidationError("Un compte ne peut être clôturé que lorsque ses soldes disponible et réservé sont nuls.")
  }
  await db.update(walletAccounts).set({ status, updatedAt: new Date() }).where(eq(walletAccounts.id, account.id))
  const updated = await getAccountOrThrow(db, account.id)
  await logAction(db, actor.id, "wallet.account.status", "wallet_account", account.id, { from: account.status, to: status })
  await insertWalletNotification(db, account.userId, actor.id, "Statut du compte mis à jour", status === "active" ? `Le compte ${account.currency} est actif.` : `Le compte ${account.currency} a été ${status === "frozen" ? "gelé" : "clôturé"}. Contactez le support client pour plus d’informations.`)
  return updated
}

/** Intervention de sécurité administrative : fige le compte et toute carte
 * encore active dans une transaction unique. Les cartes déjà gelées ou
 * annulées sont préservées, et la réactivation reste volontairement manuelle. */
export async function emergencyWalletLockdown(actor: Actor, input: { walletAccountId: number; reason: string; idempotencyKey: string }) {
  requireRole(actor, "admin")
  const reason = input.reason.trim()
  if (reason.length < 8) throw new ValidationError("Une justification d’au moins huit caractères est requise.")
  await assertOperatorAccess(db, actor, { walletType: "PERSONAL", holderId: (await getAccountOrThrow(db, input.walletAccountId)).userId })

  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const replay = await replayOrStart<{ walletAccountId: number; accountStatus: "frozen"; cardsFrozen: number }>(executor, actor, "emergency_lockdown", input.idempotencyKey, { walletAccountId: input.walletAccountId, reason })
    if (replay) return { ...replay, replayed: true }

    const account = await getAccountOrThrow(executor, input.walletAccountId)
    if (account.status === "closed") throw new ValidationError("Un compte clôturé ne peut pas faire l’objet d’une intervention d’urgence.")
    await executor.update(walletAccounts).set({ status: "frozen", updatedAt: new Date() }).where(eq(walletAccounts.id, account.id))
    const [cardUpdate] = await executor.update(cards).set({ status: "frozen", updatedAt: new Date() }).where(and(eq(cards.walletAccountId, account.id), eq(cards.status, "active")))
    const response = { walletAccountId: account.id, accountStatus: "frozen" as const, cardsFrozen: Number(cardUpdate.affectedRows ?? 0) }
    await completeIdempotency(executor, input.idempotencyKey, null, response)
    await logAction(executor, actor.id, "wallet.account.emergency_lockdown", "wallet_account", account.id, { reason, cardsFrozen: response.cardsFrozen })
    await insertWalletNotification(executor, account.userId, actor.id, "Mesure de sécurité activée", `Votre compte ${account.currency} et ses cartes actives ont été gelés par mesure de protection. Contactez le support client pour plus d’informations.`)
    return { ...response, replayed: false }
  })
}
