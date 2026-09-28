import { randomBytes, scryptSync } from "node:crypto"
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { isCurrencyCode } from "@vtex/money"
import {
  db,
  generatedIban,
  isAdminRole,
  logAction,
  normalizeAndValidateBic,
  normalizeAndValidateIban,
  notifications,
  ForbiddenError,
  NotFoundError,
  requireRole,
  revealBankAccountIban,
  bankAccounts,
  syncMainBankAccount,
  canConvert,
  formatMinor,
  topupLimits,
  ValidationError,
  type Actor,
  type Db,
  type MainBankRef,
  users,
} from "@vtex/core"

import {
  applications,
  approvals,
  businessCards,
  businessLedgerEntries,
  businessMembers,
  businessSettings,
  businessTransactions,
  businessWalletAccounts,
  businesses,
  chargebacks,
  customers,
  disputes,
  estimateItems,
  estimates,
  invoiceItems,
  invoicePayments,
  invoices,
  orderItems,
  orders,
  paymentLinkEvents,
  paymentLinks,
  payoutBatches,
  payouts,
  products,
  riskFlags,
  subscriptions,
  webhookDeliveries,
  webhooks,
  type Business,
  type BusinessCard,
} from "./db/schema"

type Executor = Db
export type BusinessRole = "owner" | "admin" | "finance" | "support" | "viewer"

export function generatedReference(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`
}

function generatedSlug(): string {
  return randomBytes(9).toString("base64url")
}

function hashSecret(value: string): string {
  return scryptSync(value, "vtex-business-static-salt", 64).toString("hex")
}

export async function insertBusinessNotification(executor: Executor, targetUserId: number, actorId: number, title: string, body: string) {
  await executor.insert(notifications).values({ targetUserId, title, body, status: "sent", sentAt: new Date(), createdBy: actorId })
}

/* ────────────────  Entreprise & appartenance  ──────────────── */

export async function getBusinessOrThrow(executor: Executor, businessId: number): Promise<Business> {
  const [business] = await executor.select().from(businesses).where(eq(businesses.id, businessId)).limit(1)
  if (!business) throw new NotFoundError("Entreprise introuvable.")
  return business
}

async function memberOrThrow(executor: Executor, businessId: number, userId: number) {
  const [member] = await executor.select().from(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId))).limit(1)
  if (!member) throw new ForbiddenError("Vous n’appartenez pas à cette entreprise.")
  return member
}

/** Autorise si l'acteur est admin plateforme, OU membre de l'entreprise avec un rôle listé. */
export async function requireBusinessRole(executor: Executor, actor: Actor, businessId: number, ...roles: BusinessRole[]) {
  if (isAdminRole(actor.role)) return null // décision produit : un administrateur ouvre n'importe quelle société par son identifiant
  const member = await memberOrThrow(executor, businessId, actor.id)
  if (member.status !== "active") throw new ForbiddenError("Adhésion non active pour cette entreprise.")
  if (!roles.includes(member.role)) throw new ForbiddenError(`Rôle "${member.role}" non autorisé — requiert : ${roles.join(", ")}.`)
  return member
}

export interface NewBusinessInput {
  legalName: string
  brandName: string
  industry?: string
  siren?: string
  vatId?: string
  email?: string
  phone?: string
  address?: string
  currency?: string
}

/**
 * Création atomique d'une société : entreprise + membre owner + paramètres + compte principal.
 * Primitive SANS contrôle de permission ni journal : l'appelant ouvre la transaction (`executor` = tx), contrôle les droits et journalise.
 * Si l'une des quatre écritures échoue, rien n'est conservé (aucune société sans wallet ni sans propriétaire).
 */
export async function insertBusinessRows(executor: Executor, input: NewBusinessInput & { ownerUserId: number }) {
  const currency = input.currency ?? "EUR"
  if (!isCurrencyCode(currency)) throw new ValidationError("Devise non prise en charge.")
  const [result] = await executor.insert(businesses).values({
    ownerUserId: input.ownerUserId,
    legalName: input.legalName.trim(),
    brandName: input.brandName.trim(),
    industry: input.industry?.trim() || null,
    siren: input.siren?.trim() || null,
    vatId: input.vatId?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    currency,
  })
  const businessId = result.insertId
  await executor.insert(businessMembers).values({ businessId, userId: input.ownerUserId, role: "owner", status: "active" })
  await executor.insert(businessSettings).values({ businessId })
  const [account] = await executor.insert(businessWalletAccounts).values({ businessId, label: "Compte principal", currency })
  return { businessId, walletAccountId: account.insertId }
}

export async function createBusiness(actor: Actor, input: NewBusinessInput) {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const created = await insertBusinessRows(executor, { ...input, ownerUserId: actor.id })
    await logAction(executor, actor.id, "business.create", "business", created.businessId, { legalName: input.legalName }, { walletType: "PROFESSIONAL", holderId: created.businessId })
    return created
  })
}

export async function getMyBusinesses(actor: Actor) {
  const rows = await db.select({ business: businesses, role: businessMembers.role, status: businessMembers.status }).from(businessMembers).innerJoin(businesses, eq(businesses.id, businessMembers.businessId)).where(eq(businessMembers.userId, actor.id))
  return rows.map((row) => ({ ...row.business, myRole: row.role, myStatus: row.status }))
}

export async function updateBusiness(actor: Actor, businessId: number, input: Partial<Pick<Business, "legalName" | "brandName" | "industry" | "siren" | "vatId" | "email" | "phone" | "address" | "logoUrl">>) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(businesses).set({ ...input, updatedAt: new Date() }).where(eq(businesses.id, businessId))
  await logAction(db, actor.id, "business.update", "business", businessId, input as Record<string, unknown>)
  return getBusinessOrThrow(db, businessId)
}

/* ────────────────  Équipe & rôles  ──────────────── */

export const businessRoleMatrix: Array<{ role: BusinessRole; can: string[] }> = [
  { role: "owner", can: ["Accès complet", "Approbations financières", "Fermeture d'entreprise", "Gestion des rôles"] },
  { role: "admin", can: ["Gestion opérationnelle", "Invitations d'équipe", "Modification de facture", "Accès rapports"] },
  { role: "finance", can: ["Paiements & payouts", "Création factures & remboursements", "Consultation transactions", "Rapports financiers"] },
  { role: "support", can: ["Fiches clients", "Ouverture / traitement litiges", "Réponses tickets", "Lecture seule paiements"] },
  { role: "viewer", can: ["Lecture seule des tableaux", "Aucune action financière"] },
]

export async function listMembers(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const rows = await db.select({ id: businessMembers.id, userId: businessMembers.userId, role: businessMembers.role, status: businessMembers.status, lastActiveAt: businessMembers.lastActiveAt, createdAt: businessMembers.createdAt, name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`, email: users.email }).from(businessMembers).innerJoin(users, eq(users.id, businessMembers.userId)).where(eq(businessMembers.businessId, businessId))
  return rows
}

