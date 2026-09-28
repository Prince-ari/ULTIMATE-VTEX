import { createHmac, randomBytes } from "node:crypto"
import { and, desc, eq, sql } from "drizzle-orm"
import { NotFoundError, ValidationError, db, logAction, type Actor } from "@vtex/core"

import { apiKeys } from "./db/schema"
import { requireBusinessRole } from "./service"

/**
 * Clés d'API Wallet Pro.
 *
 *  - une clé est `vtx_live_…` ou `vtx_test_…` suivie de 192 bits aléatoires ; le secret n'est montré QU'UNE FOIS, à la création (ou à la rotation) ;
 *  - seul l'empreinte HMAC-SHA256 est conservée (jamais le secret) : une fuite de la base ne donne aucune clé utilisable ;
 *  - les droits sont un catalogue fermé de scopes, vérifiés par `/api/v1` à chaque requête ;
 *  - expiration planifiée, rotation avec période de grâce, révocation immédiate — chaque changement est journalisé (jamais le secret).
 */

export const API_SCOPES = {
  "wallet:read": { label: "Lire les comptes et les soldes", description: "GET /api/v1/wallet", access: "read" },
  "transactions:read": { label: "Lire les transactions", description: "GET /api/v1/transactions", access: "read" },
  "payment_links:read": { label: "Lire les liens de paiement", description: "GET /api/v1/payment_links", access: "read" },
  "payment_links:write": { label: "Créer des liens de paiement", description: "POST /api/v1/payment_links", access: "write" },
} as const

export type ApiScope = keyof typeof API_SCOPES
export const API_SCOPE_IDS = Object.keys(API_SCOPES) as [ApiScope, ...ApiScope[]]
export const isApiScope = (value: string): value is ApiScope => Object.prototype.hasOwnProperty.call(API_SCOPES, value)

/** MariaDB renvoie les colonnes JSON sous forme de texte : on accepte les deux formes et on écarte tout droit qui n'est plus au catalogue. */
export function parseScopes(value: unknown): ApiScope[] {
  let list: unknown = value
  if (typeof value === "string") {
    try { list = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(list) ? list.filter((scope): scope is ApiScope => typeof scope === "string" && isApiScope(scope)) : []
}

export const API_KEY_PATTERN = /^vtx_(live|test)_[0-9a-f]{48}$/
const MAX_ACTIVE_KEYS_PER_BUSINESS = 20
const MAX_LIFETIME_DAYS = 730
const MAX_GRACE_HOURS = 72

function pepper(): string {
  const value = process.env.VTEX_API_KEY_PEPPER ?? process.env.JWT_SECRET
  if (!value) throw new Error("JWT_SECRET (ou VTEX_API_KEY_PEPPER) est requis pour vérifier les clés d'API.")
  return value
}

/** Empreinte d'une clé : HMAC-SHA256 avec un poivre du serveur. 64 caractères hexadécimaux (les anciennes clés, en scrypt, en font 128 et ne sont plus acceptées). */
export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", pepper()).update(`vtex-api-key:${rawKey}`).digest("hex")
}

export function generateApiKey(mode: "live" | "sandbox"): { rawKey: string; keyPrefix: string } {
  const rawKey = `${mode === "live" ? "vtx_live_" : "vtx_test_"}${randomBytes(24).toString("hex")}`
  return { rawKey, keyPrefix: rawKey.slice(0, 12) }
}

type KeyRow = typeof apiKeys.$inferSelect
export type ApiKeyState = "active" | "expired" | "revoked" | "legacy"

export function apiKeyState(row: Pick<KeyRow, "status" | "expiresAt" | "keyHash">, now = Date.now()): ApiKeyState {
  if (row.status === "revoked") return "revoked"
  if (row.keyHash.length !== 64) return "legacy"
  if (row.expiresAt && row.expiresAt.getTime() <= now) return "expired"
  return "active"
}

export function presentApiKey(row: KeyRow) {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    mode: row.mode,
    scopes: parseScopes(row.scopes),
    state: apiKeyState(row),
    lastUsedAt: row.lastUsedAt,
    lastUsedIp: row.lastUsedIp,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    rotatedFromId: row.rotatedFromId,
    createdAt: row.createdAt,
  }
}

function cleanScopes(scopes: string[]): ApiScope[] {
  const unique = [...new Set(scopes)]
  if (unique.length === 0) throw new ValidationError("Choisissez au moins un droit pour cette clé.")
  const unknown = unique.filter((scope) => !isApiScope(scope))
  if (unknown.length > 0) throw new ValidationError(`Droit inconnu : ${unknown.join(", ")}.`)
  return unique as ApiScope[]
}

