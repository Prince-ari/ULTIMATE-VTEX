import { randomUUID } from "node:crypto"
import jwt from "jsonwebtoken"
import { eq, lt, or } from "drizzle-orm"

import type { Db } from "../db/client"
import { sessions } from "../db/schema"

/**
 * Lecture paresseuse (fonction, pas constante au chargement du module) —
 * une vérification en haut de fichier s'exécuterait aussi pendant
 * `next build` (Next.js exécute les Route Handlers pendant sa collecte
 * de métadonnées de route, avant que les variables d'environnement de
 * production ne soient nécessairement disponibles), pas seulement à la
 * requête réelle. Même piège que `assertProductionEnv()` dans
 * apps/api/route.ts (Sprint 8) — trouvé cette fois en faisant vraiment
 * le build après le correctif de sécurité, pas en le devinant.
 *
 * Pas de valeur par défaut ici volontairement : `assertProductionEnv()`
 * (appelée par tout point d'entrée réel avant la première requête)
 * garantit que JWT_SECRET est présent et valide. Un fallback silencieux
 * ici recréerait la faille déjà corrigée (audit de sécurité) si un
 * futur point d'entrée oubliait cette validation — mieux vaut un crash
 * net à la première utilisation qu'une dégradation silencieuse.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET manquant — assertProductionEnv() aurait dû être appelée avant ce module.")
  }
  return secret
}
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

export interface SessionTokenPayload {
  userId: number
  jti: string
}

/**
 * Crée une session : ligne `sessions` en base + JWT signé contenant le jti.
 * Flux exact décrit au Sprint 4 §3.
 */
export async function createSession(
  db: Db,
  userId: number,
  meta: { device?: string; ip?: string } = {},
): Promise<string> {
  const jti = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    jti,
    userId,
    device: meta.device ?? null,
    ip: meta.ip ?? null,
    expiresAt,
  })

  return jwt.sign({ userId, jti } satisfies SessionTokenPayload, getJwtSecret(), {
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
  })
}

/**
 * Vérifie un token : signature JWT valide ET jti toujours présent /
 * non révoqué / non expiré dans `sessions` (Sprint 4 §3, étape 5-6).
 * Retourne l'userId si valide, null sinon — ne lève jamais, c'est à
 * l'appelant (future couche API, étape 7) de décider comment réagir.
 */
export async function verifySessionToken(
  db: Db,
  token: string,
): Promise<{ userId: number; jti: string } | null> {
  let payload: SessionTokenPayload
  try {
    payload = jwt.verify(token, getJwtSecret()) as unknown as SessionTokenPayload
  } catch {
    return null
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.jti, payload.jti))
    .limit(1)

  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt.getTime() < Date.now()) return null

  return { userId: payload.userId, jti: payload.jti }
}

export async function revokeSession(db: Db, jti: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.jti, jti))
}

/**
 * Révoque toutes les sessions actives d'un utilisateur (changement/réinitialisation de mot de passe, suspension, suppression),
 * sauf éventuellement la session courante. Retourne le nombre de sessions coupées.
 */
export async function revokeAllSessions(db: Db, userId: number, exceptJti?: string): Promise<number> {
  const active = await listActiveSessions(db, userId)
  const targets = active.filter((session) => session.jti !== exceptJti)
  for (const session of targets) await revokeSession(db, session.jti)
  return targets.length
}

export async function listActiveSessions(db: Db, userId: number) {
  if (Math.random() < 0.02) await cleanupOldSessions(db)

  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId))
  return rows.filter((s) => !s.revokedAt && s.expiresAt.getTime() > Date.now())
}

/**
 * Supprime les sessions expirées ou révoquées depuis plus de 30 jours —
 * même raisonnement que `cleanupExpiredBuckets` (api/rateLimit.ts) :
 * sans ça, cette table grossit indéfiniment (une ligne par connexion,
 * jamais purgée). Garde les sessions révoquées récentes un moment
 * (utile pour un audit de sécurité — "quand cette session a-t-elle été
 * coupée ?"), pas les expirées naturellement.
 */
export async function cleanupOldSessions(db: Db): Promise<void> {
  const now = new Date()
  const revokedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  await db.delete(sessions).where(
    or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, revokedCutoff)),
  )
}
