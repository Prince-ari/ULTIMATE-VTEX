// Test bout en bout du Sprint 3 (Liens de paiement) : création côté Wallet Pro, paiement public SANS compte (simulateur), crédit vérifié une seule fois,
// usage unique, indisponibilité indiscernable, supervision Dashboard (SUPPORT lit / ADMIN gère), suspension, remboursement, non-divulgation.
// API réelle sur :4000, base réelle. Usage : $env:E2E_PASSWORD='…'; node scripts/paylink-e2e.mjs
const API = "http://localhost:4000/api/trpc/"
let failures = 0

async function call(path, input, { method = "POST", as = null, ip = null } = {}) {
  const headers = { "content-type": "application/json" }
  if (as) headers.authorization = `Bearer ${as}`
  if (ip) headers["x-forwarded-for"] = ip
  const url = method === "GET" ? `${API}${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}` : `${API}${path}`
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify({ json: input ?? {} }) })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload.error) throw Object.assign(new Error(payload?.error?.json?.message ?? `HTTP ${res.status}`), { code: payload?.error?.json?.data?.code })
  return payload.result.data.json
}
const check = (label, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  → " + extra : ""}`); if (!cond) failures++ }
const expectError = async (label, fn, contains) => {
  try { await fn(); check(label, false, "aucune erreur levée") } catch (e) { check(label, contains ? e.message.toLowerCase().includes(contains.toLowerCase()) : true, e.message.slice(0, 140)) }
}
async function login(email, password, device) {
  const { userId } = await call("auth.login", { email, password })
  const { code } = await call("auth.devPeekOtp", { userId }, { method: "GET" })
  return (await call("auth.verifyOtp", { userId, code, device })).token
}

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "paylink-e2e-root")
const stamp = Date.now()
// Une adresse par « payeur » : les limiteurs de débit sont par IP (le proxy de bordure la renseigne en production).
const ipA = `198.51.100.${(stamp % 200) + 1}`
const ipB = `203.0.113.${(stamp % 200) + 1}`

