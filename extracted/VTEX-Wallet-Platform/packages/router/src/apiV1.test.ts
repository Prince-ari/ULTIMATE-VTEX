import { randomBytes, randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db, hashPassword, logs, users, type Actor, type Role } from "@vtex/core"
import { apiKeyState, apiKeys, businessWalletAccounts, handleApiV1, hashApiKey, paymentLinks, type ApiScope } from "@vtex/business"

import { createManagedUser } from "./admin"
import { appRouter } from "./index"

const SAVED_BASE = process.env.VTEX_PAY_BASE_URL
beforeAll(() => { process.env.VTEX_PAY_BASE_URL = "https://pro.vtex.test" })
afterAll(() => { if (SAVED_BASE === undefined) delete process.env.VTEX_PAY_BASE_URL; else process.env.VTEX_PAY_BASE_URL = SAVED_BASE })

async function makeStaff(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Staff", lastName: suffix, email: `apiv1-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}
const callerFor = (actor: Actor | null, ip = "10.9.0.1") => appRouter.createCaller({ actor, jti: actor ? "jti-apiv1" : null, ip, requestId: `req-${randomUUID().slice(0, 6)}` })
const freshIp = () => `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`
const detailOf = (entry: { detail: unknown }) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail) as Record<string, unknown>

async function company(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Dev", lastName: suffix, email: `dev-apiv1-${suffix}@test.local`, walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: `SARL API ${suffix}`, brandName: `Api ${suffix}` } })
  return { owner: { id: created.userId, role: "user" as const } satisfies Actor, businessId: created.businessId!, accountId: created.businessAccountId! }
}

const ALL_SCOPES: ApiScope[] = ["wallet:read", "transactions:read", "payment_links:read", "payment_links:write"]

async function newKey(shop: Awaited<ReturnType<typeof company>>, scopes: ApiScope[] = ALL_SCOPES, mode: "live" | "sandbox" = "sandbox") {
  const created = await callerFor(shop.owner).developers.createApiKey({ businessId: shop.businessId, label: "Serveur boutique", mode, scopes })
  return { rawKey: created.rawKey, keys: created.keys }
}

interface CallOptions { key?: string | null; method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; ip?: string }
async function api(path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? freshIp(), ...(options.headers ?? {}) }
  if (options.key !== null && options.key !== undefined) headers.authorization = `Bearer ${options.key}`
  const hasBody = options.body !== undefined || options.rawBody !== undefined
  if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json"
  const response = await handleApiV1(new Request(`http://localhost/api/v1/${path}`, { method: options.method ?? (hasBody ? "POST" : "GET"), headers, body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined) }))
  const text = await response.text()
  return { status: response.status, headers: response.headers, json: text ? (JSON.parse(text) as Record<string, any>) : null }
}