export async function inviteMember(actor: Actor, businessId: number, input: { userId: number; role: BusinessRole }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.insert(businessMembers).values({ businessId, userId: input.userId, role: input.role, status: "invited", invitedBy: actor.id })
  await insertBusinessNotification(db, input.userId, actor.id, "Invitation VTEX Business", `Vous avez été invité à rejoindre une entreprise en tant que ${input.role}.`)
  await logAction(db, actor.id, "business.member.invite", "business", businessId, { userId: input.userId, role: input.role })
  return listMembers(actor, businessId)
}

export async function updateMemberRole(actor: Actor, businessId: number, memberId: number, role: BusinessRole) {
  await requireBusinessRole(db, actor, businessId, "owner")
  await db.update(businessMembers).set({ role, updatedAt: new Date() }).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, businessId)))
  await logAction(db, actor.id, "business.member.role_update", "business_member", memberId, { role })
  return listMembers(actor, businessId)
}

export async function updateMemberStatus(actor: Actor, businessId: number, memberId: number, status: "active" | "suspended") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(businessMembers).set({ status, updatedAt: new Date() }).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, businessId)))
  await logAction(db, actor.id, "business.member.status_update", "business_member", memberId, { status })
  return listMembers(actor, businessId)
}

export async function removeMember(actor: Actor, businessId: number, memberId: number) {
  await requireBusinessRole(db, actor, businessId, "owner")
  await db.delete(businessMembers).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, businessId)))
  await logAction(db, actor.id, "business.member.remove", "business_member", memberId, {})
  return listMembers(actor, businessId)
}

/* ────────────────  Approbations  ──────────────── */

export async function createApproval(executor: Executor, actor: Actor, businessId: number, kind: "payout" | "payout_batch" | "refund" | "team_invite" | "api_key", targetId: number) {
  const [result] = await executor.insert(approvals).values({ businessId, kind, targetId, requestedBy: actor.id })
  return result.insertId
}

export async function listApprovals(actor: Actor, businessId: number, status?: "pending" | "approved" | "rejected") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const conditions = [eq(approvals.businessId, businessId)]
  if (status) conditions.push(eq(approvals.status, status))
  return db.select().from(approvals).where(and(...conditions)).orderBy(desc(approvals.createdAt))
}

export async function decideApproval(actor: Actor, businessId: number, approvalId: number, decision: "approved" | "rejected", reason?: string) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, approvalId), eq(approvals.businessId, businessId))).limit(1)
  if (!approval) throw new NotFoundError("Demande d’approbation introuvable.")
  await db.update(approvals).set({ status: decision, approvedBy: actor.id, approvedAt: new Date(), reason: reason?.trim() || null }).where(eq(approvals.id, approvalId))
  if (approval.kind === "payout" && decision === "approved") await approvePayout(actor, businessId, approval.targetId)
  if (approval.kind === "payout" && decision === "rejected") await rejectPayout(actor, businessId, approval.targetId, reason)
  await logAction(db, actor.id, "business.approval.decide", "approval", approvalId, { decision })
  return listApprovals(actor, businessId)
}

/* ────────────────  Wallet Pro : comptes & cartes  ──────────────── */

export async function changeAvailable(executor: Executor, accountId: number, deltaCents: number): Promise<number> {
  const conditions = [eq(businessWalletAccounts.id, accountId)]
  if (deltaCents < 0) conditions.push(gte(businessWalletAccounts.availableBalanceCents, -deltaCents))
  const [result] = await executor.update(businessWalletAccounts).set({ availableBalanceCents: sql`${businessWalletAccounts.availableBalanceCents} + ${deltaCents}`, updatedAt: new Date() }).where(and(...conditions))
  if (result.affectedRows !== 1) throw new ValidationError("Solde disponible insuffisant.")
  const [account] = await executor.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.id, accountId)).limit(1)
  return account?.availableBalanceCents ?? 0
}

/** RIB principal et sous-RIB ACTIFS d'une société, IBAN complet, pour tout membre actif (lecture seule, source : `bank_accounts`). */
export async function listBusinessBankAccounts(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const rows = await db.select().from(bankAccounts).where(and(eq(bankAccounts.walletType, "PROFESSIONAL"), eq(bankAccounts.holderId, businessId), eq(bankAccounts.status, "active"))).orderBy(bankAccounts.kind, bankAccounts.createdAt)
  return rows.map((row) => {
    const { iban, ibanFormatted } = revealBankAccountIban(row)
    return { id: row.id, kind: row.kind, label: row.label, bankName: row.bankName, accountHolderName: row.accountHolderName, currency: row.currency, iban, ibanFormatted, bic: row.bic, ledgerAccountId: row.ledgerAccountId }
  })
}

export async function getBusinessWallet(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId))
}

/** Compte Wallet Pro → référence du RIB principal dans `bank_accounts` (source de vérité) ; les colonnes iban/bic du compte restent alimentées en parallèle. */
async function mainBankRef(executor: Executor, businessId: number, account: { id: number; currency: string }): Promise<MainBankRef> {
  const [company] = await executor.select({ legalName: businesses.legalName }).from(businesses).where(eq(businesses.id, businessId)).limit(1)
  return { walletType: "PROFESSIONAL", holderId: businessId, ledgerAccountId: account.id, currency: account.currency, accountHolderName: company?.legalName ?? "Société VTEX" }
}

export async function provisionBankDetails(actor: Actor, businessId: number, accountId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const [account] = await db.select().from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, accountId), eq(businessWalletAccounts.businessId, businessId))).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
  // IBAN valide (clé MOD 97) : l'ancien tirage aléatoire produisait des IBAN refusés par toute banque.
  const iban = account.iban ?? generatedIban(account.id, "business")
  const bic = account.bic ?? "VTEXFRPPXXX"
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    await executor.update(businessWalletAccounts).set({ iban, bic, updatedAt: new Date() }).where(eq(businessWalletAccounts.id, account.id))
    await syncMainBankAccount(executor, await mainBankRef(executor, businessId, account), iban, bic, actor.id)
  })
  await logAction(db, actor.id, "business.wallet.provision_bank_details", "business_wallet_account", accountId, { ibanLast4: iban.slice(-4) })
  return getBusinessWallet(actor, businessId)
}

