import { randomUUID } from "node:crypto"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"
import { CURRENCY_CODES } from "@vtex/money"
import { ForbiddenError, NotFoundError, RateLimitError, ValidationError, checkRateLimit, clientIp, db, logAction, runWithRequestContext, stripePublicConfig } from "@vtex/core"

import { API_KEY_PATTERN, apiKeyState, hashApiKey, parseScopes, type ApiScope } from "./apiKeys"
import { apiKeys, businessTransactions, businessWalletAccounts, businesses, paymentLinkEvents, paymentLinkPayments, paymentLinks } from "./db/schema"
import { insertPaymentLinkRecord } from "./service"

/**
 * API publique `/api/v1` (Wallet Pro) — authentifiée par clé (`Authorization: Bearer vtx_…`), destinée aux serveurs de l'entreprise.
 *
 *  - chaque route exige un droit précis (scope) ; sans lui : 403 `insufficient_scope` ;
 *  - une clé `vtx_test_` n'est utilisable que sur une plateforme en simulation ou en test, une clé `vtx_live_` que sur une plateforme en mode réel :
 *    on ne mélange jamais l'outillage de test et de l'argent réel ;
 *  - une entreprise ne voit JAMAIS les données d'une autre : toutes les requêtes sont filtrées par l'entreprise de la clé ;
 *  - limites de débit par clé et par adresse, échecs d'authentification comptés séparément ;
 *  - aucun en-tête CORS : une clé secrète ne doit pas être utilisée depuis un navigateur ;
 *  - montants en unités mineures (entiers), dates ISO 8601 UTC, erreurs `{ error: { code, message, request_id } }`.
 */

type Environment = "live" | "sandbox"

class ApiHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly headers: Record<string, string> = {}) {
    super(message)
  }
}

export interface ApiPrincipal {
  keyId: number
  keyPrefix: string
  businessId: number
  businessName: string
  mode: Environment
  scopes: ApiScope[]
  createdBy: number
}

/** « live » uniquement quand la plateforme encaisse en réel ; tout autre état (simulation, test, paiement non configuré) est un bac à sable. */
export function platformEnvironment(): Environment {
  return stripePublicConfig().mode === "live" ? "live" : "sandbox"
}

const PER_KEY_LIMIT = 300
const PER_IP_LIMIT = 600
const FAILURE_LIMIT = 30
const MAX_BODY_BYTES = 16 * 1024
const TOUCH_INTERVAL_MS = 60_000

function payUrl(slug: string): string | null {
  const base = (process.env.VTEX_PAY_BASE_URL ?? process.env.NEXT_PUBLIC_BUSINESS_URL ?? "").trim().replace(/\/+$/, "")
  return base ? `${base}/pay/${slug}` : null
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)

/* ── Authentification ──────────────────────────────────────────── */

async function authenticate(req: Request, ip: string): Promise<ApiPrincipal> {
  await checkRateLimit(db, `apiv1:ip:${ip}`, PER_IP_LIMIT, 60_000)
  const rejected = async (status: number, code: string, message: string): Promise<never> => {
    // Les échecs se comptent à part : 30 mauvaises clés par minute et par adresse ferment la porte (429), quelle que soit la cause.
    await checkRateLimit(db, `apiv1:fail:${ip}`, FAILURE_LIMIT, 60_000)
    throw new ApiHttpError(status, code, message, status === 401 ? { "www-authenticate": 'Bearer realm="vtex-api-v1"' } : {})
  }

  const header = req.headers.get("authorization") ?? ""
  if (!header.toLowerCase().startsWith("bearer ")) return rejected(401, "missing_api_key", "Fournissez votre clé dans l'en-tête Authorization: Bearer vtx_…")
  const rawKey = header.slice(7).trim()
  if (!API_KEY_PATTERN.test(rawKey)) return rejected(401, "invalid_api_key", "Clé d'API invalide.")

  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(rawKey))).limit(1)
  if (!key) return rejected(401, "invalid_api_key", "Clé d'API invalide.")
  const state = apiKeyState(key)
  if (state === "revoked") return rejected(401, "api_key_revoked", "Cette clé a été révoquée.")
  if (state === "expired") return rejected(401, "api_key_expired", "Cette clé a expiré : demandez une rotation.")
  if (state !== "active") return rejected(401, "invalid_api_key", "Clé d'API invalide.")

  const [business] = await db.select({ id: businesses.id, brandName: businesses.brandName, status: businesses.status }).from(businesses).where(eq(businesses.id, key.businessId)).limit(1)
  if (!business || business.status !== "active") throw new ApiHttpError(403, "business_inactive", "L'entreprise de cette clé n'est pas active.")

  const environment = platformEnvironment()
  if (key.mode !== environment) {
    throw new ApiHttpError(403, "wrong_environment", key.mode === "live"
      ? "Cette clé de production ne peut pas être utilisée : la plateforme n'est pas en mode réel. Utilisez une clé de test."
      : "Une clé de test ne peut pas être utilisée en production. Utilisez une clé de production.")
  }

  await checkRateLimit(db, `apiv1:key:${key.id}`, PER_KEY_LIMIT, 60_000)

  // Dernière utilisation : au plus une écriture par minute et par clé.
  await db.update(apiKeys).set({ lastUsedAt: new Date(), lastUsedIp: ip }).where(and(eq(apiKeys.id, key.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, new Date(Date.now() - TOUCH_INTERVAL_MS)))))

  return { keyId: key.id, keyPrefix: key.keyPrefix, businessId: key.businessId, businessName: business.brandName, mode: key.mode, scopes: parseScopes(key.scopes), createdBy: key.createdBy }
}