describe("clés d'API — génération et stockage", () => {
  it("le secret n'est montré qu'à la création ; la base ne conserve que son empreinte HMAC ; les listes n'exposent ni secret ni empreinte", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey, keys } = await newKey(shop)
    expect(rawKey).toMatch(/^vtx_test_[0-9a-f]{48}$/)
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.businessId, shop.businessId))
    expect(row!.keyHash).toHaveLength(64)
    expect(row!.keyHash).toBe(hashApiKey(rawKey))
    expect(row!.keyHash).not.toContain(rawKey)
    expect(JSON.stringify(row)).not.toContain(rawKey)
    const listed = JSON.stringify([keys, await callerFor(shop.owner).developers.listApiKeys({ businessId: shop.businessId })])
    expect(listed).not.toContain(rawKey)
    expect(listed).not.toContain(row!.keyHash)
    expect(listed).not.toMatch(/keyHash|key_hash/)
    expect(keys[0]).toMatchObject({ label: "Serveur boutique", mode: "sandbox", state: "active", keyPrefix: rawKey.slice(0, 12), scopes: ALL_SCOPES })
    expect(hashApiKey(rawKey)).not.toBe(hashApiKey(`${rawKey.slice(0, -1)}0`))
  })

  it("droits fermés, expiration bornée, plafond de clés actives, réservé aux propriétaires et administrateurs de l'entreprise", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const rival = await company(admin)
    const owner = callerFor(shop.owner)
    await expect(owner.developers.createApiKey({ businessId: shop.businessId, label: "Droit inconnu", mode: "sandbox", scopes: ["wallet:write" as never] })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(owner.developers.createApiKey({ businessId: shop.businessId, label: "Sans droit", mode: "sandbox", scopes: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(owner.developers.createApiKey({ businessId: shop.businessId, label: "Déjà expirée", mode: "sandbox", scopes: ["wallet:read"], expiresAt: new Date(Date.now() - 3_600_000) })).rejects.toThrow(/dans le futur/)
    await expect(owner.developers.createApiKey({ businessId: shop.businessId, label: "Trop longue", mode: "sandbox", scopes: ["wallet:read"], expiresAt: new Date(Date.now() + 900 * 86_400_000) })).rejects.toThrow(/730 jours/)
    // Une autre entreprise ne crée ni ne liste rien chez la première.
    await expect(callerFor(rival.owner).developers.createApiKey({ businessId: shop.businessId, label: "Intrusion", mode: "sandbox", scopes: ["wallet:read"] })).rejects.toThrow()
    await expect(callerFor(rival.owner).developers.listApiKeys({ businessId: shop.businessId })).rejects.toThrow()
    await expect(callerFor(null).developers.listApiKeys({ businessId: shop.businessId })).rejects.toThrow(/Authentification/)
    const catalogue = await owner.developers.apiScopes()
    expect(catalogue.map((scope) => scope.id).sort()).toEqual([...ALL_SCOPES].sort())
  })
})

describe("/api/v1 — authentification", () => {
  it("clé absente, mal formée, inconnue, révoquée, expirée, environnement inadapté : refus distincts, jamais de données", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)

    const missing = await api("me")
    expect(missing).toMatchObject({ status: 401, json: { error: { code: "missing_api_key" } } })
    expect(missing.headers.get("www-authenticate")).toMatch(/Bearer/)
    expect(missing.json!.error.request_id).toBe(missing.headers.get("x-request-id"))
    expect((await api("me", { key: "pas-une-cle" })).json!.error.code).toBe("invalid_api_key")
    expect((await api("me", { key: `vtx_test_${"0".repeat(48)}` })).json!.error.code).toBe("invalid_api_key")

    const ok = await api("me", { key: rawKey })
    expect(ok.status).toBe(200)
    expect(ok.json).toMatchObject({ object: "api_key", environment: "sandbox", livemode: false, key_prefix: rawKey.slice(0, 12), scopes: ALL_SCOPES })
    expect(ok.headers.get("cache-control")).toBe("no-store")
    expect(ok.headers.get("access-control-allow-origin")).toBeNull()

    // Une clé de production sur une plateforme qui n'encaisse pas en réel (ici : simulation) est refusée.
    const live = await newKey(shop, ["wallet:read"], "live")
    const wrong = await api("wallet", { key: live.rawKey })
    expect(wrong).toMatchObject({ status: 403, json: { error: { code: "wrong_environment" } } })

    await db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(apiKeys.keyHash, hashApiKey(rawKey)))
    expect((await api("me", { key: rawKey })).json!.error.code).toBe("api_key_expired")

    const second = await newKey(shop)
    const secondRow = (await callerFor(shop.owner).developers.listApiKeys({ businessId: shop.businessId })).find((key) => second.rawKey.startsWith(key.keyPrefix) && key.state === "active")!
    await callerFor(shop.owner).developers.revokeApiKey({ businessId: shop.businessId, keyId: secondRow.id, reason: "Clé exposée par erreur" })
    expect((await api("me", { key: second.rawKey })).json!.error.code).toBe("api_key_revoked")
  })

  it("une clé héritée (empreinte scrypt de 128 caractères) est signalée et ne s'authentifie jamais", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const rawKey = `vtx_test_${randomBytes(24).toString("hex")}`
    await db.insert(apiKeys).values({ businessId: shop.businessId, label: "Ancienne clé", keyPrefix: rawKey.slice(0, 12), keyHash: randomBytes(64).toString("hex"), mode: "sandbox", scopes: ["wallet:read"], createdBy: shop.owner.id })
    expect((await api("me", { key: rawKey })).status).toBe(401)
    const listed = await callerFor(shop.owner).developers.listApiKeys({ businessId: shop.businessId })
    expect(listed.find((key) => key.label === "Ancienne clé")?.state).toBe("legacy")
    expect(apiKeyState({ status: "active", expiresAt: null, keyHash: "f".repeat(128) })).toBe("legacy")
  })

  it("30 échecs d'authentification par minute et par adresse ferment la porte (429 avec Retry-After), même pour une bonne clé", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const ip = freshIp()
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await api("me", { key: `vtx_test_${"1".repeat(48)}`, ip })).status).toBe(401)
    const blocked = await api("me", { key: `vtx_test_${"1".repeat(48)}`, ip })
    expect(blocked).toMatchObject({ status: 429, json: { error: { code: "rate_limited" } } })
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    // Une autre adresse n'est pas touchée.
    expect((await api("me", { key: rawKey })).status).toBe(200)
  })

  it("la dernière utilisation (date et adresse) est enregistrée et visible du titulaire et du Dashboard", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const ip = freshIp()
    await api("me", { key: rawKey, ip })
    const mine = (await callerFor(shop.owner).developers.listApiKeys({ businessId: shop.businessId }))[0]!
    expect(mine.lastUsedIp).toBe(ip)
    expect(mine.lastUsedAt).toBeInstanceOf(Date)
    const seen = (await callerFor(agent).admin.apiKeys.list({ businessId: shop.businessId }))[0]!
    expect(seen).toMatchObject({ lastUsedIp: ip, business: { id: shop.businessId } })
    expect(JSON.stringify(seen)).not.toMatch(/keyHash|key_hash/)
  })
})

