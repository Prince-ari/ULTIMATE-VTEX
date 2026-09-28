import {
  ForbiddenError,
  NotFoundError,
  checkRateLimit,
  db,
  insertSuggestions,
  isWalletAssigned,
  listAssignments,
  logAction,
  notificationReads,
  notifications,
  protectedProcedure,
  requirePermission,
  router,
  users,
  type Actor,
  type Db,
} from "@vtex/core"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { holderKey, loadHolders, recipientsOf, searchHolders, type HolderRef } from "./walletHolders"

/**
 * Suggestions (Dashboard → Wallet). Un membre de l'équipe écrit à propos d'un ou plusieurs wallets ; chaque destinataire (le titulaire, ou les
 * propriétaires et administrateurs d'une entreprise) reçoit le message dans « Notifications / Suggestions » de son wallet.
 *
 *  - envoyer : `suggestions.send` — SUPPORT, ADMIN, SUPER_ADMIN vers n'importe quel wallet ; ACCOUNT_MANAGER **uniquement vers les wallets qui lui sont
 *    attribués** (vérifié côté serveur pour CHAQUE wallet avant tout envoi : un seul refus annule l'ensemble) ;
 *  - lire : `suggestions.read` — un gestionnaire ne voit que ses propres envois ;
 *  - l'état « lu » est propre à chaque destinataire ; chaque envoi est journalisé sur le wallet concerné.
 */

const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const MAX_WALLETS_PER_SEND = 50

const sendProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `suggestions:send:${ctx.actor.id}`, 20, 60_000)
  return next()
})

const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim()

const sendInput = z.object({
  wallets: z.array(z.object({ walletType: walletTypeSchema, holderId: z.number().int().positive() })).min(1, "Choisissez au moins un wallet.").max(MAX_WALLETS_PER_SEND, `Au plus ${MAX_WALLETS_PER_SEND} wallets par envoi.`),
  title: z.string().trim().min(2, "Donnez un titre à la suggestion.").max(120),
  body: z.string().trim().min(2, "Écrivez votre message.").max(500),
})

export async function sendSuggestions(actor: Actor, input: z.infer<typeof sendInput>) {
  requirePermission(actor, "suggestions.send")
  const unique = [...new Map(input.wallets.map((wallet) => [holderKey(wallet), wallet])).values()]
  const holders = await loadHolders(db, unique)

  // Contrôles AVANT tout envoi : existence, puis périmètre du gestionnaire. Le premier refus interrompt l'ensemble.
  for (const wallet of unique) {
    if (!holders.get(holderKey(wallet))) throw new NotFoundError("Un des wallets choisis est introuvable.")
  }
  if (actor.role === "account_manager") {
    for (const wallet of unique) {
      if (!(await isWalletAssigned(db, actor.id, wallet.walletType, wallet.holderId))) {
        throw new ForbiddenError(`Le wallet « ${holders.get(holderKey(wallet))!.name} » ne fait pas partie de votre portefeuille.`)
      }
    }
  }

  const skipped: Array<{ walletType: HolderRef["walletType"]; holderId: number; name: string; reason: string }> = []
  const delivered = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    let recipientsTotal = 0
    let walletsReached = 0
    for (const wallet of unique) {
      const holder = holders.get(holderKey(wallet))!
      const recipients = await recipientsOf(executor, wallet)
      if (recipients.length === 0) {
        skipped.push({ walletType: wallet.walletType, holderId: wallet.holderId, name: holder.name, reason: "Aucun destinataire actif" })
        continue
      }
      const ids = await insertSuggestions(executor, { senderId: actor.id, walletType: wallet.walletType, holderId: wallet.holderId, targetUserIds: recipients.map((recipient) => recipient.userId), title: input.title, body: input.body })
      await logAction(executor, actor.id, "suggestion.send", wallet.walletType === "PERSONAL" ? "user" : "business", wallet.holderId, { title: input.title, recipients: recipients.length, notificationIds: ids }, wallet)
      recipientsTotal += recipients.length
      walletsReached += 1
    }
    return { recipients: recipientsTotal, wallets: walletsReached }
  })
  return { sent: delivered.recipients, wallets: delivered.wallets, skipped }
}

export async function listSuggestions(actor: Actor, input: { status?: "read" | "unread"; search?: string; limit?: number } = {}) {
  requirePermission(actor, "suggestions.read")
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500)
  // Un gestionnaire ne lit que ses propres envois ; SUPPORT et administrateurs voient tout.
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.kind, "suggestion"), actor.role === "account_manager" ? eq(notifications.createdBy, actor.id) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.flatMap((row) => [row.createdBy, row.targetUserId].filter((value): value is number => value !== null)))]
  const [people, reads, holders] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(inArray(users.id, userIds)),
    db.select().from(notificationReads).where(inArray(notificationReads.notificationId, rows.map((row) => row.id))),
    loadHolders(db, rows.filter((row) => row.walletType !== null && row.holderId !== null).map((row) => ({ walletType: row.walletType!, holderId: row.holderId! }))),
  ])
  const needle = input.search?.trim().toLowerCase()
  const list = rows.map((row) => {
    const sender = people.find((person) => person.id === row.createdBy)
    const recipient = people.find((person) => person.id === row.targetUserId)
    const read = reads.find((entry) => entry.notificationId === row.id && entry.userId === row.targetUserId)
    const holder = row.walletType && row.holderId ? holders.get(holderKey({ walletType: row.walletType, holderId: row.holderId })) : undefined
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      walletType: row.walletType,
      holderId: row.holderId,
      holder: holder ? { name: holder.name, subtitle: holder.subtitle } : null,
      recipient: recipient ? { id: recipient.id, name: fullName(recipient) } : null,
      sender: sender ? { id: sender.id, name: fullName(sender), role: sender.role } : null,
      read: Boolean(read),
      readAt: read?.readAt ?? null,
    }
  })
  return list
    .filter((row) => !input.status || (input.status === "read" ? row.read : !row.read))
    .filter((row) => !needle || [row.title, row.body, row.holder?.name ?? "", row.recipient?.name ?? "", row.sender?.name ?? ""].some((value) => value.toLowerCase().includes(needle)))
}

/** Wallets vers lesquels l'appelant peut écrire : tous pour SUPPORT/ADMIN, son portefeuille pour un gestionnaire de compte. */
export async function suggestionTargets(actor: Actor, query: string) {
  requirePermission(actor, "suggestions.send")
  if (actor.role !== "account_manager") return searchHolders(query)
  const assigned = await listAssignments(db, actor.id)
  const holders = await loadHolders(db, assigned)
  const needle = query.trim().toLowerCase()
  return assigned
    .map((assignment) => holders.get(holderKey(assignment)))
    .filter((holder): holder is NonNullable<typeof holder> => Boolean(holder))
    .filter((holder) => !needle || `${holder.name} ${holder.subtitle ?? ""}`.toLowerCase().includes(needle))
}

export const adminSuggestionsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.enum(["read", "unread"]).optional(), search: z.string().max(100).optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(({ ctx, input }) => listSuggestions(ctx.actor, input ?? {})),
  send: sendProcedure.input(sendInput).mutation(({ ctx, input }) => sendSuggestions(ctx.actor, input)),
  targets: protectedProcedure.input(z.object({ query: z.string().max(100).default("") })).query(({ ctx, input }) => suggestionTargets(ctx.actor, input.query)),
})
