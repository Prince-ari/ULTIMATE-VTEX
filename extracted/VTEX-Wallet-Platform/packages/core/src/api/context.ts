import { randomUUID } from "node:crypto"
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"

import { db } from "../db/client"
import { users } from "../db/schema"
import { eq } from "drizzle-orm"
import { verifySessionToken } from "../auth/session"
import type { Actor } from "../auth/permissions"
import type { RequestContext } from "./requestContext"
import { getMyActiveAccessSession } from "../modules/support/accessSessions"
import type { SupportSession } from "../db/schema"

export interface Context {
  actor: Actor | null
  jti: string | null
  ip: string
  requestId: string
  /** Session d'accès active de CET acteur, si elle existe et n'a pas expiré (Sprint 8). Résolue une fois par requête.
   *  Optionnel : absent (plutôt que `null`) dans les `Context` construits à la main par les tests existants — ne les oblige pas à connaître ce champ. */
  supportSession?: SupportSession | null
}

/** La dernière activité n'est réécrite qu'au plus toutes les 5 minutes : une écriture par requête serait coûteuse. */
const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000

/**
 * Adresse du client à partir de X-Forwarded-For.
 *
 * Nginx (deployment/nginx.vtex.conf.template) utilise `$proxy_add_x_forwarded_for` : il AJOUTE l'adresse réelle à droite d'une éventuelle valeur
 * fournie par le client. Seule l'entrée la plus à droite est donc fiable ; l'entrée la plus à gauche est falsifiable et ne doit jamais servir
 * de clé de limitation de débit. `VTEX_TRUSTED_PROXY_HOPS` = nombre de proxys de confiance devant l'API (défaut 1 ; 0 = ignorer l'en-tête).
 */
export function clientIp(forwardedFor: string | null | undefined, socketAddress?: string | null): string {
  const parsed = Number(process.env.VTEX_TRUSTED_PROXY_HOPS ?? 1)
  const hops = Number.isInteger(parsed) && parsed >= 0 ? parsed : 1
  if (hops > 0 && forwardedFor) {
    const chain = forwardedFor.split(",").map((part) => part.trim()).filter(Boolean)
    const trusted = chain[chain.length - hops] ?? chain[0]
    if (trusted) return trusted.slice(0, 45)
  }
  return (socketAddress ?? "unknown").slice(0, 45)
}

/**
 * Logique partagée entre les deux adaptateurs tRPC utilisés par le
 * projet : `standalone` (serveur Node persistant, déploiement VPS,
 * Sprint 8 étape 13) et `fetch` (fonctions serverless Vercel/Netlify).
 * Chacun a sa propre façon d'exposer les en-têtes de requête — cette
 * fonction ne connaît qu'un `authHeader` et une `ip` déjà extraits.
 */
function sessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("vtex_session="))
  return entry ? decodeURIComponent(entry.slice("vtex_session=".length)) : null
}

async function resolveContext(authHeader: string | undefined, cookieHeader: string | undefined, ip: string): Promise<Context> {
  const requestId = randomUUID()
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : sessionCookie(cookieHeader)
  if (!token) return { actor: null, jti: null, ip, requestId, supportSession: null }

  const verified = await verifySessionToken(db, token)
  if (!verified) return { actor: null, jti: null, ip, requestId, supportSession: null }

  const [user] = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1)
  if (!user || user.status !== "active") return { actor: null, jti: null, ip, requestId, supportSession: null }

  // Mot de passe temporaire expiré : la session n'est plus utilisable tant qu'un administrateur n'a pas réinitialisé le compte.
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() < Date.now()) {
    return { actor: null, jti: null, ip, requestId, supportSession: null }
  }

  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVITY_TOUCH_INTERVAL_MS) {
    // Meilleur effort : une erreur d'écriture ne doit jamais refuser une requête légitime.
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id)).catch(() => undefined)
  }

  const actor: Actor = { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword }
  // Seul un membre d'équipe peut avoir une session d'accès ; épargne une requête inutile pour chaque titulaire de wallet.
  const supportSession = user.role !== "user" ? await getMyActiveAccessSession(db, actor) : null
  return { actor, jti: verified.jti, ip, requestId, supportSession }
}

/**
 * Adaptateur `standalone` (Node HTTP brut) — déploiement VPS classique
 * (Sprint 8 étape 13). `req.headers` est un objet Node indexable,
 * `req.socket.remoteAddress` porte l'IP en l'absence de proxy.
 */
export async function createContext({ req }: CreateHTTPContextOptions): Promise<Context> {
  const forwarded = req.headers["x-forwarded-for"]
  const ip = clientIp(typeof forwarded === "string" ? forwarded : undefined, req.socket.remoteAddress)

  return resolveContext(req.headers.authorization, req.headers.cookie, ip)
}

/**
 * Adaptateur `fetch` — fonctions serverless (Vercel/Netlify). `req` est
 * un objet `Request` standard du Web ; les deux plateformes posent
 * l'IP réelle du client dans `x-forwarded-for` (aucune n'expose de
 * socket TCP brut aux fonctions serverless).
 */
export async function createFetchContext({ req }: FetchCreateContextFnOptions): Promise<Context> {
  return createRequestContext(req)
}

/** Contexte réutilisable par les Route Handlers Next hors tRPC (média, SSE). */
export async function createRequestContext(req: Request): Promise<Context> {
  return resolveContext(req.headers.get("authorization") ?? undefined, req.headers.get("cookie") ?? undefined, clientIp(req.headers.get("x-forwarded-for"), null))
}

/** Convertit le contexte tRPC en contexte d'audit (utilisé par le middleware tRPC et les Route Handlers). */
export function toRequestContext(context: Context): RequestContext {
  return {
    requestId: context.requestId,
    actorId: context.actor?.id ?? null,
    actorRole: context.actor?.role ?? null,
    sessionJti: context.jti,
    ip: context.ip,
    supportSessionId: context.supportSession?.id ?? null,
  }
}