describe("/api/v1 — droits et cloisonnement", () => {
  it("chaque route exige son droit ; une clé limitée à la lecture des soldes ne lit ni les transactions ni les liens et n'écrit rien", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop, ["wallet:read"])
    const wallet = await api("wallet", { key: rawKey })
    expect(wallet.status).toBe(200)
    expect(wallet.json!.data).toEqual([expect.objectContaining({ id: shop.accountId, object: "account", currency: "EUR", available: 0, reserved: 0 })])
    for (const path of ["transactions", "payment_links"]) expect(await api(path, { key: rawKey })).toMatchObject({ status: 403, json: { error: { code: "insufficient_scope" } } })
    expect(await api("payment_links", { key: rawKey, body: { name: "Interdit", amount: 5000 } })).toMatchObject({ status: 403, json: { error: { code: "insufficient_scope" } } })
    expect((await api("payment_links/abcd1234", { key: rawKey })).status).toBe(403)
  })

  it("une entreprise ne voit jamais les liens, soldes ni transactions d'une autre", async () => {
    const admin = await makeStaff("admin")
    const shopA = await company(admin)
    const shopB = await company(admin)
    const keyA = (await newKey(shopA)).rawKey
    const keyB = (await newKey(shopB)).rawKey
    const created = await api("payment_links", { key: keyA, body: { name: "Lien de A", amount: 12_000 } })
    expect(created.status).toBe(201)
    const slug = created.json!.id as string
    expect((await api(`payment_links/${slug}`, { key: keyB })).status).toBe(404)
    expect((await api("payment_links", { key: keyB })).json!.data).toEqual([])
    expect((await api("wallet", { key: keyB })).json!.data.map((account: { id: number }) => account.id)).toEqual([shopB.accountId])
    // Viser le compte d'une autre entreprise à la création : introuvable pour l'appelant.
    expect(await api("payment_links", { key: keyB, body: { name: "Vers A", amount: 5_000, account_id: shopA.accountId } })).toMatchObject({ status: 404 })
    expect((await api(`payment_links/${slug}`, { key: keyA })).status).toBe(200)
  })

  it("routes inconnues, méthodes non autorisées, pas de CORS", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    expect((await api("inconnue", { key: rawKey })).status).toBe(404)
    const wrongMethod = await api("wallet", { key: rawKey, method: "DELETE" })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get("allow")).toBe("GET")
    expect((await api("payment_links/a/b", { key: rawKey })).status).toBe(404)
    expect(wrongMethod.headers.get("access-control-allow-origin")).toBeNull()
  })
})

