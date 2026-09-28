import {
  ForbiddenError,
  NotFoundError,
  db,
  isWalletAssigned,
  listAssignments,
  listManagersOfWallet,
  logAction,
  notificationReads,
  notifications,
  protectedProcedure,
  requirePermission,
  router,
  users,
  type Actor,
  type WalletType,
} from "@vtex/core"
import { businessTransactions, businessWalletAccounts } from "@vtex/business"
import { transactions, walletAccounts } from "@vtex/wallet"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { holderKey, loadHolders } from "./walletHolders"

/**
 * Portefeuille d'un gestionnaire de compte : ses wallets attribués, en LECTURE SEULE.
 *
 *  - accessible avec `portfolio.read` ; le PÉRIMÈTRE est vérifié à chaque appel côté serveur : un wallet qui n'est pas attribué à l'appelant est refusé,
 *    même si son identifiant est deviné (IDOR) ;
 *  - la fiche n'expose ni RIB, ni carte, ni clé, ni donnée d'authentification : identité, soldes, activité récente, autres gestionnaires, suggestions ;
 *  - ouvrir une fiche est journalisé (`portfolio.view`) sur le wallet.
 */

const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim()

export interface AccountSummary { id: number; label: string; currency: string; status: string; availableCents: number; reservedCents: number }

async function accountsOf(walletType: WalletType, holderId: number): Promise<AccountSummary[]> {
  if (walletType === "PERSONAL") {
    const rows = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, holderId)).orderBy(walletAccounts.id)
    return rows.map((row) => ({ id: row.id, label: `Compte ${row.currency}`, currency: row.currency, status: row.status, availableCents: Number(row.availableBalanceCents), reservedCents: Number(row.reservedBalanceCents) }))
  }
  const rows = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, holderId)).orderBy(businessWalletAccounts.id)
  return rows.map((row) => ({ id: row.id, label: row.label, currency: row.currency, status: row.status, availableCents: Number(row.availableBalanceCents), reservedCents: Number(row.reservedBalanceCents) }))
}

export async function listPortfolio(actor: Actor) {
  requirePermission(actor, "portfolio.read")
  const assignments = await listAssignments(db, actor.id)
  if (assignments.length === 0) return []
  const holders = await loadHolders(db, assignments)
  const personalIds = assignments.filter((assignment) => assignment.walletType === "PERSONAL").map((assignment) => assignment.holderId)
  const businessIds = assignments.filter((assignment) => assignment.walletType === "PROFESSIONAL").map((assignment) => assignment.holderId)
  const [personal, business, activity] = await Promise.all([
    personalIds.length ? db.select({ userId: walletAccounts.userId, currency: walletAccounts.currency, available: walletAccounts.availableBalanceCents }).from(walletAccounts).where(inArray(walletAccounts.userId, personalIds)) : Promise.resolve([]),
    businessIds.length ? db.select({ businessId: businessWalletAccounts.businessId, currency: businessWalletAccounts.currency, available: businessWalletAccounts.availableBalanceCents }).from(businessWalletAccounts).where(inArray(businessWalletAccounts.businessId, businessIds)) : Promise.resolve([]),
    personalIds.length ? db.select({ id: users.id, lastActiveAt: users.lastActiveAt }).from(users).where(inArray(users.id, personalIds)) : Promise.resolve([]),
  ])
  return assignments.map((assignment) => {
    const holder = holders.get(holderKey(assignment))
    const balances = assignment.walletType === "PERSONAL"
      ? personal.filter((row) => row.userId === assignment.holderId).map((row) => ({ currency: row.currency, availableCents: Number(row.available) }))
      : business.filter((row) => row.businessId === assignment.holderId).map((row) => ({ currency: row.currency, availableCents: Number(row.available) }))
    return {
      walletType: assignment.walletType,
      holderId: assignment.holderId,
      name: holder?.name ?? `Titulaire #${assignment.holderId}`,
      subtitle: holder?.subtitle ?? null,
      status: holder?.status ?? "unknown",
      balances,
      lastActiveAt: assignment.walletType === "PERSONAL" ? activity.find((row) => row.id === assignment.holderId)?.lastActiveAt ?? null : null,
      assignedAt: assignment.createdAt,
    }
  })
}

export async function getPortfolioWallet(actor: Actor, ref: { walletType: WalletType; holderId: number }) {
  requirePermission(actor, "portfolio.read")
  // Périmètre : refusé pour tout wallet qui n'est pas attribué à l'appelant, sans dire s'il existe.
  if (!(await isWalletAssigned(db, actor.id, ref.walletType, ref.holderId))) throw new ForbiddenError("Ce wallet ne fait pas partie de votre portefeuille.")
  const holder = (await loadHolders(db, [ref])).get(holderKey(ref))
  if (!holder) throw new NotFoundError("Titulaire de wallet introuvable.")

  const accounts = await accountsOf(ref.walletType, ref.holderId)
  const accountIds = accounts.map((account) => account.id)
  const recent = ref.walletType === "PERSONAL"
    ? accountIds.length
      ? (await db.select().from(transactions).where(inArray(transactions.walletAccountId, accountIds)).orderBy(desc(transactions.createdAt)).limit(10)).map((row) => ({ id: row.reference, type: row.type as string, direction: row.direction, status: row.status, amountCents: Number(row.amountCents), currency: row.currency, description: row.description, createdAt: row.createdAt }))
      : []
    : (await db.select().from(businessTransactions).where(eq(businessTransactions.businessId, ref.holderId)).orderBy(desc(businessTransactions.createdAt)).limit(10)).map((row) => ({ id: row.reference, type: row.type as string, direction: row.direction, status: row.status, amountCents: Number(row.amountCents), currency: row.currency, description: row.description, createdAt: row.createdAt }))

  const managers = (await listManagersOfWallet(db, ref.walletType, ref.holderId)).map((row) => ({ id: row.id, name: fullName(row), role: row.role, isMe: row.id === actor.id }))
  const suggestionRows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.kind, "suggestion"), eq(notifications.walletType, ref.walletType), eq(notifications.holderId, ref.holderId)))
    .orderBy(desc(notifications.createdAt))
    .limit(10)
  const reads = suggestionRows.length ? await db.select().from(notificationReads).where(inArray(notificationReads.notificationId, suggestionRows.map((row) => row.id))) : []
  const senderIds = [...new Set(suggestionRows.map((row) => row.createdBy))]
  const senders = senderIds.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, senderIds)) : []
  const suggestions = suggestionRows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    sender: fullName(senders.find((sender) => sender.id === row.createdBy) ?? { firstName: "—", lastName: "" }),
    read: reads.some((entry) => entry.notificationId === row.id && entry.userId === row.targetUserId),
  }))

  await logAction(db, actor.id, "portfolio.view", ref.walletType === "PERSONAL" ? "user" : "business", ref.holderId, { holderName: holder.name }, ref)
  return { holder, accounts, recentTransactions: recent, managers, suggestions }
}

const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])

export const adminPortfolioRouter = router({
  list: protectedProcedure.query(({ ctx }) => listPortfolio(ctx.actor)),
  wallet: protectedProcedure
    .input(z.object({ walletType: walletTypeSchema, holderId: z.number().int().positive() }))
    .query(({ ctx, input }) => getPortfolioWallet(ctx.actor, input)),
})