/** Attribue (ou remplace) un RIB sur un compte Wallet Pro — Dashboard, administrateurs uniquement, motif journalisé. */
export async function adminAssignBusinessBankDetails(actor: Actor, input: { businessId: number; accountId: number; iban: string; bic: string; reason: string }) {
  requireRole(actor, "admin")
  if (input.reason.trim().length < 8) throw new ValidationError("Le motif RIB doit contenir au moins huit caractères.")
  const iban = normalizeAndValidateIban(input.iban)
  const bic = normalizeAndValidateBic(input.bic)
  const [account] = await db.select().from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, input.accountId), eq(businessWalletAccounts.businessId, input.businessId))).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    await executor.update(businessWalletAccounts).set({ iban, bic, updatedAt: new Date() }).where(eq(businessWalletAccounts.id, account.id))
    await syncMainBankAccount(executor, await mainBankRef(executor, input.businessId, account), iban, bic, actor.id)
  })
  await logAction(db, actor.id, account.iban ? "admin.business.bank_details_rotate" : "admin.business.bank_details_assign", "business_wallet_account", account.id, { ibanLast4: iban.slice(-4), bic, previousIbanLast4: account.iban?.slice(-4) ?? null, reason: input.reason.trim() })
  return getAdminBusinessDetail(actor, input.businessId)
}

/** Retire le RIB d'un compte Wallet Pro (motif journalisé). */
export async function adminRevokeBusinessBankDetails(actor: Actor, input: { businessId: number; accountId: number; reason: string }) {
  requireRole(actor, "admin")
  if (input.reason.trim().length < 8) throw new ValidationError("Le motif de révocation doit contenir au moins huit caractères.")
  const [account] = await db.select().from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, input.accountId), eq(businessWalletAccounts.businessId, input.businessId))).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    await executor.update(businessWalletAccounts).set({ iban: null, bic: null, updatedAt: new Date() }).where(eq(businessWalletAccounts.id, account.id))
    await syncMainBankAccount(executor, await mainBankRef(executor, input.businessId, account), null, null, actor.id)
  })
  await logAction(db, actor.id, "admin.business.bank_details_revoke", "business_wallet_account", account.id, { previousIbanLast4: account.iban?.slice(-4) ?? null, reason: input.reason.trim() })
  return getAdminBusinessDetail(actor, input.businessId)
}

export async function listCards(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const accounts = await db.select({ id: businessWalletAccounts.id }).from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId))
  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) return []
  return db.select().from(businessCards).where(inArray(businessCards.businessWalletAccountId, accountIds))
}

/** Cloisonnement des entreprises : un compte / une carte n'est jamais atteignable par l'identifiant seul, il doit appartenir à l'entreprise dont le rôle a été vérifié. */
async function assertAccountOfBusiness(executor: Executor, businessId: number, accountId: number) {
  const [row] = await executor.select({ id: businessWalletAccounts.id }).from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, accountId), eq(businessWalletAccounts.businessId, businessId))).limit(1)
  if (!row) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
}

async function assertCardOfBusiness(executor: Executor, businessId: number, cardId: number) {
  const [row] = await executor
    .select({ id: businessCards.id })
    .from(businessCards)
    .innerJoin(businessWalletAccounts, eq(businessCards.businessWalletAccountId, businessWalletAccounts.id))
    .where(and(eq(businessCards.id, cardId), eq(businessWalletAccounts.businessId, businessId)))
    .limit(1)
  if (!row) throw new NotFoundError("Carte introuvable pour cette entreprise.")
}

export async function createCard(actor: Actor, businessId: number, input: { businessWalletAccountId: number; cardholderName: string; assignedToUserId?: number; network: "visa" | "mastercard" | "cb"; theme: "navy" | "teal" | "brick"; label?: string; expiresAt: Date }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await assertAccountOfBusiness(db, businessId, input.businessWalletAccountId)
  const lastFour = String(Math.floor(1000 + Math.random() * 9000))
  const [result] = await db.insert(businessCards).values({
    businessWalletAccountId: input.businessWalletAccountId,
    assignedToUserId: input.assignedToUserId ?? null,
    cardholderName: input.cardholderName.trim(),
    lastFour,
    network: input.network,
    theme: input.theme,
    label: input.label?.trim() || "Carte VTEX Business",
    tokenReference: randomBytes(16).toString("hex"),
    expiresAt: input.expiresAt,
  })
  await logAction(db, actor.id, "business.card.create", "business_card", result.insertId, { cardholderName: input.cardholderName })
  return listCards(actor, businessId)
}

export async function setCardFrozen(actor: Actor, businessId: number, cardId: number, frozen: boolean) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await assertCardOfBusiness(db, businessId, cardId)
  await db.update(businessCards).set({ status: frozen ? "frozen" : "active", updatedAt: new Date() }).where(eq(businessCards.id, cardId))
  await logAction(db, actor.id, "business.card.freeze", "business_card", cardId, { frozen })
  return listCards(actor, businessId)
}

export async function updateCardControls(actor: Actor, businessId: number, cardId: number, controls: Partial<Pick<BusinessCard, "onlinePaymentsEnabled" | "contactlessEnabled" | "cashWithdrawalEnabled" | "dailyLimitCents" | "monthlyLimitCents" | "perTransactionLimitCents">>) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await assertCardOfBusiness(db, businessId, cardId)
  for (const value of [controls.dailyLimitCents, controls.monthlyLimitCents, controls.perTransactionLimitCents]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new ValidationError("Chaque plafond doit être un montant strictement positif.")
  }
  await db.update(businessCards).set({ ...controls, updatedAt: new Date() }).where(eq(businessCards.id, cardId))
  await logAction(db, actor.id, "business.card.controls_update", "business_card", cardId, controls as Record<string, unknown>)
  return listCards(actor, businessId)
}

/* ────────────────  Transactions & ledger  ──────────────── */

export async function insertBusinessTransaction(executor: Executor, input: {
  businessId: number; businessWalletAccountId: number; type: "payout" | "transfer" | "card_payment" | "invoice_payment" | "payment_link" | "checkout" | "fee" | "adjustment" | "refund" | "topup"
  direction: "debit" | "credit"; amountCents: number; currency: string; description?: string; initiatedByUserId: number; cardId?: number
  reference?: string; idempotencyKey?: string; metadata?: Record<string, unknown>
}) {
  const reference = input.reference ?? generatedReference("BIZ")
  const [result] = await executor.insert(businessTransactions).values({
    reference,
    idempotencyKey: input.idempotencyKey ?? null,
    metadata: input.metadata ?? null,
    businessId: input.businessId,
    businessWalletAccountId: input.businessWalletAccountId,
    cardId: input.cardId ?? null,
    initiatedByUserId: input.initiatedByUserId,
    type: input.type,
    direction: input.direction,
    status: "completed",
    amountCents: input.amountCents,
    currency: input.currency,
    description: input.description?.trim() || null,
    completedAt: new Date(),
  })
  const [transaction] = await executor.select().from(businessTransactions).where(eq(businessTransactions.id, result.insertId)).limit(1)
  if (!transaction) throw new Error("La transaction Business n’a pas pu être relue.")
  return transaction
}

export async function writeBusinessLedger(executor: Executor, input: { businessWalletAccountId: number; transactionId: number; deltaCents: number; balanceAfterCents: number }) {
  await executor.insert(businessLedgerEntries).values({ businessWalletAccountId: input.businessWalletAccountId, transactionId: input.transactionId, entryKind: "available", deltaCents: input.deltaCents, balanceAfterCents: input.balanceAfterCents })
}