function cleanExpiry(expiresAt: Date | undefined): Date | null {
  if (!expiresAt) return null
  if (expiresAt.getTime() <= Date.now()) throw new ValidationError("La date d'expiration doit être dans le futur.")
  if (expiresAt.getTime() > Date.now() + MAX_LIFETIME_DAYS * 86_400_000) throw new ValidationError(`Une clé ne peut pas vivre plus de ${MAX_LIFETIME_DAYS} jours : planifiez sa rotation.`)
  return expiresAt
}

export async function listApiKeys(actor: Actor, businessId: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.businessId, businessId)).orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
  return rows.map(presentApiKey)
}

async function activeCount(businessId: number): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(apiKeys).where(and(eq(apiKeys.businessId, businessId), eq(apiKeys.status, "active"), sql`CHAR_LENGTH(${apiKeys.keyHash}) = 64`, sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > UTC_TIMESTAMP())`))
  return Number(row?.count ?? 0)
}

export async function createApiKey(actor: Actor, businessId: number, input: { label: string; mode: "live" | "sandbox"; scopes: string[]; expiresAt?: Date }) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const label = input.label.trim()
  if (label.length < 2) throw new ValidationError("Donnez un nom à la clé.")
  const scopes = cleanScopes(input.scopes)
  const expiresAt = cleanExpiry(input.expiresAt)
  if ((await activeCount(businessId)) >= MAX_ACTIVE_KEYS_PER_BUSINESS) throw new ValidationError(`Vous avez atteint ${MAX_ACTIVE_KEYS_PER_BUSINESS} clés actives : révoquez-en avant d'en créer.`)
  const { rawKey, keyPrefix } = generateApiKey(input.mode)
  const [result] = await db.insert(apiKeys).values({ businessId, label, keyPrefix, keyHash: hashApiKey(rawKey), mode: input.mode, scopes, expiresAt, createdBy: actor.id })
  await logAction(db, actor.id, "business.api_key.create", "api_key", result.insertId, { label, mode: input.mode, scopes, keyPrefix, expiresAt: expiresAt?.toISOString() ?? null }, { walletType: "PROFESSIONAL", holderId: businessId })
  return { rawKey, keys: await listApiKeys(actor, businessId) }
}

/**
 * Rotation : une nouvelle clé (mêmes droits, même environnement) est créée ; l'ancienne reste valable `graceHours` heures pour laisser le temps de
 * déployer la nouvelle, puis expire (0 = révoquée tout de suite). Le secret de la nouvelle clé n'est montré qu'ici.
 */
export async function rotateApiKey(actor: Actor, businessId: number, keyId: number, graceHours: number) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  if (!Number.isInteger(graceHours) || graceHours < 0 || graceHours > MAX_GRACE_HOURS) throw new ValidationError(`La période de grâce va de 0 à ${MAX_GRACE_HOURS} heures.`)
  const [current] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.businessId, businessId))).limit(1)
  if (!current) throw new NotFoundError("Clé introuvable pour cette entreprise.")
  if (apiKeyState(current) !== "active") throw new ValidationError("Seule une clé active peut être renouvelée.")
  const { rawKey, keyPrefix } = generateApiKey(current.mode)
  const now = new Date()
  const graceEnd = new Date(now.getTime() + graceHours * 3_600_000)
  const oldExpiry = current.expiresAt && current.expiresAt.getTime() < graceEnd.getTime() ? current.expiresAt : graceEnd
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(apiKeys).values({ businessId, label: current.label, keyPrefix, keyHash: hashApiKey(rawKey), mode: current.mode, scopes: parseScopes(current.scopes), expiresAt: current.expiresAt, rotatedFromId: current.id, createdBy: actor.id })
    if (graceHours === 0) await tx.update(apiKeys).set({ status: "revoked", revokedAt: now, revokedBy: actor.id, revokeReason: "Rotation" }).where(eq(apiKeys.id, current.id))
    else await tx.update(apiKeys).set({ expiresAt: oldExpiry }).where(eq(apiKeys.id, current.id))
    return inserted.insertId
  })
  await logAction(db, actor.id, "business.api_key.rotate", "api_key", created, { replaced: current.id, oldKeyPrefix: current.keyPrefix, keyPrefix, graceHours }, { walletType: "PROFESSIONAL", holderId: businessId })
  return { rawKey, keys: await listApiKeys(actor, businessId) }
}

export async function revokeApiKey(actor: Actor, businessId: number, keyId: number, reason?: string) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin")
  const [current] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.businessId, businessId))).limit(1)
  if (!current) throw new NotFoundError("Clé introuvable pour cette entreprise.")
  if (current.status !== "revoked") {
    await db.update(apiKeys).set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.id, revokeReason: reason?.trim().slice(0, 250) || null }).where(eq(apiKeys.id, keyId))
    await logAction(db, actor.id, "business.api_key.revoke", "api_key", keyId, { keyPrefix: current.keyPrefix, reason: reason?.trim() || null }, { walletType: "PROFESSIONAL", holderId: businessId })
  }
  return listApiKeys(actor, businessId)
}
