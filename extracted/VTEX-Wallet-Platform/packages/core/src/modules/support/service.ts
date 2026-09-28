import { desc, eq } from "drizzle-orm"

import type { Db } from "../../db/client"
import { supportTickets } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole, requireSelfOrRole, ValidationError, NotFoundError } from "../../auth/permissions"

/** support.list — admin/agent, tous les tickets. */
export async function listTickets(db: Db, actor: Actor) {
  requireRole(actor, "admin", "agent")
  return db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(2000)
}

/** support.listMine — utilisateur, ses propres tickets uniquement. */
export async function listMyTickets(db: Db, actor: Actor) {
  return db.select().from(supportTickets).where(eq(supportTickets.userId, actor.id)).orderBy(desc(supportTickets.updatedAt))
}

/** support.create — utilisateur. */
export async function createTicket(db: Db, actor: Actor, subject: string, firstMessage: string) {
  if (!subject.trim() || !firstMessage.trim()) {
    throw new ValidationError("Sujet et premier message sont obligatoires.")
  }
  const [inserted] = await db.insert(supportTickets).values({
    userId: actor.id,
    subject,
    status: "open",
    priority: "normal",
    messages: [
      { authorId: actor.id, authorRole: actor.role, body: firstMessage, createdAt: new Date().toISOString() },
    ],
  })
  return inserted.insertId
}

async function ownedTicket(db: Db, actor: Actor, id: number) {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1)
  if (!ticket) throw new NotFoundError(`Ticket #${id} introuvable.`)
  requireSelfOrRole(actor, ticket.userId, "admin", "agent")
  return ticket
}

/** support.reply — admin/agent, ou le propriétaire du ticket (jamais un autre utilisateur). */
export async function replyToTicket(db: Db, actor: Actor, id: number, body: string) {
  const ticket = await ownedTicket(db, actor, id)
  if (!body.trim()) throw new ValidationError("Le message ne peut pas être vide.")
  if (body.length > 2000) throw new ValidationError("Message trop long (2000 caractères max).")

  const messages = [
    ...ticket.messages,
    { authorId: actor.id, authorRole: actor.role, body, createdAt: new Date().toISOString() },
  ]
  await db.update(supportTickets).set({ messages, updatedAt: new Date() }).where(eq(supportTickets.id, id))
}

/** support.updateStatus — admin/agent. */
export async function updateTicketStatus(db: Db, actor: Actor, id: number, status: "open" | "in_progress" | "resolved") {
  requireRole(actor, "admin", "agent")
  await db.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, id))
}

/** support.updatePriority — admin/agent. */
export async function updateTicketPriority(db: Db, actor: Actor, id: number, priority: "low" | "normal" | "high") {
  requireRole(actor, "admin", "agent")
  await db.update(supportTickets).set({ priority, updatedAt: new Date() }).where(eq(supportTickets.id, id))
}