export async function listTransactions(actor: Actor, businessId: number, limit = 50) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(businessTransactions).where(eq(businessTransactions.businessId, businessId)).orderBy(desc(businessTransactions.createdAt)).limit(limit)
}

/* ────────────────  Payouts  ──────────────── */

export async function createPayout(actor: Actor, businessId: number, input: { businessWalletAccountId: number; beneficiaryName: string; iban: string; bic?: string; amountCents: number; currency?: string }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const reference = generatedReference("PAY")
  const [result] = await db.insert(payouts).values({
    businessId,
    beneficiaryName: input.beneficiaryName.trim(),
    iban: input.iban,
    bic: input.bic ?? null,
    amountCents: input.amountCents,
    currency: input.currency ?? "EUR",
    reference,
    requestedBy: actor.id,
  })
  await createApproval(db, actor, businessId, "payout", result.insertId)
  await logAction(db, actor.id, "business.payout.create", "payout", result.insertId, { amountCents: input.amountCents })
  return listPayouts(actor, businessId)
}

export async function createPayoutBatch(actor: Actor, businessId: number, input: { label: string; items: Array<{ beneficiaryName: string; iban: string; bic?: string; amountCents: number; currency?: string }> }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const totalCents = input.items.reduce((sum, item) => sum + item.amountCents, 0)
  const [batchResult] = await db.insert(payoutBatches).values({ businessId, label: input.label.trim(), totalCents, itemsCount: input.items.length, status: "pending_approval", createdBy: actor.id })
  const batchId = batchResult.insertId
  for (const item of input.items) {
    const reference = generatedReference("PAY")
    await db.insert(payouts).values({ businessId, batchId, beneficiaryName: item.beneficiaryName.trim(), iban: item.iban, bic: item.bic ?? null, amountCents: item.amountCents, currency: item.currency ?? "EUR", reference, requestedBy: actor.id })
  }
  await createApproval(db, actor, businessId, "payout_batch", batchId)
  await logAction(db, actor.id, "business.payout_batch.create", "payout_batch", batchId, { itemsCount: input.items.length, totalCents })
  return listPayoutBatches(actor, businessId)
}

export async function approvePayout(actor: Actor, businessId: number, payoutId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const [payout] = await db.select().from(payouts).where(and(eq(payouts.id, payoutId), eq(payouts.businessId, businessId))).limit(1)
  if (!payout) throw new NotFoundError("Payout introuvable.")
  const [account] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId)).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet Business introuvable.")
  const balanceAfter = await changeAvailable(db, account.id, -payout.amountCents)
  const transaction = await insertBusinessTransaction(db, { businessId, businessWalletAccountId: account.id, type: "payout", direction: "debit", amountCents: payout.amountCents, currency: payout.currency, description: `Payout vers ${payout.beneficiaryName}`, initiatedByUserId: actor.id })
  await writeBusinessLedger(db, { businessWalletAccountId: account.id, transactionId: transaction.id, deltaCents: -payout.amountCents, balanceAfterCents: balanceAfter })
  await db.update(payouts).set({ status: "completed", approvedBy: actor.id, approvedAt: new Date(), transactionId: transaction.id, updatedAt: new Date() }).where(eq(payouts.id, payoutId))
  await logAction(db, actor.id, "business.payout.approve", "payout", payoutId, {})
  return listPayouts(actor, businessId)
}

export async function rejectPayout(actor: Actor, businessId: number, payoutId: number, reason?: string) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(payouts).set({ status: "rejected", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(payouts.id, payoutId), eq(payouts.businessId, businessId)))
  await logAction(db, actor.id, "business.payout.reject", "payout", payoutId, { reason })
  return listPayouts(actor, businessId)
}

export async function listPayouts(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(payouts).where(eq(payouts.businessId, businessId)).orderBy(desc(payouts.createdAt))
}

export async function listPayoutBatches(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(payoutBatches).where(eq(payoutBatches.businessId, businessId)).orderBy(desc(payoutBatches.createdAt))
}

/* ────────────────  CRM clients  ──────────────── */

export async function listCustomers(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(customers).where(eq(customers.businessId, businessId)).orderBy(desc(customers.createdAt))
}

export async function createCustomer(actor: Actor, businessId: number, input: { name: string; email?: string; phone?: string; company?: string; address?: string; notes?: string }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support")
  const [result] = await db.insert(customers).values({ businessId, name: input.name.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, company: input.company?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null })
  await logAction(db, actor.id, "business.customer.create", "customer", result.insertId, { name: input.name })
  return listCustomers(actor, businessId)
}

export async function updateCustomer(actor: Actor, businessId: number, customerId: number, input: Partial<{ name: string; email: string; phone: string; company: string; address: string; notes: string; status: "active" | "blocked" }>) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support")
  await db.update(customers).set({ ...input, updatedAt: new Date() }).where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
  await logAction(db, actor.id, "business.customer.update", "customer", customerId, input as Record<string, unknown>)
  return listCustomers(actor, businessId)
}

/* ────────────────  Payment Links  ──────────────── */

/** Les paiements passent uniquement par `paymentLinkPay.ts` (règlement vérifié auprès du prestataire) : aucune fonction ne crédite un lien sans encaissement réel. */
export async function listPaymentLinks(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const links = await db.select().from(paymentLinks).where(eq(paymentLinks.businessId, businessId)).orderBy(desc(paymentLinks.createdAt))
  if (links.length === 0) return []
  const stats = await db.select({ paymentLinkId: paymentLinkEvents.paymentLinkId, kind: paymentLinkEvents.kind, count: sql<number>`count(*)`, revenue: sql<number>`coalesce(sum(${paymentLinkEvents.amountCents}), 0)` }).from(paymentLinkEvents).where(inArray(paymentLinkEvents.paymentLinkId, links.map((l) => l.id))).groupBy(paymentLinkEvents.paymentLinkId, paymentLinkEvents.kind)
  const accounts = await db.select({ id: businessWalletAccounts.id, label: businessWalletAccounts.label, currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId))
  return links.map((link) => {
    const visits = stats.find((s) => s.paymentLinkId === link.id && s.kind === "visit")?.count ?? 0
    const paymentsStat = stats.find((s) => s.paymentLinkId === link.id && s.kind === "payment")
    const account = accounts.find((a) => a.id === link.targetAccountId)
    return { ...link, visits: Number(visits), paid: Number(paymentsStat?.count ?? 0), revenueCents: Number(paymentsStat?.revenue ?? 0), targetAccount: account ? { id: account.id, label: account.label, currency: account.currency } : null }
  })
}

export interface NewPaymentLinkInput { name: string; amountCents: number; currency?: string; mode: "unique" | "recurring"; targetAccountId?: number; description?: string; expiresAt?: Date }