function requireScope(principal: ApiPrincipal, scope: ApiScope) {
  if (!principal.scopes.includes(scope)) throw new ApiHttpError(403, "insufficient_scope", `Cette clé n'a pas le droit « ${scope} ».`)
}

/* ── Sérialisation ─────────────────────────────────────────────── */

type LinkRow = typeof paymentLinks.$inferSelect

function presentLink(link: LinkRow, livemode: boolean) {
  const expired = link.status === "active" && link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()
  return {
    id: link.slug,
    object: "payment_link" as const,
    name: link.name,
    description: link.description,
    amount: link.amountCents,
    currency: link.currency,
    usage: link.mode === "unique" ? ("single_use" as const) : ("reusable" as const),
    status: expired ? "expired" : link.status,
    url: payUrl(link.slug),
    account_id: link.targetAccountId,
    expires_at: iso(link.expiresAt),
    created_at: iso(link.createdAt),
    livemode,
  }
}

const cursorOf = (id: number) => Buffer.from(String(id)).toString("base64url")
function parseCursor(value: string | null): number | null {
  if (!value) return null
  const decoded = Buffer.from(value, "base64url").toString()
  if (!/^\d{1,15}$/.test(decoded)) throw new ApiHttpError(400, "invalid_request", "Curseur invalide.")
  return Number(decoded)
}
function parseLimit(value: string | null): number {
  if (value === null) return 25
  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) throw new ApiHttpError(400, "invalid_request", "limit doit être un entier entre 1 et 100.")
  return Number(value)
}

/* ── Routes ────────────────────────────────────────────────────── */

async function getMe(principal: ApiPrincipal) {
  return { object: "api_key", business: { id: principal.businessId, name: principal.businessName }, key_prefix: principal.keyPrefix, environment: principal.mode, scopes: principal.scopes, livemode: principal.mode === "live" }
}

async function getWallet(principal: ApiPrincipal) {
  requireScope(principal, "wallet:read")
  const rows = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, principal.businessId)).orderBy(businessWalletAccounts.id)
  return {
    object: "list",
    data: rows.map((account) => ({ id: account.id, object: "account", label: account.label, currency: account.currency, status: account.status, available: account.availableBalanceCents, reserved: account.reservedBalanceCents })),
  }
}

