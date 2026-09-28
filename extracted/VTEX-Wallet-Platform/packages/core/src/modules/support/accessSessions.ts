import { and, desc, eq, isNull } from "drizzle-orm"

import type { Db } from "../../db/client"
import { supportSessions, type SupportSession, type WalletType } from "../../db/schema"
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../../auth/permissions"
import { requirePermission } from "../../auth/rbac"
import { logAction } from "../journal/service"

export type AccessSessionMode = "read_only" | "operator"

const MIN_REASON_LENGTH = 8
const MIN_DURATION_MINUTES = 5
const MAX_DURATION_MINUTES = 120
const DEFAULT_DURATION_MINUTES = 20

function isExpired(session: Pick<SupportSession, "expiresAt" | "endedAt">): boolean {
  return session.endedAt === null && session.expiresAt.getTime() <= Date.now()
}

/** Referme silencieusement une session expirée à la lecture — pas de tâche planifiée, l'expiration est vérifiée à chaque accès. */
async function reapIfExpired(db: Db, session: SupportSession): Promise<SupportSession> {
  if (!isExpired(session)) return session
  await db.update(supportSessions).set({ endedAt: new Date(), endedReason: "expired" }).where(and(eq(supportSessions.id, session.id), isNull(supportSessions.endedAt)))
  return { ...session, endedAt: new Date(), endedReason: "expired" }
}

/** La session d'accès active de CET acteur, si elle existe et n'a pas expiré (une seule à la fois, cf. startAccessSession). */
export async function getMyActiveAccessSession(db: Db, actor: Actor): Promise<SupportSession | null> {
  const [row] = await db
    .select()
    .from(supportSessions)
    .where(and(eq(supportSessions.startedBy, actor.id), isNull(supportSessions.endedAt)))
    .orderBy(desc(supportSessions.startedAt))
    .limit(1)
  if (!row) return null
  const reaped = await reapIfExpired(db, row)
  return reaped.endedAt ? null : reaped
}

/**
 * Démarre une session d'accès à un wallet, motif et durée obligatoires. `read_only` : réservé à la consultation
 * (`access_session.start_readonly`, SUPPORT/ADMIN/SUPER_ADMIN). `operator` : autorise en plus les mutations déjà
 * protégées par leurs propres permissions le temps de la session (`access_session.start_operator`, ADMIN/SUPER_ADMIN
 * uniquement — décision produit : un simple SUPPORT ne peut pas agir sur l'argent d'un titulaire sans escalade).
 * Une session déjà active pour cet acteur est close (`superseded`), jamais empilée.
 */
export async function startAccessSession(
  db: Db,
  actor: Actor,
  input: { walletType: WalletType; holderId: number; mode: AccessSessionMode; reason: string; durationMinutes?: number },
): Promise<SupportSession> {
  requirePermission(actor, input.mode === "operator" ? "access_session.start_operator" : "access_session.start_readonly")
  const reason = input.reason.trim()
  if (reason.length < MIN_REASON_LENGTH) throw new ValidationError(`Le motif doit contenir au moins ${MIN_REASON_LENGTH} caractères.`)
  const duration = Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(input.durationMinutes ?? DEFAULT_DURATION_MINUTES)))

  const current = await getMyActiveAccessSession(db, actor)
  if (current) await db.update(supportSessions).set({ endedAt: new Date(), endedReason: "superseded" }).where(eq(supportSessions.id, current.id))

  const expiresAt = new Date(Date.now() + duration * 60_000)
  const [inserted] = await db.insert(supportSessions).values({ startedBy: actor.id, walletType: input.walletType, holderId: input.holderId, mode: input.mode, reason, expiresAt })
  await logAction(db, actor.id, "access_session.start", "support_session", inserted.insertId, { mode: input.mode, reason, durationMinutes: duration }, { walletType: input.walletType, holderId: input.holderId })

  const [session] = await db.select().from(supportSessions).where(eq(supportSessions.id, inserted.insertId)).limit(1)
  if (!session) throw new Error("La session d'accès n'a pas pu être créée.")
  return session
}

/** Termine une session avant son expiration naturelle. Idempotent : terminer une session déjà close ne fait rien. */
export async function endAccessSession(db: Db, actor: Actor, sessionId: number): Promise<void> {
  const [session] = await db.select().from(supportSessions).where(eq(supportSessions.id, sessionId)).limit(1)
  if (!session) throw new NotFoundError(`Session d'accès #${sessionId} introuvable.`)
  if (session.startedBy !== actor.id) requirePermission(actor, "access_session.manage_any")
  if (session.endedAt) return
  await db.update(supportSessions).set({ endedAt: new Date(), endedReason: "manual" }).where(eq(supportSessions.id, sessionId))
  await logAction(db, actor.id, "access_session.end", "support_session", sessionId, undefined, { walletType: session.walletType, holderId: session.holderId })
}

/** Historique des sessions d'accès à un wallet donné — onglet « Activité » d'une fiche, permission `audit.read`. */
export async function listAccessSessionsForHolder(db: Db, actor: Actor, walletType: WalletType, holderId: number, limit = 50): Promise<SupportSession[]> {
  requirePermission(actor, "audit.read")
  return db
    .select()
    .from(supportSessions)
    .where(and(eq(supportSessions.walletType, walletType), eq(supportSessions.holderId, holderId)))
    .orderBy(desc(supportSessions.startedAt))
    .limit(Math.min(limit, 200))
}

/**
 * Garde-fou côté écriture : si l'acteur a une session ACTIVE sur CE titulaire précis et qu'elle est en lecture
 * seule, la mutation est refusée — la session déclare explicitement une intention de simple consultation.
 * Sans session active sur ce titulaire (cas normal, y compris tout le fonctionnement actuel du Dashboard), le
 * comportement est strictement inchangé : le RBAC habituel de chaque mutation continue seul de décider.
 */
export async function assertOperatorAccess(db: Db, actor: Actor, holder: { walletType: WalletType; holderId: number }): Promise<void> {
  const session = await getMyActiveAccessSession(db, actor)
  if (!session) return
  if (session.walletType !== holder.walletType || session.holderId !== holder.holderId) return
  if (session.mode === "read_only") throw new ForbiddenError("Session d'accès en lecture seule : passez en mode opérateur pour agir sur ce wallet.")
}