/**
 * Validation et insertion d'un lien, sans contrôle de rôle : l'appelant a déjà authentifié son acteur (membre de l'entreprise depuis l'espace Pro,
 * clé d'API munie du droit d'écriture depuis `/api/v1`). Toutes les règles métier (compte de l'entreprise, devise, plafonds, expiration) vivent ici.
 */
export async function insertPaymentLinkRecord(businessId: number, createdBy: number, input: NewPaymentLinkInput, extra: { createdViaKeyId?: number; idempotencyKey?: string } = {}): Promise<{ id: number; currency: string; targetAccountId: number }> {
  const name = input.name.trim()
  if (name.length < 2) throw new ValidationError("Donnez un nom au lien de paiement.")
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new ValidationError("La date d'expiration doit être dans le futur.")
  const targetAccountId = input.targetAccountId
    ?? (await db.select({ id: businessWalletAccounts.id }).from(businessWalletAccounts).where(and(eq(businessWalletAccounts.businessId, businessId), eq(businessWalletAccounts.status, "active"))).orderBy(businessWalletAccounts.id).limit(1))[0]?.id
  if (!targetAccountId) throw new NotFoundError("Aucun compte Wallet Pro à créditer pour cette entreprise.")
  await assertAccountOfBusiness(db, businessId, targetAccountId)
  const [account] = await db.select({ currency: businessWalletAccounts.currency, status: businessWalletAccounts.status }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, targetAccountId)).limit(1)
  if (account?.status !== "active") throw new ValidationError("Ce compte ne peut pas recevoir de paiement.")
  const currency = input.currency ?? account.currency
  if (!isCurrencyCode(currency)) throw new ValidationError("Devise non prise en charge.")
  if (account.currency !== currency && !canConvert(currency, account.currency)) throw new ValidationError(`Un paiement en ${currency} ne peut pas être crédité sur un compte en ${account.currency}.`)
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError("Le montant doit être un entier positif (unité mineure de la devise).")
  const limits = topupLimits(currency, "business")
  if (input.amountCents < limits.minCents) throw new ValidationError(`Le montant minimum d'un lien de paiement est ${formatMinor(limits.minCents, currency)}.`)
  if (input.amountCents > limits.maxCents) throw new ValidationError(`Le montant maximum d'un lien de paiement est ${formatMinor(limits.maxCents, currency)}.`)
  const [result] = await db.insert(paymentLinks).values({
    businessId, slug: generatedSlug(), name, amountCents: input.amountCents, currency, mode: input.mode, status: "active",
    targetAccountId, description: input.description?.trim() || null, expiresAt: input.expiresAt ?? null, createdBy, updatedBy: createdBy,
    createdViaKeyId: extra.createdViaKeyId ?? null, idempotencyKey: extra.idempotencyKey ?? null,
  })
  return { id: result.insertId, currency, targetAccountId }
}

export async function createPaymentLink(actor: Actor, businessId: number, input: NewPaymentLinkInput) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const created = await insertPaymentLinkRecord(businessId, actor.id, input)
  await logAction(db, actor.id, "business.payment_link.create", "payment_link", created.id, { name: input.name.trim(), amountCents: input.amountCents, currency: created.currency, mode: input.mode, targetAccountId: created.targetAccountId }, { walletType: "PROFESSIONAL", holderId: businessId })
  return listPaymentLinks(actor, businessId)
}

export async function updatePaymentLinkStatus(actor: Actor, businessId: number, linkId: number, status: "active" | "expired" | "draft" | "disabled") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const [link] = await db.select().from(paymentLinks).where(and(eq(paymentLinks.id, linkId), eq(paymentLinks.businessId, businessId))).limit(1)
  if (!link) throw new NotFoundError("Lien de paiement introuvable.")
  if (status === "active") {
    if (link.mode === "unique") {
      const [paid] = await db.select({ id: paymentLinkEvents.id }).from(paymentLinkEvents).where(and(eq(paymentLinkEvents.paymentLinkId, linkId), eq(paymentLinkEvents.kind, "payment"))).limit(1)
      if (paid) throw new ValidationError("Un lien à usage unique déjà payé ne peut pas être réactivé.")
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) throw new ValidationError("Ce lien a dépassé sa date d'expiration.")
  }
  await db.update(paymentLinks).set({ status, updatedBy: actor.id, updatedAt: new Date() }).where(eq(paymentLinks.id, linkId))
  await logAction(db, actor.id, "business.payment_link.status_update", "payment_link", linkId, { from: link.status, status }, { walletType: "PROFESSIONAL", holderId: businessId })
  return listPaymentLinks(actor, businessId)
}
/* ────────────────  Factures  ──────────────── */

export async function listInvoices(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(invoices).where(eq(invoices.businessId, businessId)).orderBy(desc(invoices.createdAt))
}

export async function createInvoice(actor: Actor, businessId: number, input: { customerId: number; dueAt: Date; description?: string; items: Array<{ description: string; quantity: number; unitPriceCents: number }> }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const [settings] = await db.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1)
  const count = await db.select({ n: sql<number>`count(*)` }).from(invoices).where(eq(invoices.businessId, businessId))
  const number = `${settings?.invoicePrefix ?? "INV"}-${String((count[0]?.n ?? 0) + 1).padStart(4, "0")}`
  const amountCents = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  const [result] = await db.insert(invoices).values({ businessId, number, customerId: input.customerId, amountCents, dueAt: input.dueAt, description: input.description?.trim() || null, createdBy: actor.id, status: "draft" })
  const invoiceId = result.insertId
  for (const item of input.items) {
    await db.insert(invoiceItems).values({ invoiceId, description: item.description.trim(), quantity: item.quantity, unitPriceCents: item.unitPriceCents, totalCents: item.quantity * item.unitPriceCents })
  }
  await logAction(db, actor.id, "business.invoice.create", "invoice", invoiceId, { number, amountCents })
  return listInvoices(actor, businessId)
}

export async function updateInvoiceStatus(actor: Actor, businessId: number, invoiceId: number, status: "draft" | "sent" | "viewed" | "cancelled") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(invoices).set({ status, updatedAt: new Date() }).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
  await logAction(db, actor.id, "business.invoice.status_update", "invoice", invoiceId, { status })
  return listInvoices(actor, businessId)
}