describe("/api/v1 — transactions", () => {
  it("liste paginée par curseur, filtrée par compte, sans données internes ; bornes validées", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    for (const [index, delta] of [1_000, 2_000, 3_000].entries()) {
      await callerFor(admin).businessAdmin.adjustBalance({ businessId: shop.businessId, accountId: shop.accountId, deltaCents: delta, reason: `Ajustement de test ${index + 1}` })
    }
    const first = await api("transactions?limit=2", { key: rawKey })
    expect(first.status).toBe(200)
    expect(first.json!.data).toHaveLength(2)
    expect(first.json).toMatchObject({ has_more: true, object: "list" })
    expect(first.json!.data[0]).toMatchObject({ object: "transaction", type: "adjustment", direction: "credit", amount: 3_000, currency: "EUR", account_id: shop.accountId })
    expect(first.json!.data[0].id).toMatch(/^[A-Z]{3}-/)
    expect(JSON.stringify(first.json)).not.toMatch(/metadata|businessId|business_id|initiated/i)

    const second = await api(`transactions?limit=2&cursor=${first.json!.next_cursor}`, { key: rawKey })
    expect(second.json!.data).toHaveLength(1)
    expect(second.json).toMatchObject({ has_more: false, next_cursor: null })
    expect(second.json!.data[0].amount).toBe(1_000)
    expect(new Set([...first.json!.data, ...second.json!.data].map((row: { id: string }) => row.id)).size).toBe(3)

    expect((await api(`transactions?account_id=${shop.accountId + 100000}`, { key: rawKey })).json!.data).toEqual([])
    for (const bad of ["limit=0", "limit=101", "limit=abc", "cursor=%%%", "cursor=YWJj", "account_id=x"]) expect((await api(`transactions?${bad}`, { key: rawKey })).status).toBe(400)
    const balance = (await api("wallet", { key: rawKey })).json!.data[0]
    expect(balance.available).toBe(6_000)
    const [account] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.id, shop.accountId))
    expect(Number(account!.availableBalanceCents)).toBe(6_000)
  })
})

describe("/api/v1 — liens de paiement", () => {
  it("créer (201), relire, lister ; la clé qui l'a créé est tracée ; le lien est réellement payable et le paiement apparaît côté API", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const created = await api("payment_links", { key: rawKey, body: { name: "Commande 1042", amount: 12_500, usage: "single_use", description: "Commande n° 1042", expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() } })
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({ object: "payment_link", name: "Commande 1042", amount: 12_500, currency: "EUR", usage: "single_use", status: "active", account_id: shop.accountId, livemode: false })
    const slug = created.json!.id as string
    expect(slug).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(created.json!.url).toBe(`https://pro.vtex.test/pay/${slug}`)

    const [row] = await db.select().from(paymentLinks).where(eq(paymentLinks.slug, slug))
    const [keyRow] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(rawKey)))
    expect(row).toMatchObject({ createdViaKeyId: keyRow!.id, businessId: shop.businessId, createdBy: shop.owner.id, mode: "unique" })
    const entry = (await db.select().from(logs).where(and(eq(logs.targetType, "payment_link"), eq(logs.targetId, row!.id)))).find((item) => item.action === "business.payment_link.create")!
    expect(entry).toMatchObject({ actorId: null, actorRole: "api_key", walletType: "PROFESSIONAL", holderId: shop.businessId })
    expect(detailOf(entry)).toMatchObject({ via: "api", apiKeyId: keyRow!.id, keyPrefix: keyRow!.keyPrefix })
    expect(JSON.stringify(entry)).not.toContain(rawKey)

    // Le payeur (sans compte) règle le lien, puis l'API relit le paiement encaissé.
    const visitor = callerFor(null, freshIp())
    const started = await visitor.publicPayments.start({ slug, payerName: "Camille Client", payerEmail: "cliente@example.com", idempotencyKey: `pay-${randomUUID()}` })
    await visitor.publicPayments.simPay({ reference: started.reference, cardNumber: "4242 4242 4242 4242" })
    const detail = await api(`payment_links/${slug}`, { key: rawKey })
    expect(detail.status).toBe(200)
    expect(detail.json).toMatchObject({ payments_count: 1, collected: 12_500, status: "expired" })
    expect(detail.json!.payments).toEqual([expect.objectContaining({ id: started.reference, object: "payment", status: "succeeded", amount: 12_500, payer_name: "Camille Client", card_last4: "4242" })])
    expect(JSON.stringify(detail.json)).not.toMatch(/payer_ip|payerIp|pi_sim|stripe/i)
    expect((await api("wallet", { key: rawKey })).json!.data[0].available).toBe(12_500)

    const listed = await api("payment_links?status=expired", { key: rawKey })
    expect(listed.json!.data.map((link: { id: string }) => link.id)).toEqual([slug])
    expect((await api("payment_links?status=nimporte", { key: rawKey })).status).toBe(400)
  })

  it("idempotence : même clé = même lien (200, rejoué) ; requête différente = 409 ; deux requêtes simultanées ne créent qu'un lien", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const headers = { "idempotency-key": `order-${randomUUID()}` }
    const first = await api("payment_links", { key: rawKey, body: { name: "Abonnement", amount: 9_900 }, headers })
    const replay = await api("payment_links", { key: rawKey, body: { name: "Abonnement", amount: 9_900 }, headers })
    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.headers.get("idempotent-replayed")).toBe("true")
    expect(replay.json!.id).toBe(first.json!.id)
    expect(await api("payment_links", { key: rawKey, body: { name: "Abonnement", amount: 19_900 }, headers })).toMatchObject({ status: 409, json: { error: { code: "idempotency_conflict" } } })

    const race = { "idempotency-key": `race-${randomUUID()}` }
    const results = await Promise.all([1, 2, 3].map(() => api("payment_links", { key: rawKey, body: { name: "Course", amount: 5_000 }, headers: race })))
    expect(results.every((result) => result.status === 200 || result.status === 201)).toBe(true)
    expect(new Set(results.map((result) => result.json!.id)).size).toBe(1)
    const stored = await db.select().from(paymentLinks).where(and(eq(paymentLinks.businessId, shop.businessId), eq(paymentLinks.idempotencyKey, race["idempotency-key"])))
    expect(stored).toHaveLength(1)
    expect((await api("payment_links", { key: rawKey, body: { name: "Court", amount: 5_000 }, headers: { "idempotency-key": "x" } })).status).toBe(400)
  })

  it("le corps est validé strictement : champs inconnus, montants non entiers ou hors bornes, dates passées, type de contenu, taille", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const post = (body: unknown, extra: CallOptions = {}) => api("payment_links", { key: rawKey, body, ...extra })
    expect(await post({ name: "Ok", amount: 5_000, created_by: 1 })).toMatchObject({ status: 400, json: { error: { code: "invalid_request" } } })
    expect((await post({ name: "Ok", amount: 50.5 })).status).toBe(400)
    expect((await post({ name: "Ok", amount: "5000" })).status).toBe(400)
    expect((await post({ name: "Ok", amount: -5 })).status).toBe(400)
    expect((await post({ name: "Ok" })).status).toBe(400)
    expect((await post({ name: "O", amount: 5_000 })).status).toBe(400)
    expect(await post({ name: "Petit", amount: 50 })).toMatchObject({ status: 400, json: { error: { message: expect.stringMatching(/montant minimum/) } } })
    expect(await post({ name: "Gros", amount: 9_000_000 })).toMatchObject({ status: 400, json: { error: { message: expect.stringMatching(/montant maximum/) } } })
    expect((await post({ name: "Passé", amount: 5_000, expires_at: new Date(Date.now() - 3_600_000).toISOString() })).status).toBe(400)
    expect((await post({ name: "Devise", amount: 5_000, currency: "ZZZ" })).status).toBe(400)
    expect((await post({ name: "Usage", amount: 5_000, usage: "monthly" })).status).toBe(400)
    expect((await api("payment_links", { key: rawKey, rawBody: "{pas du json", headers: { "content-type": "application/json" } })).json!.error.code).toBe("invalid_json")
    expect((await api("payment_links", { key: rawKey, rawBody: "name=x", headers: { "content-type": "text/plain" } })).status).toBe(415)
    expect((await api("payment_links", { key: rawKey, rawBody: JSON.stringify({ name: "x".repeat(20_000), amount: 5_000 }) })).status).toBe(413)
    expect((await api("payment_links", { key: rawKey })).status).toBe(200)
  })
})

