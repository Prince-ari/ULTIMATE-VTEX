import { eq, lt, sql } from "drizzle-orm"

import type { Db } from "../db/client"
import { rateLimitBuckets } from "../db/schema"

/**
 * Rate limiting adossé à la base — remplace la Map en mémoire du process.
 * L'incrément est effectué par un upsert atomique sur la clé primaire : cela
 * évite le cas où SELECT ... FOR UPDATE ne verrouille aucune ligne parce que
 * le bucket n'existe pas encore.
 */
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Trop de tentatives. Réessayez dans ${retryAfterSeconds}s.`)
    this.name = "RateLimitError"
  }
}

/** Nettoyage opportuniste des entrées expirées. */
export async function cleanupExpiredBuckets(db: Db): Promise<void> {
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetsAt, new Date()))
}

export async function checkRateLimit(
  db: Db,
  key: string,
  maxAttempts: number,
  windowMs: number,
  now = new Date(),
): Promise<void> {
  if (Math.random() < 0.02) await cleanupExpiredBuckets(db)

  const nextReset = new Date(now.getTime() + windowMs)
  // Les dates passent par l'encodeur de la colonne (UTC), comme celles écrites par `.values()` : un `Date` brut dans `sql` serait sérialisé dans le fuseau
  // local du process et décalerait chaque fenêtre de l'écart avec UTC (verrouillages de plusieurs heures sur un serveur non UTC).
  const nowParam = sql.param(now, rateLimitBuckets.resetsAt)
  const nextResetParam = sql.param(nextReset, rateLimitBuckets.resetsAt)

  await db.transaction(async (tx) => {
    await tx
      .insert(rateLimitBuckets)
      .values({ bucketKey: key, count: 1, resetsAt: nextReset })
      .onDuplicateKeyUpdate({
        set: {
          count: sql`IF(${rateLimitBuckets.resetsAt} < ${nowParam}, 1, ${rateLimitBuckets.count} + 1)`,
          resetsAt: sql`IF(${rateLimitBuckets.resetsAt} < ${nowParam}, ${nextResetParam}, ${rateLimitBuckets.resetsAt})`,
        },
      })

    const [bucket] = await tx
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.bucketKey, key))
      .limit(1)

    if (!bucket) throw new Error("Le bucket de rate limiting n'a pas pu être créé.")
    if (bucket.count > maxAttempts) {
      throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetsAt.getTime() - now.getTime()) / 1000)))
    }
  })
}

/** Exposé pour les tests uniquement — réinitialise l'état entre les cas de test. */
export async function _resetRateLimitsForTests(db: Db): Promise<void> {
  await db.delete(rateLimitBuckets)
}