export async function recordInvoicePayment(actor: Actor, businessId: number, invoiceId: number, amountCents: number, method: "card" | "transfer" | "payment_link" | "manual" = "manual") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId))).limit(1)
  if (!invoice) throw new NotFoundError("Facture introuvable.")
  await db.insert(invoicePayments).values({ invoiceId, amountCents, method })
  const paidRows = await db.select({ total: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)` }).from(invoicePayments).where(eq(invoicePayments.invoiceId, invoiceId))
  const totalPaid = paidRows[0]?.total ?? 0
  const nextStatus = totalPaid >= invoice.amountCents ? "paid" : "partial"
  await db.update(invoices).set({ status: nextStatus, updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
  const [account] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId)).limit(1)
  if (account) {
    const balanceAfter = await changeAvailable(db, account.id, amountCents)
    const transaction = await insertBusinessTransaction(db, { businessId, businessWalletAccountId: account.id, type: "invoice_payment", direction: "credit", amountCents, currency: invoice.currency, description: `Règlement facture ${invoice.number}`, initiatedByUserId: actor.id })
    await writeBusinessLedger(db, { businessWalletAccountId: account.id, transactionId: transaction.id, deltaCents: amountCents, balanceAfterCents: balanceAfter })
  }
  await logAction(db, actor.id, "business.invoice.payment", "invoice", invoiceId, { amountCents, method })
  return listInvoices(actor, businessId)
}

export async function markOverdueInvoices(businessId: number) {
  await db.update(invoices).set({ status: "overdue", updatedAt: new Date() }).where(and(eq(invoices.businessId, businessId), sql`${invoices.status} in ('sent','viewed','partial')`, sql`${invoices.dueAt} < now()`))
}

/* ────────────────  Devis  ──────────────── */

export async function listEstimates(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(estimates).where(eq(estimates.businessId, businessId)).orderBy(desc(estimates.createdAt))
}

export async function createEstimate(actor: Actor, businessId: number, input: { customerId: number; validUntil?: Date; items: Array<{ description: string; quantity: number; unitPriceCents: number }> }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const count = await db.select({ n: sql<number>`count(*)` }).from(estimates).where(eq(estimates.businessId, businessId))
  const number = `EST-${String((count[0]?.n ?? 0) + 1).padStart(4, "0")}`
  const amountCents = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  const [result] = await db.insert(estimates).values({ businessId, number, customerId: input.customerId, amountCents, validUntil: input.validUntil ?? null, createdBy: actor.id })
  for (const item of input.items) await db.insert(estimateItems).values({ estimateId: result.insertId, description: item.description.trim(), quantity: item.quantity, unitPriceCents: item.unitPriceCents, totalCents: item.quantity * item.unitPriceCents })
  await logAction(db, actor.id, "business.estimate.create", "estimate", result.insertId, { number })
  return listEstimates(actor, businessId)
}

export async function updateEstimateStatus(actor: Actor, businessId: number, estimateId: number, status: "sent" | "accepted" | "declined" | "expired") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(estimates).set({ status, updatedAt: new Date() }).where(and(eq(estimates.id, estimateId), eq(estimates.businessId, businessId)))
  await logAction(db, actor.id, "business.estimate.status_update", "estimate", estimateId, { status })
  return listEstimates(actor, businessId)
}

export async function convertEstimateToInvoice(actor: Actor, businessId: number, estimateId: number, dueAt: Date) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const [estimate] = await db.select().from(estimates).where(and(eq(estimates.id, estimateId), eq(estimates.businessId, businessId))).limit(1)
  if (!estimate) throw new NotFoundError("Devis introuvable.")
  const items = await db.select().from(estimateItems).where(eq(estimateItems.estimateId, estimateId))
  await createInvoice(actor, businessId, { customerId: estimate.customerId, dueAt, description: `Converti depuis le devis ${estimate.number}`, items: items.map((item) => ({ description: item.description, quantity: item.quantity, unitPriceCents: item.unitPriceCents })) })
  const [newInvoice] = await db.select().from(invoices).where(eq(invoices.businessId, businessId)).orderBy(desc(invoices.id)).limit(1)
  await db.update(estimates).set({ convertedInvoiceId: newInvoice?.id ?? null, status: "accepted", updatedAt: new Date() }).where(eq(estimates.id, estimateId))
  await logAction(db, actor.id, "business.estimate.convert", "estimate", estimateId, { invoiceId: newInvoice?.id })
  return listEstimates(actor, businessId)
}

/* ────────────────  Abonnements  ──────────────── */

export async function listSubscriptions(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(subscriptions).where(eq(subscriptions.businessId, businessId)).orderBy(desc(subscriptions.createdAt))
}

export async function createSubscription(actor: Actor, businessId: number, input: { customerId: number; planName: string; amountCents: number; currency?: string; interval: "monthly" | "yearly" }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + (input.interval === "yearly" ? 12 : 1))
  const [result] = await db.insert(subscriptions).values({ businessId, customerId: input.customerId, planName: input.planName.trim(), amountCents: input.amountCents, currency: input.currency ?? "EUR", interval: input.interval, currentPeriodEnd: periodEnd })
  await logAction(db, actor.id, "business.subscription.create", "subscription", result.insertId, { planName: input.planName })
  return listSubscriptions(actor, businessId)
}

export async function updateSubscriptionStatus(actor: Actor, businessId: number, subscriptionId: number, status: "active" | "paused" | "cancelled") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(subscriptions).set({ status, updatedAt: new Date() }).where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.businessId, businessId)))
  await logAction(db, actor.id, "business.subscription.status_update", "subscription", subscriptionId, { status })
  return listSubscriptions(actor, businessId)
}

/* ────────────────  Catalogue & commandes  ──────────────── */

export async function listProducts(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(products).where(eq(products.businessId, businessId)).orderBy(desc(products.createdAt))
}

export async function createProduct(actor: Actor, businessId: number, input: { name: string; sku?: string; priceCents: number; currency?: string; stock?: number; category?: string; description?: string }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  const [result] = await db.insert(products).values({ businessId, name: input.name.trim(), sku: input.sku?.trim() || null, priceCents: input.priceCents, currency: input.currency ?? "EUR", stock: input.stock ?? 0, category: input.category?.trim() || null, description: input.description?.trim() || null })
  await logAction(db, actor.id, "business.product.create", "product", result.insertId, { name: input.name })
  return listProducts(actor, businessId)
}

export async function updateProduct(actor: Actor, businessId: number, productId: number, input: Partial<{ name: string; priceCents: number; stock: number; category: string; description: string; status: "active" | "archived" }>) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(products).set({ ...input, updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.businessId, businessId)))
  await logAction(db, actor.id, "business.product.update", "product", productId, input as Record<string, unknown>)
  return listProducts(actor, businessId)
}

export async function listOrders(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(orders).where(eq(orders.businessId, businessId)).orderBy(desc(orders.createdAt))
}

export async function createOrder(actor: Actor, businessId: number, input: { customerId?: number; channel: "pos" | "online" | "manual"; items: Array<{ productId?: number; description: string; quantity: number; unitPriceCents: number }> }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support")
  const count = await db.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.businessId, businessId))
  const number = `ORD-${String((count[0]?.n ?? 0) + 1).padStart(4, "0")}`
  const amountCents = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  const [result] = await db.insert(orders).values({ businessId, number, customerId: input.customerId ?? null, amountCents, channel: input.channel })
  for (const item of input.items) await db.insert(orderItems).values({ orderId: result.insertId, productId: item.productId ?? null, description: item.description.trim(), quantity: item.quantity, unitPriceCents: item.unitPriceCents, totalCents: item.quantity * item.unitPriceCents })
  if (input.customerId) await db.update(customers).set({ ordersCount: sql`${customers.ordersCount} + 1`, totalSpentCents: sql`${customers.totalSpentCents} + ${amountCents}` }).where(eq(customers.id, input.customerId))
  await logAction(db, actor.id, "business.order.create", "order", result.insertId, { number, amountCents })
  return listOrders(actor, businessId)
}

export async function updateOrderStatus(actor: Actor, businessId: number, orderId: number, status: "paid" | "fulfilled" | "refunded" | "cancelled") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support")
  await db.update(orders).set({ status, updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.businessId, businessId)))
  await logAction(db, actor.id, "business.order.status_update", "order", orderId, { status })
  return listOrders(actor, businessId)
}

/* ────────────────  Résolution : litiges, chargebacks, risque  ──────────────── */

export async function listDisputes(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(disputes).where(eq(disputes.businessId, businessId)).orderBy(desc(disputes.createdAt))
}

export async function updateDisputeStatus(actor: Actor, businessId: number, disputeId: number, status: "under_review" | "won" | "lost") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support")
  await db.update(disputes).set({ status, updatedAt: new Date() }).where(and(eq(disputes.id, disputeId), eq(disputes.businessId, businessId)))
  await logAction(db, actor.id, "business.dispute.status_update", "dispute", disputeId, { status })
  return listDisputes(actor, businessId)
}

export async function listChargebacks(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(chargebacks).where(eq(chargebacks.businessId, businessId)).orderBy(desc(chargebacks.createdAt))
}

export async function updateChargebackStatus(actor: Actor, businessId: number, chargebackId: number, status: "accepted" | "represented" | "won" | "lost") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(chargebacks).set({ status, updatedAt: new Date() }).where(and(eq(chargebacks.id, chargebackId), eq(chargebacks.businessId, businessId)))
  await logAction(db, actor.id, "business.chargeback.status_update", "chargeback", chargebackId, { status })
  return listChargebacks(actor, businessId)
}

export async function listRiskFlags(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  return db.select().from(riskFlags).where(eq(riskFlags.businessId, businessId)).orderBy(desc(riskFlags.createdAt))
}

export async function resolveRiskFlag(actor: Actor, businessId: number, flagId: number, status: "dismissed" | "confirmed") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance")
  await db.update(riskFlags).set({ status, resolvedAt: new Date() }).where(and(eq(riskFlags.id, flagId), eq(riskFlags.businessId, businessId)))
  await logAction(db, actor.id, "business.risk_flag.resolve", "risk_flag", flagId, { status })
  return listRiskFlags(actor, businessId)
}

/* ────────────────  Developers  ──────────────── */

export async function listApplications(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  return db.select({ id: applications.id, name: applications.name, clientId: applications.clientId, redirectUris: applications.redirectUris, status: applications.status, createdAt: applications.createdAt }).from(applications).where(eq(applications.businessId, businessId))
}

export async function createApplication(actor: Actor, businessId: number, input: { name: string; redirectUris: string[] }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const clientId = randomBytes(12).toString("hex")
  const clientSecret = randomBytes(24).toString("hex")
  await db.insert(applications).values({ businessId, name: input.name.trim(), clientId, clientSecretHash: hashSecret(clientSecret), redirectUris: input.redirectUris })
  await logAction(db, actor.id, "business.application.create", "application", 0, { name: input.name })
  return { clientId, clientSecret, applications: await listApplications(actor, businessId) }
}

export async function revokeApplication(actor: Actor, businessId: number, applicationId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(applications).set({ status: "disabled" }).where(and(eq(applications.id, applicationId), eq(applications.businessId, businessId)))
  return listApplications(actor, businessId)
}

export async function listWebhooks(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  return db.select().from(webhooks).where(eq(webhooks.businessId, businessId))
}

export async function createWebhook(actor: Actor, businessId: number, input: { url: string; events: string[] }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const secret = randomBytes(16).toString("hex")
  const [result] = await db.insert(webhooks).values({ businessId, url: input.url.trim(), events: input.events, secret })
  await logAction(db, actor.id, "business.webhook.create", "webhook", result.insertId, { url: input.url })
  return listWebhooks(actor, businessId)
}

export async function toggleWebhook(actor: Actor, businessId: number, webhookId: number, status: "active" | "disabled") {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(webhooks).set({ status }).where(and(eq(webhooks.id, webhookId), eq(webhooks.businessId, businessId)))
  return listWebhooks(actor, businessId)
}

export async function listWebhookDeliveries(actor: Actor, businessId: number, webhookId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  return db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId)).orderBy(desc(webhookDeliveries.createdAt)).limit(50)
}

/* ────────────────  Paramètres Business  ──────────────── */

export async function getBusinessSettings(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const [settings] = await db.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1)
  if (!settings) throw new NotFoundError("Paramètres introuvables.")
  return settings
}

export async function updateBusinessSettings(actor: Actor, businessId: number, input: Partial<{ checkoutBrandColor: string; invoicePrefix: string; defaultCurrency: string; notifyEmail: boolean; notifySms: boolean; notifyPush: boolean; require2fa: boolean; ipAllowlist: string[]; sessionTimeoutMinutes: number; integrations: Record<string, boolean> }>) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  await db.update(businessSettings).set({ ...input, updatedAt: new Date() }).where(eq(businessSettings.businessId, businessId))
  await logAction(db, actor.id, "business.settings.update", "business_settings", businessId, input as Record<string, unknown>)
  return getBusinessSettings(actor, businessId)
}

/* ────────────────  KPIs & Analytics (calculés en direct)  ──────────────── */

export async function businessKpis(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [revenueRow] = await db.select({ total: sql<number>`coalesce(sum(${businessTransactions.amountCents}), 0)` }).from(businessTransactions).where(and(eq(businessTransactions.businessId, businessId), eq(businessTransactions.direction, "credit"), gte(businessTransactions.createdAt, since30d)))
  const [paymentsRow] = await db.select({ count: sql<number>`count(*)` }).from(businessTransactions).where(and(eq(businessTransactions.businessId, businessId), eq(businessTransactions.direction, "credit"), gte(businessTransactions.createdAt, since30d)))
  const [customersRow] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(and(eq(customers.businessId, businessId), gte(customers.createdAt, since30d)))
  const [walletRow] = await db.select({ available: sql<number>`coalesce(sum(${businessWalletAccounts.availableBalanceCents}), 0)` }).from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId))
  const revenue = revenueRow?.total ?? 0
  const paymentsCount = paymentsRow?.count ?? 0
  return {
    revenueCents30d: revenue,
    paymentsCount30d: paymentsCount,
    averageBasketCents: paymentsCount > 0 ? Math.round(revenue / paymentsCount) : 0,
    newCustomers30d: customersRow?.count ?? 0,
    availableBalanceCents: walletRow?.available ?? 0,
  }
}

/* ────────────────  Surface Admin Dashboard (rôle plateforme)  ──────────────── */

export async function listAdminBusinesses(actor: Actor, limit = 200) {
  requireRole(actor, "admin", "agent")
  return db.select({
    id: businesses.id,
    ownerUserId: businesses.ownerUserId,
    legalName: businesses.legalName,
    brandName: businesses.brandName,
    industry: businesses.industry,
    currency: businesses.currency,
    status: businesses.status,
    verifiedAt: businesses.verifiedAt,
    createdAt: businesses.createdAt,
    updatedAt: businesses.updatedAt,
    availableBalanceCents: sql<number>`coalesce((select sum(available_balance_cents) from business_wallet_accounts where business_wallet_accounts.business_id = businesses.id), 0)`,
  }).from(businesses).orderBy(desc(businesses.createdAt)).limit(limit)
}

export async function adminCreateBusiness(actor: Actor, input: { ownerUserId: number; legalName: string; brandName: string; industry?: string; siren?: string; vatId?: string; email?: string; phone?: string; address?: string; currency?: string }) {
  requireRole(actor, "admin")
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.ownerUserId)).limit(1)
  if (!owner) throw new NotFoundError("Titulaire introuvable.")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const created = await insertBusinessRows(executor, input)
    await logAction(executor, actor.id, "admin.business.create", "business", created.businessId, { legalName: input.legalName, ownerUserId: input.ownerUserId }, { walletType: "PROFESSIONAL", holderId: created.businessId })
    return created
  })
}

export async function adminBusinessKpis(actor: Actor) {
  requireRole(actor, "admin", "agent")
  const [businessCount] = await db.select({ n: sql<number>`count(*)` }).from(businesses)
  const [balanceRow] = await db.select({ total: sql<number>`coalesce(sum(${businessWalletAccounts.availableBalanceCents}), 0)` }).from(businessWalletAccounts)
  const [pendingPayoutsRow] = await db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${payouts.amountCents}), 0)` }).from(payouts).where(eq(payouts.status, "pending_approval"))
  const [openDisputesRow] = await db.select({ n: sql<number>`count(*)` }).from(disputes).where(eq(disputes.status, "open"))
  return {
    businessCount: businessCount?.n ?? 0,
    totalAvailableBalanceCents: balanceRow?.total ?? 0,
    pendingPayoutsCount: pendingPayoutsRow?.n ?? 0,
    pendingPayoutsAmountCents: pendingPayoutsRow?.total ?? 0,
    openDisputesCount: openDisputesRow?.n ?? 0,
  }
}