describe("clés d'API — rotation et révocation", () => {
  it("rotation avec période de grâce : l'ancienne clé vit jusqu'au terme, la nouvelle hérite des droits ; sans grâce, l'ancienne est révoquée sur-le-champ", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const owner = callerFor(shop.owner)
    const { rawKey: oldKey } = await newKey(shop, ["wallet:read", "transactions:read"])
    const oldRow = (await owner.developers.listApiKeys({ businessId: shop.businessId }))[0]!

    const rotated = await owner.developers.rotateApiKey({ businessId: shop.businessId, keyId: oldRow.id, graceHours: 24 })
    expect(rotated.rawKey).toMatch(/^vtx_test_/)
    expect(rotated.rawKey).not.toBe(oldKey)
    const [newRow, previous] = [rotated.keys.find((key) => key.rotatedFromId === oldRow.id)!, rotated.keys.find((key) => key.id === oldRow.id)!]
    expect(newRow).toMatchObject({ state: "active", scopes: ["wallet:read", "transactions:read"], mode: "sandbox", label: oldRow.label })
    expect(previous.state).toBe("active")
    expect(previous.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000)
    expect(previous.expiresAt!.getTime()).toBeLessThan(Date.now() + 25 * 3_600_000)
    expect((await api("wallet", { key: oldKey })).status).toBe(200)
    expect((await api("wallet", { key: rotated.rawKey })).status).toBe(200)

    const again = await owner.developers.rotateApiKey({ businessId: shop.businessId, keyId: newRow.id, graceHours: 0 })
    expect(again.keys.find((key) => key.id === newRow.id)).toMatchObject({ state: "revoked" })
    expect((await api("wallet", { key: rotated.rawKey })).json!.error.code).toBe("api_key_revoked")
    await expect(owner.developers.rotateApiKey({ businessId: shop.businessId, keyId: newRow.id, graceHours: 1 })).rejects.toThrow(/clé active/)
    await expect(owner.developers.rotateApiKey({ businessId: shop.businessId, keyId: oldRow.id, graceHours: 500 })).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const trail = await db.select().from(logs).where(eq(logs.targetType, "api_key"))
    const rotation = trail.find((entry) => entry.action === "business.api_key.rotate" && detailOf(entry).replaced === oldRow.id)!
    expect(rotation).toMatchObject({ actorId: shop.owner.id, walletType: "PROFESSIONAL", holderId: shop.businessId })
    expect(JSON.stringify(trail)).not.toContain(oldKey)
    expect(JSON.stringify(trail)).not.toContain(rotated.rawKey)
  })

  it("une autre entreprise ne peut ni renouveler ni révoquer la clé d'autrui", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const rival = await company(admin)
    const { rawKey } = await newKey(shop)
    const keyId = (await callerFor(shop.owner).developers.listApiKeys({ businessId: shop.businessId }))[0]!.id
    await expect(callerFor(rival.owner).developers.revokeApiKey({ businessId: rival.businessId, keyId })).rejects.toThrow(/introuvable pour cette entreprise/)
    await expect(callerFor(rival.owner).developers.rotateApiKey({ businessId: rival.businessId, keyId, graceHours: 0 })).rejects.toThrow(/introuvable pour cette entreprise/)
    await expect(callerFor(rival.owner).developers.revokeApiKey({ businessId: shop.businessId, keyId })).rejects.toThrow()
    expect((await api("me", { key: rawKey })).status).toBe(200)
  })
})

