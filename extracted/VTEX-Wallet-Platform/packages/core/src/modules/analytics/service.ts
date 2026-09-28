import { sql } from "drizzle-orm"

import type { Db } from "../../db/client"
import { leads } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole } from "../../auth/permissions"

/**
 * Analytics générique — uniquement les indicateurs transversaux du Core.
 * Les métriques propres à un domaine produit doivent rester dans ce domaine
 * et être composées séparément, afin de ne pas élargir le schéma du noyau.
 */

/** analytics.leadsFunnel — admin. */
export async function leadsFunnel(db: Db, actor: Actor) {
  requireRole(actor, "admin", "agent")
  const rows = await db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status)
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }))
}