export async function getAdminBusinessDetail(actor: Actor, businessId: number) {
  requireRole(actor, "admin", "agent")
  const business = await getBusinessOrThrow(db, businessId)
  const [members, wallet, recentTransactions, pendingPayouts, openDisputes, settings] = await Promise.all([
    db.select({ id: businessMembers.id, userId: businessMembers.userId, role: businessMembers.role, status: businessMembers.status, name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`, email: users.email }).from(businessMembers).innerJoin(users, eq(users.id, businessMembers.userId)).where(eq(businessMembers.businessId, businessId)),
    db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, businessId)),
    db.select().from(businessTransactions).where(eq(businessTransactions.businessId, businessId)).orderBy(desc(businessTransactions.createdAt)).limit(20),
    db.select().from(payouts).where(and(eq(payouts.businessId, businessId), eq(payouts.status, "pending_approval"))),
    db.select().from(disputes).where(and(eq(disputes.businessId, businessId), eq(disputes.status, "open"))),
    db.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1),
  ])
  const accountIds = wallet.map((w) => w.id)
  const cards = accountIds.length > 0 ? await db.select().from(businessCards).where(inArray(businessCards.businessWalletAccountId, accountIds)) : []
  return { business, members, wallet, cards, recentTransactions, pendingPayouts, openDisputes, settings: settings[0] ?? null }
}

export async function updateAdminBusinessStatus(actor: Actor, businessId: number, status: "active" | "suspended" | "closed") {
  requireRole(actor, "admin")
  await db.update(businesses).set({ status, updatedAt: new Date() }).where(eq(businesses.id, businessId))
  await logAction(db, actor.id, "admin.business.status_update", "business", businessId, { status })
  return getAdminBusinessDetail(actor, businessId)
}

export async function adminAdjustBusinessBalance(actor: Actor, businessId: number, accountId: number, deltaCents: number, reason: string) {
  requireRole(actor, "admin")
  const [owned] = await db.select({ id: businessWalletAccounts.id }).from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, accountId), eq(businessWalletAccounts.businessId, businessId))).limit(1)
  if (!owned) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
  if (reason.trim().length < 8) throw new ValidationError("Une justification d’au moins huit caractères est requise.")
  const balanceAfter = await changeAvailable(db, accountId, deltaCents)
  const [account] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.id, accountId)).limit(1)
  const transaction = await insertBusinessTransaction(db, { businessId, businessWalletAccountId: accountId, type: "adjustment", direction: deltaCents >= 0 ? "credit" : "debit", amountCents: Math.abs(deltaCents), currency: account?.currency ?? "EUR", description: reason, initiatedByUserId: actor.id })
  await writeBusinessLedger(db, { businessWalletAccountId: accountId, transactionId: transaction.id, deltaCents, balanceAfterCents: balanceAfter })
  await logAction(db, actor.id, "admin.business.balance_adjust", "business_wallet_account", accountId, { deltaCents, reason })
  return getAdminBusinessDetail(actor, businessId)
}

export async function adminListAdminTransactions(actor: Actor, limit = 100) {
  requireRole(actor, "admin", "agent")
  return db
    .select({
      id: businessTransactions.id,
      reference: businessTransactions.reference,
      businessId: businessTransactions.businessId,
      businessName: businesses.brandName,
      type: businessTransactions.type,
      direction: businessTransactions.direction,
      status: businessTransactions.status,
      amountCents: businessTransactions.amountCents,
      feeCents: businessTransactions.feeCents,
      currency: businessTransactions.currency,
      description: businessTransactions.description,
      createdAt: businessTransactions.createdAt,
    })
    .from(businessTransactions)
    .innerJoin(businesses, eq(businesses.id, businessTransactions.businessId))
    .orderBy(desc(businessTransactions.createdAt))
    .limit(limit)
}

export async function adminListPendingPayouts(actor: Actor) {
  requireRole(actor, "admin", "agent")
  return db.select().from(payouts).where(eq(payouts.status, "pending_approval")).orderBy(desc(payouts.createdAt))
}

export async function adminDecidePayout(actor: Actor, businessId: number, payoutId: number, decision: "approved" | "rejected", reason?: string) {
  requireRole(actor, "admin")
  if (decision === "approved") return approvePayout(actor, businessId, payoutId)
  return rejectPayout(actor, businessId, payoutId, reason)
}