describe("admin.apiKeys — supervision et révocation", () => {
  it("SUPPORT lit, ADMIN révoque avec un motif ; le titulaire et le gestionnaire n'ont aucun accès transverse ; la clé révoquée cesse de fonctionner", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const shop = await company(admin)
    const { rawKey } = await newKey(shop)
    const [key] = await callerFor(agent).admin.apiKeys.list({ search: rawKey.slice(0, 12), businessId: shop.businessId })
    expect(key).toMatchObject({ state: "active", business: { id: shop.businessId }, scopes: ALL_SCOPES })

    await expect(callerFor(agent).admin.apiKeys.revoke({ id: key!.id, reason: "Tentative du support" })).rejects.toThrow(/Permission requise/)
    for (const actor of [shop.owner, { id: 1, role: "account_manager" as const }]) await expect(callerFor(actor).admin.apiKeys.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(null).admin.apiKeys.list()).rejects.toThrow(/Authentification/)
    await expect(callerFor(admin).admin.apiKeys.revoke({ id: key!.id, reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect((await api("me", { key: rawKey })).status).toBe(200)
    const revoked = await callerFor(admin).admin.apiKeys.revoke({ id: key!.id, reason: "Clé publiée par erreur sur un dépôt public" })
    expect(revoked.state).toBe("revoked")
    expect((await api("me", { key: rawKey })).json!.error.code).toBe("api_key_revoked")
    const entry = (await db.select().from(logs).where(and(eq(logs.targetType, "api_key"), eq(logs.targetId, key!.id)))).find((item) => item.action === "api_key.admin.revoke")!
    expect(entry).toMatchObject({ actorId: admin.id, actorRole: "admin", walletType: "PROFESSIONAL", holderId: shop.businessId })
    expect(detailOf(entry)).toMatchObject({ reason: "Clé publiée par erreur sur un dépôt public", keyPrefix: rawKey.slice(0, 12) })
    expect(JSON.stringify(entry)).not.toContain(rawKey)
    // Déjà révoquée : l'opération est idempotente et n'écrit pas une seconde entrée.
    await callerFor(admin).admin.apiKeys.revoke({ id: key!.id, reason: "Deuxième tentative de révocation" })
    const entries = (await db.select().from(logs).where(and(eq(logs.targetType, "api_key"), eq(logs.targetId, key!.id)))).filter((item) => item.action === "api_key.admin.revoke")
    expect(entries).toHaveLength(1)
  })
})
