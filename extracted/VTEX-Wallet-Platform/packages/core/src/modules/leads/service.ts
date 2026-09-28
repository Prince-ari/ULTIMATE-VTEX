import { desc, eq } from "drizzle-orm"

import type { Db } from "../../db/client"
import { leads } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole, ValidationError, NotFoundError } from "../../auth/permissions"
import { createUserInternal, type CreateUserInput } from "../users/service"
import { logAction } from "../journal/service"

/** leads.list — Admin + Agent (Sprint 0 §8, extension de la règle Sprint 5 §7). */
export async function listLeads(db: Db, actor: Actor) {
  requireRole(actor, "admin", "agent")
  return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(2000)
}

/** leads.getById */
export async function getLeadById(db: Db, actor: Actor, id: number) {
  requireRole(actor, "admin", "agent")
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  if (!row) throw new NotFoundError(`Lead #${id} introuvable.`)
  return row
}

/** leads.create */
export async function createLead(
  db: Db,
  actor: Actor,
  input: { firstName: string; lastName: string; email?: string; phone?: string; source?: string },
) {
  requireRole(actor, "admin", "agent")
  if (!input.email && !input.phone) {
    throw new ValidationError("Au moins un moyen de contact (email ou téléphone) est requis.")
  }
  const [inserted] = await db.insert(leads).values({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: input.source ?? null,
    status: "new",
    notes: [],
  })
  return inserted.insertId
}

/** leads.update — inclut le changement de statut (Kanban). */
export async function updateLead(
  db: Db,
  actor: Actor,
  id: number,
  patch: Partial<{ status: "new" | "contacted" | "qualified" | "converted" | "lost"; source: string }>,
) {
  requireRole(actor, "admin", "agent")
  await db.update(leads).set(patch).where(eq(leads.id, id))
}

/** leads.addNote — note horodatée, append-only. */
export async function addLeadNote(db: Db, actor: Actor, id: number, body: string) {
  requireRole(actor, "admin", "agent")
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  if (!lead) throw new NotFoundError(`Lead #${id} introuvable.`)
  const notes = [...lead.notes, { authorId: actor.id, body, createdAt: new Date().toISOString() }]
  await db.update(leads).set({ notes }).where(eq(leads.id, id))
}

/**
 * leads.convertToUser — appelle une fonction de création d'utilisateur en
 * interne, pour garantir qu'un utilisateur créé depuis un lead suit
 * exactement les mêmes règles qu'un utilisateur créé directement (Sprint
 * 5 §7, principe « une seule façon de faire chaque chose »).
 *
 * `createUserFn` est injectable : par défaut, la version générique du Core.
 * Un domaine produit peut fournir sa propre version d’orchestration sans que
 * ce module générique ait besoin de connaître ses effets de bord — frontière
 * explicite entre le noyau transverse et les fonctionnalités métier.
 */
export async function convertLeadToUser(
  db: Db,
  actor: Actor,
  id: number,
  temporaryPassword: string,
  createUserFn: (db: Db, actorId: number, input: CreateUserInput) => Promise<number> = createUserInternal,
) {
  requireRole(actor, "admin", "agent")
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  if (!lead) throw new NotFoundError(`Lead #${id} introuvable.`)
  if (!lead.email) throw new ValidationError("Le lead doit avoir un email pour être converti.")
  if (lead.status === "converted") throw new ValidationError("Ce lead est déjà converti.")

  // Appel interne, sans re-vérification de rôle : le requireRole(admin, agent)
  // en haut de cette fonction est le seul contrôle nécessaire — c'est le
  // chemin contrôlé explicitement voulu au Sprint 0 §2 pour qu'un agent
  // puisse indirectement créer un compte, uniquement via la conversion.
  const userId = await createUserFn(db, actor.id, {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone ?? undefined,
    temporaryPassword,
  })

  await db.update(leads).set({ status: "converted", convertedUserId: userId }).where(eq(leads.id, id))
  await logAction(db, actor.id, "lead.convertToUser", "lead", id, { userId })
  return userId
}
