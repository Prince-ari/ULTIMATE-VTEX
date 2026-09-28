import { and, desc, eq, inArray } from "drizzle-orm"

import type { Db } from "../../db/client"
import { managerAssignments, users, type WalletType } from "../../db/schema"

/**
 * Attributions gestionnaire ↔ wallet. Ces fonctions ne vérifient AUCUNE permission : l'appelant (router d'administration) l'a déjà fait.
 * Elles ne connaissent pas non plus les tables des wallets (le cœur reste indépendant) : l'existence d'un titulaire est vérifiée par l'appelant.
 */

export interface AssignmentRow {
  id: number
  managerUserId: number
  walletType: WalletType
  holderId: number
  assignedBy: number
  createdAt: Date
}

export const walletKey = (walletType: WalletType, holderId: number) => `${walletType}:${holderId}`

export async function listAssignments(db: Db, managerUserId: number): Promise<AssignmentRow[]> {
  return db.select().from(managerAssignments).where(eq(managerAssignments.managerUserId, managerUserId)).orderBy(desc(managerAssignments.createdAt), desc(managerAssignments.id))
}

/** Attributions de plusieurs gestionnaires en une requête (pas de N+1). */
export async function listAssignmentsOfMany(db: Db, managerIds: number[]): Promise<AssignmentRow[]> {
  if (managerIds.length === 0) return []
  return db.select().from(managerAssignments).where(inArray(managerAssignments.managerUserId, managerIds)).orderBy(desc(managerAssignments.createdAt))
}

/** Gestionnaires d'un wallet, avec leur identité (jamais de secret). */
export async function listManagersOfWallet(db: Db, walletType: WalletType, holderId: number) {
  return db
    .select({ assignmentId: managerAssignments.id, assignedAt: managerAssignments.createdAt, assignedBy: managerAssignments.assignedBy, id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role, status: users.status })
    .from(managerAssignments)
    .innerJoin(users, eq(users.id, managerAssignments.managerUserId))
    .where(and(eq(managerAssignments.walletType, walletType), eq(managerAssignments.holderId, holderId)))
    .orderBy(managerAssignments.createdAt)
}

/** Ce wallet fait-il partie du portefeuille de ce gestionnaire ? Vérification faite côté serveur, à chaque appel scopé. */
export async function isWalletAssigned(db: Db, managerUserId: number, walletType: WalletType, holderId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: managerAssignments.id })
    .from(managerAssignments)
    .where(and(eq(managerAssignments.managerUserId, managerUserId), eq(managerAssignments.walletType, walletType), eq(managerAssignments.holderId, holderId)))
    .limit(1)
  return Boolean(row)
}

/** Idempotent : attribuer deux fois le même wallet au même gestionnaire ne crée pas de doublon (`created: false`). */
export async function insertAssignment(db: Db, input: { managerUserId: number; walletType: WalletType; holderId: number; assignedBy: number }): Promise<{ created: boolean }> {
  if (await isWalletAssigned(db, input.managerUserId, input.walletType, input.holderId)) return { created: false }
  try {
    await db.insert(managerAssignments).values(input)
    return { created: true }
  } catch (error) {
    // Deux attributions simultanées : l'index unique fait foi, la seconde est simplement déjà là.
    const code = (error as { code?: string; cause?: { code?: string } } | null)
    if (code?.code === "ER_DUP_ENTRY" || code?.cause?.code === "ER_DUP_ENTRY") return { created: false }
    throw error
  }
}

export async function deleteAssignment(db: Db, input: { managerUserId: number; walletType: WalletType; holderId: number }): Promise<{ removed: boolean }> {
  const existed = await isWalletAssigned(db, input.managerUserId, input.walletType, input.holderId)
  if (!existed) return { removed: false }
  await db.delete(managerAssignments).where(and(eq(managerAssignments.managerUserId, input.managerUserId), eq(managerAssignments.walletType, input.walletType), eq(managerAssignments.holderId, input.holderId)))
  return { removed: true }
}
