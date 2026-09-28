import { and, desc, eq } from "drizzle-orm"

import type { Db } from "../../db/client"
import { logs, type WalletType } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requirePermission } from "../../auth/rbac"
import { requireRole } from "../../auth/permissions"
import { currentRequestContext } from "../../api/requestContext"

/**
 * Fonction unique appelée par tous les autres services à chaque action
 * sensible — garantit qu'aucune action ne peut être journalisée de façon
 * incohérente selon le module qui l'a déclenchée (Sprint 5 §11).
 * `actorId` null = action système (ex: job planifié notifications).
 *
 * Le contexte de la requête (rôle, session, IP, identifiant de requête, session support) est ajouté automatiquement ;
 * `scope` rattache l'événement à un wallet (PERSONAL → users.id, PROFESSIONAL → businesses.id) pour la fiche de ce wallet.
 * Ne jamais placer de secret (mot de passe, PIN, clé, code) dans `detail`.
 */
export async function logAction(
  db: Db,
  actorId: number | null,
  action: string,
  targetType: string,
  targetId: number,
  detail?: Record<string, unknown>,
  scope?: { walletType: WalletType; holderId: number },
): Promise<void> {
  const context = currentRequestContext()
  // Le rôle et la session ne sont attachés que si l'acteur journalisé EST l'acteur authentifié de la requête
  // (ex. : `ensureWalletAccount` journalise parfois le nouveau titulaire, pas l'administrateur qui agit).
  const sameActor = context !== undefined && actorId !== null && context.actorId === actorId
  // Une requête authentifiée par clé d'API n'a pas d'utilisateur (actorId null) : son rôle « api_key » est conservé pour que le journal dise qui agit.
  const viaApiKey = context !== undefined && actorId === null && context.actorId === null && context.actorRole === "api_key"
  await db.insert(logs).values({
    actorId,
    action,
    targetType,
    targetId,
    detail: detail ?? null,
    actorRole: sameActor || viaApiKey ? context.actorRole : null,
    sessionJti: sameActor ? context.sessionJti : null,
    supportSessionId: sameActor ? context.supportSessionId : null,
    ip: context?.ip ?? null,
    requestId: context?.requestId ?? null,
    walletType: scope?.walletType ?? null,
    holderId: scope?.holderId ?? null,
  })
}

/** journal.list — Sprint 5 §11 : lecture strictement admin, aucune mutation exposée. */
export async function listLogs(
  db: Db,
  actor: Actor,
  filters: { targetType?: string; limit?: number } = {},
) {
  requireRole(actor, "admin")

  const conditions = filters.targetType ? [eq(logs.targetType, filters.targetType)] : []

  return db
    .select()
    .from(logs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(logs.createdAt))
    .limit(filters.limit ?? 100)
}

/** journal.getById — Sprint 5 §11. */
export async function getLogById(db: Db, actor: Actor, id: number) {
  requireRole(actor, "admin")
  const [row] = await db.select().from(logs).where(eq(logs.id, id)).limit(1)
  return row ?? null
}

/**
 * Historique d'un wallet (tous les événements qui portent son titulaire) — alimente l'onglet « Activité » d'une fiche.
 * Permission `audit.read` (ADMIN et SUPER_ADMIN).
 */
export async function listLogsForHolder(db: Db, actor: Actor, holder: { walletType: WalletType; holderId: number }, limit = 50) {
  requirePermission(actor, "audit.read")
  return db
    .select()
    .from(logs)
    .where(and(eq(logs.walletType, holder.walletType), eq(logs.holderId, holder.holderId)))
    .orderBy(desc(logs.createdAt))
    .limit(Math.min(limit, 200))
}