async function listTransactions(principal: ApiPrincipal, params: URLSearchParams) {
  requireScope(principal, "transactions:read")
  const limit = parseLimit(params.get("limit"))
  const after = parseCursor(params.get("cursor"))
  const accountParam = params.get("account_id")
  if (accountParam !== null && !/^\d{1,15}$/.test(accountParam)) throw new ApiHttpError(400, "invalid_request", "account_id doit être un entier.")
  const rows = await db
    .select()
    .from(businessTransactions)
    .where(and(
      eq(businessTransactions.businessId, principal.businessId),
      after !== null ? lt(businessTransactions.id, after) : undefined,
      accountParam !== null ? eq(businessTransactions.businessWalletAccountId, Number(accountParam)) : undefined,
    ))
    .orderBy(desc(businessTransactions.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  return {
    object: "list",
    data: page.map((row) => ({
      id: row.reference,
      object: "transaction",
      type: row.type,
      direction: row.direction,
      status: row.status,
      amount: row.amountCents,
      fee: row.feeCents,
      currency: row.currency,
      description: row.description,
      account_id: row.businessWalletAccountId,
      created_at: iso(row.createdAt),
      completed_at: iso(row.completedAt),
    })),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? cursorOf(page[page.length - 1]!.id) : null,
  }
}

async function listLinks(principal: ApiPrincipal, params: URLSearchParams) {
  requireScope(principal, "payment_links:read")
  const limit = parseLimit(params.get("limit"))
  const after = parseCursor(params.get("cursor"))
  const status = params.get("status")
  if (status !== null && !["active", "expired", "draft", "disabled"].includes(status)) throw new ApiHttpError(400, "invalid_request", "status doit valoir active, expired, draft ou disabled.")
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, principal.businessId), after !== null ? lt(paymentLinks.id, after) : undefined, status ? eq(paymentLinks.status, status as LinkRow["status"]) : undefined))
    .orderBy(desc(paymentLinks.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  return {
    object: "list",
    data: page.map((link) => presentLink(link, principal.mode === "live")),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? cursorOf(page[page.length - 1]!.id) : null,
  }
}

async function getLink(principal: ApiPrincipal, slug: string) {
  requireScope(principal, "payment_links:read")
  if (!/^[A-Za-z0-9_-]{4,24}$/.test(slug)) throw new ApiHttpError(404, "not_found", "Lien de paiement introuvable.")
  const [link] = await db.select().from(paymentLinks).where(and(eq(paymentLinks.slug, slug), eq(paymentLinks.businessId, principal.businessId))).limit(1)
  if (!link) throw new ApiHttpError(404, "not_found", "Lien de paiement introuvable.")
  const [payments, stats] = await Promise.all([
    db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.paymentLinkId, link.id)).orderBy(desc(paymentLinkPayments.createdAt)).limit(20),
    db.select({ kind: paymentLinkEvents.kind, count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${paymentLinkEvents.amountCents}), 0)` }).from(paymentLinkEvents).where(eq(paymentLinkEvents.paymentLinkId, link.id)).groupBy(paymentLinkEvents.kind),
  ])
  const visits = stats.find((row) => row.kind === "visit")
  const paid = stats.find((row) => row.kind === "payment")
  return {
    ...presentLink(link, principal.mode === "live"),
    visits: Number(visits?.count ?? 0),
    payments_count: Number(paid?.count ?? 0),
    collected: Number(paid?.total ?? 0),
    payments: payments.map((payment) => ({
      id: payment.reference,
      object: "payment",
      status: payment.status,
      amount: payment.amountCents,
      currency: payment.currency,
      payer_name: payment.payerName,
      payer_email: payment.payerEmail,
      card_brand: payment.cardBrand,
      card_last4: payment.cardLast4,
      created_at: iso(payment.createdAt),
      credited_at: iso(payment.creditedAt),
    })),
  }
}

const createLinkSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    amount: z.number().int().positive(),
    currency: z.enum(CURRENCY_CODES).optional(),
    usage: z.enum(["single_use", "reusable"]).default("reusable"),
    description: z.string().trim().max(250).optional(),
    expires_at: z.string().datetime().optional(),
    account_id: z.number().int().positive().optional(),
  })
  .strict()

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_.:-]{8,100}$/

function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)
  return code?.code === "ER_DUP_ENTRY" || code?.cause?.code === "ER_DUP_ENTRY"
}

async function createLink(principal: ApiPrincipal, req: Request): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  requireScope(principal, "payment_links:write")
  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) throw new ApiHttpError(415, "unsupported_media_type", "Le corps doit être du JSON (Content-Type: application/json).")
  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) throw new ApiHttpError(413, "payload_too_large", "Corps de requête trop volumineux.")
  const text = await req.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiHttpError(413, "payload_too_large", "Corps de requête trop volumineux.")
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new ApiHttpError(400, "invalid_json", "Le corps n'est pas un JSON valide.") }
  const parsed = createLinkSchema.safeParse(json)
  if (!parsed.success) throw new ApiHttpError(400, "invalid_request", parsed.error.issues.map((issue) => `${issue.path.join(".") || "corps"} : ${issue.message}`).join(" ; "))
  const body = parsed.data

  const idempotencyKey = req.headers.get("idempotency-key")
  if (idempotencyKey !== null && !IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw new ApiHttpError(400, "invalid_request", "Idempotency-Key : 8 à 100 caractères parmi lettres, chiffres, _ . : -")

  const replay = async () => {
    const [existing] = await db.select().from(paymentLinks).where(and(eq(paymentLinks.businessId, principal.businessId), eq(paymentLinks.idempotencyKey, idempotencyKey!))).limit(1)
    if (!existing) return null
    if (existing.name !== body.name || existing.amountCents !== body.amount || (body.currency && existing.currency !== body.currency)) {
      throw new ApiHttpError(409, "idempotency_conflict", "Cette Idempotency-Key a déjà servi pour une requête différente.")
    }
    return { status: 200, body: presentLink(existing, principal.mode === "live"), headers: { "idempotent-replayed": "true" } }
  }
  if (idempotencyKey) {
    const existing = await replay()
    if (existing) return existing
  }

  let created: { id: number }
  try {
    created = await insertPaymentLinkRecord(
      principal.businessId,
      principal.createdBy,
      { name: body.name, amountCents: body.amount, currency: body.currency, mode: body.usage === "single_use" ? "unique" : "recurring", targetAccountId: body.account_id, description: body.description, expiresAt: body.expires_at ? new Date(body.expires_at) : undefined },
      { createdViaKeyId: principal.keyId, idempotencyKey: idempotencyKey ?? undefined },
    )
  } catch (error) {
    // Deux requêtes simultanées avec la même clé : la seconde retrouve le lien de la première.
    if (idempotencyKey && isDuplicateKeyError(error)) {
      const existing = await replay()
      if (existing) return existing
    }
    throw error
  }
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, created.id)).limit(1)
  await logAction(db, null, "business.payment_link.create", "payment_link", created.id, { name: body.name, amountCents: body.amount, currency: link!.currency, mode: link!.mode, targetAccountId: link!.targetAccountId, via: "api", apiKeyId: principal.keyId, keyPrefix: principal.keyPrefix }, { walletType: "PROFESSIONAL", holderId: principal.businessId })
  return { status: 201, body: presentLink(link!, principal.mode === "live"), headers: {} }
}

/* ── Routage ───────────────────────────────────────────────────── */

function respond(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId, ...extra },
  })
}

function failure(status: number, code: string, message: string, requestId: string, extra: Record<string, string> = {}): Response {
  return respond(status, { error: { code, message, request_id: requestId } }, requestId, extra)
}

export async function handleApiV1(req: Request): Promise<Response> {
  const requestId = randomUUID()
  try {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean)
    const method = req.method.toUpperCase()

    const route = (() => {
      const [first, second, third] = segments
      if (first === "me" && !second) return { name: "me", allow: ["GET"] }
      if (first === "wallet" && !second) return { name: "wallet", allow: ["GET"] }
      if (first === "transactions" && !second) return { name: "transactions", allow: ["GET"] }
      if (first === "payment_links" && !second) return { name: "payment_links", allow: ["GET", "POST"] }
      if (first === "payment_links" && second && !third) return { name: "payment_link", allow: ["GET"], id: second }
      return null
    })()
    if (!route) return failure(404, "not_found", "Route inconnue.", requestId)
    if (!route.allow.includes(method)) return failure(405, "method_not_allowed", `Méthode ${method} non autorisée ici.`, requestId, { allow: route.allow.join(", ") })

    const ip = clientIp(req.headers.get("x-forwarded-for"), null)
    const principal = await authenticate(req, ip)
    const context = { requestId, actorId: null, actorRole: "api_key", sessionJti: null, ip, supportSessionId: null }

    return await runWithRequestContext(context, async () => {
      const livemode = principal.mode === "live"
      switch (route.name) {
        case "me": return respond(200, { ...(await getMe(principal)) }, requestId)
        case "wallet": return respond(200, { ...(await getWallet(principal)), livemode }, requestId)
        case "transactions": return respond(200, { ...(await listTransactions(principal, url.searchParams)), livemode }, requestId)
        case "payment_links": {
          if (method === "POST") {
            const result = await createLink(principal, req)
            return respond(result.status, result.body, requestId, result.headers)
          }
          return respond(200, { ...(await listLinks(principal, url.searchParams)), livemode }, requestId)
        }
        default: return respond(200, await getLink(principal, route.id!), requestId)
      }
    })
  } catch (error) {
    if (error instanceof ApiHttpError) return failure(error.status, error.code, error.message, requestId, error.headers)
    if (error instanceof RateLimitError) return failure(429, "rate_limited", `Trop de requêtes. Réessayez dans ${error.retryAfterSeconds} s.`, requestId, { "retry-after": String(error.retryAfterSeconds) })
    if (error instanceof ValidationError) return failure(400, "invalid_request", error.message, requestId)
    if (error instanceof NotFoundError) return failure(404, "not_found", error.message, requestId)
    if (error instanceof ForbiddenError) return failure(403, "forbidden", error.message, requestId)
    console.error("[api-v1] erreur interne", requestId, error instanceof Error ? error.message : error)
    return failure(500, "internal_error", "Erreur interne. Communiquez l'identifiant de requête au support.", requestId)
  }
}
