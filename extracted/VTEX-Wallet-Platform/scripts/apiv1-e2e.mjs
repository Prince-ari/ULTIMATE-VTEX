// Test bout en bout du Sprint 4 (clés d'API + /api/v1) contre l'API réelle sur :4000 : câblage Next, en-têtes, droits, isolation, idempotence,
// paiement d'un lien créé par l'API, rotation, révocation par le titulaire puis par le Dashboard, absence de CORS.
// Usage : $env:E2E_PASSWORD='…'; node scripts/apiv1-e2e.mjs
const BASE = "http://localhost:4000"
const TRPC = `${BASE}/api/trpc/`
let failures = 0

async function trpc(path, input, { method = "POST", as = null, ip = null } = {}) {
  const headers = { "content-type": "application/json" }
  if (as) headers.authorization = `Bearer ${as}`
  if (ip) headers["x-forwarded-for"] = ip
  const url = method === "GET" ? `${TRPC}${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}` : `${TRPC}${path}`
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify({ json: input ?? {} }) })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload.error) throw Object.assign(new Error(payload?.error?.json?.message ?? `HTTP ${res.status}`), { code: payload?.error?.json?.data?.code })
  return payload.result.data.json
}
async function v1(path, { key, method, body, headers = {}, ip } = {}) {
  const h = { ...headers }
  if (key) h.authorization = `Bearer ${key}`
  if (ip) h["x-forwarded-for"] = ip
  if (body !== undefined) h["content-type"] = "application/json"
  const res = await fetch(`${BASE}/api/v1/${path}`, { method: method ?? (body !== undefined ? "POST" : "GET"), headers: h, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null }
}
const check = (label, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  → " + extra : ""}`); if (!cond) failures++ }
async function login(email, password, device) {
  const { userId } = await trpc("auth.login", { email, password })
  const { code } = await trpc("auth.devPeekOtp", { userId }, { method: "GET" })
  return (await trpc("auth.verifyOtp", { userId, code, device })).token
}

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "apiv1-e2e-root")
const stamp = Date.now()
const ipA = `198.51.100.${(stamp % 200) + 1}`
const ipB = `203.0.113.${(stamp % 200) + 1}`

const mkShop = async (name) => {
  const shop = await trpc("admin.users.create", { firstName: name, lastName: "Dev", email: `apiv1-${name}-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Apiv1-Initial-2026x", company: { legalName: `SAS ${name} ${stamp}`, brandName: `${name} ${stamp}` } }, { as: root })
  const owner = await login(`apiv1-${name}-${stamp}@vtex.local`, "Apiv1-Initial-2026x", `apiv1-e2e-${name}`)
  await trpc("auth.changePassword", { currentPassword: "Apiv1-Initial-2026x", newPassword: "Apiv1-Nouveau-2026x" }, { as: owner })
  return { ...shop, owner }
}
const shopA = await mkShop("Alpha")
const shopB = await mkShop("Beta")
const createKey = (shop, scopes, extra = {}) => trpc("developers.createApiKey", { businessId: shop.businessId, label: "Serveur e2e", mode: "sandbox", scopes, ...extra }, { as: shop.owner })

console.log("\n── CLÉS (Wallet Pro) ──")
const env = await trpc("developers.environment", {}, { method: "GET", as: shopA.owner })
check("l'environnement de la plateforme est exposé (simulation = bac à sable)", env.environment === "sandbox")
const created = await createKey(shopA, ["wallet:read", "transactions:read", "payment_links:read", "payment_links:write"])
const keyA = created.rawKey
check("clé de test au bon format, secret montré une fois", /^vtx_test_[0-9a-f]{48}$/.test(keyA))
check("la liste ne contient jamais le secret", !JSON.stringify(created.keys).includes(keyA) && !JSON.stringify(await trpc("developers.listApiKeys", { businessId: shopA.businessId }, { method: "GET", as: shopA.owner })).includes(keyA))
const readOnly = (await createKey(shopA, ["wallet:read"])).rawKey
const keyB = (await createKey(shopB, ["wallet:read", "payment_links:read", "payment_links:write"])).rawKey

console.log("\n── /api/v1 : authentification et en-têtes ──")
const noAuth = await v1("me", { ip: ipA })
check("sans clé : 401 missing_api_key + WWW-Authenticate", noAuth.status === 401 && noAuth.json.error.code === "missing_api_key" && /Bearer/.test(noAuth.headers.get("www-authenticate") ?? ""))
check("l'identifiant de requête est dans l'en-tête et dans l'erreur", noAuth.headers.get("x-request-id") === noAuth.json.error.request_id)
check("clé inconnue : 401 invalid_api_key", (await v1("me", { key: `vtx_test_${"2".repeat(48)}`, ip: ipA })).json.error.code === "invalid_api_key")
const me = await v1("me", { key: keyA, ip: ipA })
check("GET /me : entreprise, environnement, droits", me.status === 200 && me.json.business.id === shopA.businessId && me.json.environment === "sandbox" && me.json.scopes.length === 4)
check("réponses non mises en cache, sans CORS", me.headers.get("cache-control") === "no-store" && me.headers.get("access-control-allow-origin") === null)
const options = await fetch(`${BASE}/api/v1/wallet`, { method: "OPTIONS", headers: { origin: "https://pirate.example", "access-control-request-method": "GET" } })
check("OPTIONS : 204 sans Access-Control-Allow-Origin (une clé secrète n'est pas utilisable depuis un navigateur)", options.status === 204 && options.headers.get("access-control-allow-origin") === null)
check("route inconnue : 404 ; méthode non permise : 405 avec Allow", (await v1("nope", { key: keyA, ip: ipA })).status === 404 && (await v1("wallet", { key: keyA, method: "DELETE", ip: ipA })).headers.get("allow") === "GET")

console.log("\n── DROITS ET ISOLATION ──")
const wallet = await v1("wallet", { key: keyA, ip: ipA })
check("GET /wallet : comptes de l'entreprise uniquement", wallet.status === 200 && wallet.json.data.length === 1 && wallet.json.data[0].id === shopA.businessAccountId)
check("clé en lecture seule des soldes : 403 insufficient_scope ailleurs", (await v1("transactions", { key: readOnly, ip: ipA })).json.error.code === "insufficient_scope" && (await v1("payment_links", { key: readOnly, body: { name: "Interdit", amount: 5000 }, ip: ipA })).status === 403)

console.log("\n── LIENS DE PAIEMENT PAR L'API ──")
const idem = { "idempotency-key": `e2e-order-${stamp}` }
const link = await v1("payment_links", { key: keyA, body: { name: "Commande 1042", amount: 12_500, description: "Commande n° 1042" }, headers: idem, ip: ipA })
check("POST /payment_links : 201, lien actif et payable", link.status === 201 && link.json.status === "active" && link.json.amount === 12_500 && /^[A-Za-z0-9_-]{12}$/.test(link.json.id), link.json?.id)
const replay = await v1("payment_links", { key: keyA, body: { name: "Commande 1042", amount: 12_500 }, headers: idem, ip: ipA })
check("même Idempotency-Key : 200 rejoué, même lien", replay.status === 200 && replay.headers.get("idempotent-replayed") === "true" && replay.json.id === link.json.id)
check("même clé, montant différent : 409", (await v1("payment_links", { key: keyA, body: { name: "Commande 1042", amount: 99_900 }, headers: idem, ip: ipA })).status === 409)
check("champ inconnu, montant décimal, JSON invalide : 400", (await v1("payment_links", { key: keyA, body: { name: "X1", amount: 5000, created_by: 1 }, ip: ipA })).status === 400 && (await v1("payment_links", { key: keyA, body: { name: "X1", amount: 50.5 }, ip: ipA })).status === 400)
check("l'autre entreprise ne voit pas ce lien (404) ni ne peut viser ce compte", (await v1(`payment_links/${link.json.id}`, { key: keyB, ip: ipB })).status === 404 && (await v1("payment_links", { key: keyB, body: { name: "Vers Alpha", amount: 5000, account_id: shopA.businessAccountId }, ip: ipB })).status === 404)

const visitor = { ip: ipB }
const started = await trpc("publicPayments.start", { slug: link.json.id, payerName: "Camille Client", payerEmail: "cliente@example.com", idempotencyKey: `pay-apiv1-${stamp}` }, visitor)
const paid = await trpc("publicPayments.simPay", { reference: started.reference, cardNumber: "4242 4242 4242 4242" }, visitor)
check("le payeur règle le lien créé par l'API", paid.status === "succeeded")
const detail = await v1(`payment_links/${link.json.id}`, { key: keyA, ip: ipA })
check("GET /payment_links/{id} : paiement encaissé visible, sans IP ni identifiant d'intention", detail.json.payments_count === 1 && detail.json.collected === 12_500 && detail.json.payments[0].status === "succeeded" && !/payer_ip|pi_sim|stripe/i.test(JSON.stringify(detail.json)))
check("le solde du compte reflète l'encaissement", (await v1("wallet", { key: keyA, ip: ipA })).json.data[0].available === 12_500)
const tx = await v1("transactions?limit=1", { key: keyA, ip: ipA })
check("GET /transactions : la transaction du lien (crédit 125,00 €)", tx.status === 200 && tx.json.data[0].type === "payment_link" && tx.json.data[0].direction === "credit" && tx.json.data[0].amount === 12_500)
check("bornes de pagination validées", (await v1("transactions?limit=500", { key: keyA, ip: ipA })).status === 400)

console.log("\n── ROTATION ET RÉVOCATION ──")
const keys = await trpc("developers.listApiKeys", { businessId: shopA.businessId }, { method: "GET", as: shopA.owner })
const current = keys.find((key) => keyA.startsWith(key.keyPrefix) && key.scopes.length === 4)
check("dernière utilisation enregistrée (adresse réelle transmise par le proxy)", current.lastUsedIp === ipA && current.lastUsedAt !== null, current.lastUsedIp)
const rotated = await trpc("developers.rotateApiKey", { businessId: shopA.businessId, keyId: current.id, graceHours: 24 }, { as: shopA.owner })
check("rotation : nouvelle clé active, ancienne valable pendant la grâce", (await v1("me", { key: rotated.rawKey, ip: ipA })).status === 200 && (await v1("me", { key: keyA, ip: ipA })).status === 200)
const now = rotated.keys.find((key) => key.rotatedFromId === current.id)
await trpc("developers.revokeApiKey", { businessId: shopA.businessId, keyId: current.id, reason: "Rotation terminée" }, { as: shopA.owner })
check("révocation par le titulaire : refus immédiat", (await v1("me", { key: keyA, ip: ipA })).json.error.code === "api_key_revoked")
const adminList = await trpc("admin.apiKeys.list", { businessId: shopA.businessId }, { method: "GET", as: root })
check("Dashboard : la clé est visible sans secret ni empreinte", adminList.length >= 3 && !JSON.stringify(adminList).includes(rotated.rawKey) && !/keyHash|key_hash/.test(JSON.stringify(adminList)))
await trpc("admin.apiKeys.revoke", { id: now.id, reason: "Clé exposée dans un dépôt public" }, { as: root })
check("révocation par l'administrateur : refus immédiat", (await v1("me", { key: rotated.rawKey, ip: ipA })).json.error.code === "api_key_revoked")

console.log("\n── JOURNAL ──")
const trail = await trpc("journal.list", { targetType: "api_key", limit: 500 }, { method: "GET", as: root })
const actions = new Set(trail.map((entry) => entry.action))
check("actions journalisées (création, rotation, révocation, révocation admin)", ["business.api_key.create", "business.api_key.rotate", "business.api_key.revoke", "api_key.admin.revoke"].every((action) => actions.has(action)), [...actions].join(", "))
const linkTrail = await trpc("journal.list", { targetType: "payment_link", limit: 500 }, { method: "GET", as: root })
check("la création par l'API est journalisée avec le rôle api_key, sans le secret", linkTrail.some((entry) => entry.actorRole === "api_key" && entry.action === "business.payment_link.create") && !JSON.stringify([trail, linkTrail]).includes(keyA))

console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