const shop = await call("admin.users.create", { firstName: "Liens", lastName: "Gerant", email: `paylink-owner-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Liens-Initial-2026x", company: { legalName: `SAS Liens ${stamp}`, brandName: `Boutique ${stamp}` } }, { as: root })
const owner = await login(`paylink-owner-${stamp}@vtex.local`, "Liens-Initial-2026x", "paylink-e2e-owner")
await call("auth.changePassword", { currentPassword: "Liens-Initial-2026x", newPassword: "Liens-Nouveau-2026x" }, { as: owner })
const staff = {}
for (const [name, role] of [["admin", "admin"], ["agent", "agent"]]) {
  const email = `paylink-${name}-${stamp}@vtex.local`
  const id = await call("users.create", { firstName: name, lastName: "Liens", email, temporaryPassword: `${name}-Liens-Password-1` }, { as: root })
  await call("users.update", { id, role }, { as: root })
  staff[name] = await login(email, `${name}-Liens-Password-1`, `paylink-e2e-${name}`)
}
const balance = async () => (await call("wallet.accounts", { businessId: shop.businessId }, { method: "GET", as: owner })).find((a) => a.id === shop.businessAccountId).availableBalanceCents
const newLink = async (input) => {
  const before = new Set((await call("paymentLinks.list", { businessId: shop.businessId }, { method: "GET", as: owner })).map((l) => l.id))
  const rows = await call("paymentLinks.create", { businessId: shop.businessId, currency: "EUR", targetAccountId: shop.businessAccountId, ...input }, { as: owner })
  return rows.find((l) => !before.has(l.id))
}
const start = (slug, extra = {}, ip = ipA) => call("publicPayments.start", { slug, payerName: "Camille Client", payerEmail: "cliente@example.com", idempotencyKey: `pay-e2e-${crypto.randomUUID()}`, ...extra }, { ip })

console.log("\n── CRÉATION (Wallet Pro) ──")
const start0 = await balance()
const link = await newLink({ name: "Acompte atelier", amountCents: 12_500, mode: "recurring", description: "Acompte pour la commande n° 42" })
check("lien créé, adresse opaque de 12 caractères", /^[A-Za-z0-9_-]{12}$/.test(link.slug), link.slug)
check("compte crédité mémorisé", link.targetAccount?.id === shop.businessAccountId)
await expectError("montant sous le minimum refusé", () => newLink({ name: "Trop petit", amountCents: 50, mode: "recurring" }), "montant minimum")
await expectError("expiration passée refusée", () => newLink({ name: "Déjà expiré", amountCents: 5_000, mode: "recurring", expiresAt: new Date(Date.now() - 3_600_000).toISOString() }), "futur")

console.log("\n── PAIEMENT PUBLIC (aucun compte, aucune session) ──")
const view = await call("publicPayments.get", { slug: link.slug }, { method: "GET", ip: ipA })
check("le payeur voit le nom, la société, le montant", view.name === "Acompte atelier" && view.businessName === `Boutique ${stamp}` && view.amountCents === 12_500 && view.payable === true)
const exposed = JSON.stringify(view)
check("aucun identifiant interne exposé", !/"(businessId|targetAccountId|createdBy|slug|id)"/.test(exposed))
await expectError("lien inconnu : même réponse générique", () => call("publicPayments.get", { slug: "zzzzzzzzzzzz" }, { method: "GET", ip: ipA }), "pas disponible")
const started = await start(link.slug)
check("paiement démarré, en attente, crédit non fait", started.status === "pending" && (await balance()) === start0)
const fixedKey = `pay-e2e-fixed-${stamp}`
const replay = await call("publicPayments.start", { slug: link.slug, payerName: "Camille Client", payerEmail: "cliente@example.com", idempotencyKey: fixedKey }, { ip: ipA })
const replay2 = await call("publicPayments.start", { slug: link.slug, payerName: "Camille Client", payerEmail: "cliente@example.com", idempotencyKey: fixedKey }, { ip: ipA })
check("même clé d'idempotence : même paiement, jamais un doublon", replay.reference === replay2.reference && replay2.replayed === true)
const paid = await call("publicPayments.simPay", { reference: started.reference, cardNumber: "4242 4242 4242 4242" }, { ip: ipA })
check("carte 4242 : encaissé", paid.status === "succeeded" && paid.cardLast4 === "4242")
check("compte Pro crédité du montant exact", (await balance()) === start0 + 12_500, `${start0} → ${await balance()}`)
await call("publicPayments.confirm", { reference: started.reference }, { ip: ipA })
await call("publicPayments.confirm", { reference: started.reference }, { ip: ipA })
check("confirmer plusieurs fois ne recrédite jamais", (await balance()) === start0 + 12_500)
const declined = await start(link.slug, {}, ipB)
const refused = await call("publicPayments.simPay", { reference: declined.reference, cardNumber: "4000 0000 0000 0002" }, { ip: ipB })
check("carte refusée : aucun crédit", refused.status === "failed" && (await balance()) === start0 + 12_500, refused.failureMessage)
const threeDs = await start(link.slug, {}, ipB)
const challenge = await call("publicPayments.simPay", { reference: threeDs.reference, cardNumber: "4000 0027 6000 3184" }, { ip: ipB })
check("3D Secure : validation banque demandée", challenge.simStatus === "requires_action" || challenge.status === "requires_action")
const authenticated = await call("publicPayments.simAuthenticate", { reference: threeDs.reference }, { ip: ipB })
check("après validation banque : encaissé et crédité", authenticated.status === "succeeded" && (await balance()) === start0 + 25_000)

console.log("\n── USAGE UNIQUE ──")
const once = await newLink({ name: "Devis 88", amountCents: 8_000, mode: "unique" })
const firstOnce = await start(once.slug, {}, ipA)
await expectError("second payeur pendant le règlement : refusé", () => start(once.slug, { payerEmail: "autre@example.com" }, ipB), "usage unique")
await call("publicPayments.simPay", { reference: firstOnce.reference, cardNumber: "4242 4242 4242 4242" }, { ip: ipA })
check("le lien à usage unique est arrivé à terme", (await call("paymentLinks.list", { businessId: shop.businessId }, { method: "GET", as: owner })).find((l) => l.id === once.id).status === "expired")
await expectError("il ne peut plus être payé", () => start(once.slug, { payerEmail: "troisieme@example.com" }, ipB), "plus valable")
await expectError("ni réactivé", () => call("paymentLinks.updateStatus", { businessId: shop.businessId, linkId: once.id, status: "active" }, { as: owner }), "déjà payé")
const afterOnce = await balance()

console.log("\n── SUPERVISION DASHBOARD ──")
const list = await call("admin.paymentLinks.list", { search: `Boutique ${stamp}` }, { method: "GET", as: staff.agent })
check("SUPPORT liste les liens de la société", list.length >= 2 && list.every((l) => l.business.id === shop.businessId))
const detail = await call("admin.paymentLinks.get", { id: link.id }, { method: "GET", as: staff.agent })
check("SUPPORT voit les paiements (payeur, carte masquée)", detail.payments.some((p) => p.status === "succeeded" && p.cardLast4 === "4242" && p.payerEmail === "cliente@example.com"))
const seen = JSON.stringify([list, detail])
check("aucune adresse IP ni identifiant d'intention exposé", !seen.includes(ipA) && !seen.includes("pi_sim") && !/stripePaymentIntentId|payerIp/.test(seen))
await expectError("SUPPORT ne peut PAS suspendre", () => call("admin.paymentLinks.setStatus", { id: link.id, status: "disabled", reason: "Tentative du support" }, { as: staff.agent }), "permission")
await expectError("SUPPORT ne peut PAS rembourser", () => call("admin.paymentLinks.refund", { reference: started.reference, reason: "Tentative du support" }, { as: staff.agent }), "permission")
await expectError("le titulaire Pro n'a aucun accès transverse", () => call("admin.paymentLinks.list", {}, { method: "GET", as: owner }), "permission")
await expectError("sans session : refusé", () => call("admin.paymentLinks.list", {}, { method: "GET" }), "authentification")

console.log("\n── SUSPENSION ──")
await expectError("motif trop court refusé", () => call("admin.paymentLinks.setStatus", { id: link.id, status: "disabled", reason: "court" }, { as: staff.admin }))
const off = await call("admin.paymentLinks.setStatus", { id: link.id, status: "disabled", reason: "Soupçon de fraude signalé par la banque" }, { as: staff.admin })
check("ADMIN suspend le lien", off.status === "disabled")
await expectError("le paiement public est désormais impossible", () => start(link.slug, {}, ipB), "pas disponible")
const on = await call("admin.paymentLinks.setStatus", { id: link.id, status: "active", reason: "Vérification terminée, lien légitime" }, { as: staff.admin })
check("ADMIN réactive le lien", on.status === "active" && (await call("publicPayments.get", { slug: link.slug }, { method: "GET", ip: ipB })).payable === true)

console.log("\n── REMBOURSEMENT ──")
await expectError("motif trop court refusé", () => call("admin.paymentLinks.refund", { reference: started.reference, reason: "court" }, { as: staff.admin }))
const refunded = await call("admin.paymentLinks.refund", { reference: started.reference, reason: "Commande annulée par la cliente" }, { as: staff.admin })
check("paiement remboursé", refunded.status === "refunded")
check("compte Pro débité du montant remboursé", (await balance()) === afterOnce - 12_500, `${afterOnce} → ${await balance()}`)
await expectError("un second remboursement est refusé", () => call("admin.paymentLinks.refund", { reference: started.reference, reason: "Deuxième remboursement" }, { as: staff.admin }), "encaissé")
await call("publicPayments.confirm", { reference: started.reference }, { ip: ipA })
check("confirmer un paiement remboursé ne le recrédite jamais", (await balance()) === afterOnce - 12_500)

console.log("\n── JOURNAL ──")
const trail = await call("journal.list", { targetType: "payment_link", limit: 500 }, { method: "GET", as: root })
const actions = new Set(trail.map((entry) => entry.action))
check("actions journalisées (création, crédit, suspension, remboursement)", ["business.payment_link.create", "payment_link.payment.start", "payment_link.payment.credit", "payment_link.admin.disable", "payment_link.admin.enable", "payment_link.payment.refund"].every((action) => actions.has(action)), [...actions].join(", "))
check("le journal ne contient jamais de numéro de carte", !JSON.stringify(trail).includes("4242 4242"))

console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
