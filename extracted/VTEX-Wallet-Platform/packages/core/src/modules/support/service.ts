import { desc, eq, or } from "drizzle-orm"

import type { Db } from "../../db/client"
import { supportTickets, users } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole, requireSelfOrRole, ValidationError, NotFoundError } from "../../auth/permissions"
import { createSystemNotification } from "../notifications/service"

/** Personnel à alerter d'une activité de ticket (pas d'assignation par ticket : tout admin/agent suit la file). */
async function supportStaff(db: Db) {
  return db.select({ id: users.id }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "agent")))
}

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
  const ticketId = inserted.insertId
  const staff = await supportStaff(db)
  await Promise.all(staff.map((member) => createSystemNotification(db, {
    targetUserId: member.id,
    createdBy: actor.id,
    title: "Nouveau ticket de support",
    body: `« ${subject.trim()} » vient d'être ouvert.`,
  })))
  return ticketId
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

  // Une réponse du titulaire relance la file d'attente du personnel ; une réponse du personnel ne se notifie pas elle-même.
  if (actor.id === ticket.userId) {
    const staff = await supportStaff(db)
    await Promise.all(staff.map((member) => createSystemNotification(db, {
      targetUserId: member.id,
      createdBy: actor.id,
      title: "Nouvelle réponse sur un ticket",
      body: `« ${ticket.subject} » a reçu une réponse du titulaire.`,
    })))
  } else {
    await createSystemNotification(db, {
      targetUserId: ticket.userId,
      createdBy: actor.id,
      title: "Réponse du support",
      body: `« ${ticket.subject} » a reçu une réponse de notre équipe.`,
    })
  }
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
