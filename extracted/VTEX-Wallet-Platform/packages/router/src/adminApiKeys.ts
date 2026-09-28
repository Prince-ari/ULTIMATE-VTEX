import { NotFoundError, checkRateLimit, db, logAction, protectedProcedure, requirePermission, router, users, type Actor } from "@vtex/core"
import { apiKeyState, apiKeys, businesses, presentApiKey, type ApiKeyState } from "@vtex/business"
import { and, desc, eq, like, or } from "drizzle-orm"
import { z } from "zod"

import { likeContains } from "./sqlLike"

/**
 * Clés d'API (Dashboard) — supervision transverse des clés créées dans Wallet Pro.
 *
 *  - lecture : `apikeys.read` (SUPPORT compris). On n'y voit JAMAIS un secret ni son empreinte : seulement le préfixe, les droits, l'état et la dernière utilisation ;
 *  - révoquer une clé compromise : `apikeys.manage` (ADMIN), avec un motif, journalisé sur l'entreprise. La création reste le fait du titulaire.
 */

const STATES = ["active", "expired", "revoked", "legacy"] as const
const reasonSchema = z.string().trim().min(8, "Le motif doit contenir au moins huit caractères.").max(250)

const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})

const fullName = (row: { firstName: string | null; lastName: string | null } | null) => (row ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() : "—")

export async function listApiKeysAdmin(actor: Actor, input: { search?: string; state?: ApiKeyState; businessId?: number } = {}) {
  requirePermission(actor, "apikeys.read")
  const term = input.search?.trim() ? likeContains(input.search) : null
  const rows = await db
    .select({ key: apiKeys, business: { id: businesses.id, brandName: businesses.brandName }, creator: { firstName: users.firstName, lastName: users.lastName } })
    .from(apiKeys)
    .innerJoin(businesses, eq(businesses.id, apiKeys.businessId))
    .leftJoin(users, eq(users.id, apiKeys.createdBy))
    .where(and(input.businessId ? eq(apiKeys.businessId, input.businessId) : undefined, term ? or(like(apiKeys.label, term), like(apiKeys.keyPrefix, term), like(businesses.brandName, term)) : undefined))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
    .limit(500)
  const list = rows.map(({ key, business, creator }) => ({ ...presentApiKey(key), business, createdBy: fullName(creator) }))
  return input.state ? list.filter((key) => key.state === input.state) : list
}

export async function revokeApiKeyAdmin(actor: Actor, input: { id: number; reason: string }) {
  requirePermission(actor, "apikeys.manage")
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, input.id)).limit(1)
  if (!key) throw new NotFoundError("Clé introuvable.")
  if (apiKeyState(key) !== "revoked") {
    await db.update(apiKeys).set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.id, revokeReason: input.reason }).where(eq(apiKeys.id, key.id))
    await logAction(db, actor.id, "api_key.admin.revoke", "api_key", key.id, { keyPrefix: key.keyPrefix, label: key.label, reason: input.reason }, { walletType: "PROFESSIONAL", holderId: key.businessId })
  }
  const [row] = await listApiKeysAdmin(actor, { search: key.keyPrefix, businessId: key.businessId }).then((rows) => rows.filter((entry) => entry.id === key.id))
  return row!
}

export const adminApiKeysRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(100).optional(), state: z.enum(STATES).optional(), businessId: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => listApiKeysAdmin(ctx.actor, input ?? {})),
  revoke: writeProcedure
    .input(z.object({ id: z.number().int().positive(), reason: reasonSchema }))
    .mutation(({ ctx, input }) => revokeApiKeyAdmin(ctx.actor, input)),
})
