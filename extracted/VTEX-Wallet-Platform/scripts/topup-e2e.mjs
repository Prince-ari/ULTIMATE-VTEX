// Test bout en bout (API locale sur :4000, STRIPE_MODE=sim). Usage : $env:E2E_PASSWORD='…'; node scripts/topup-e2e.mjs
const API = "http://localhost:4000/api/trpc/"
let token = null
let failures = 0

async function call(path, input, { method = "POST", raw = false } = {}) {
  const headers = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  const url = method === "GET" ? `${API}${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : `${API}${path}`
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify({ json: input ?? null }) })
  const payload = await res.json().catch(() => ({}))
  if (raw) return { ok: res.ok, payload }
  if (!res.ok || payload.error) throw new Error(payload?.error?.json?.message ?? `HTTP ${res.status}`)
  return payload.result.data.json
}
const check = (label, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  → " + extra : ""}`); if (!cond) failures++ }
const expectError = async (label, fn, contains) => {
  try { await fn(); check(label, false, "aucune erreur levée") } catch (e) { check(label, contains ? e.message.includes(contains) : true, e.message) }
}
const key = (s) => `${s}:${crypto.randomUUID()}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── connexion (mode dev : le code OTP est lisible via devPeekOtp) ──
const { userId } = await call("auth.login", { email: process.env.E2E_EMAIL ?? "admin@vtex.local", password: process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe de l'administrateur local).") })() })
const { code } = await call("auth.devPeekOtp", { userId }, { method: "GET" })
const { token: t } = await call("auth.verifyOtp", { userId, code, device: "e2e" })
token = t
console.log("Connecté (admin@vtex.local).\n── WALLET PERSO ──")

const config = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("config : mode sim actif", config.enabled && config.mode === "sim", `${config.mode}, min ${config.minCents}, max ${config.maxCents}`)
check("config : aucune clé secrète exposée", !JSON.stringify(config).includes("mk_") && !JSON.stringify(config).includes("sk_"))
const before = config.balanceCents

// 1) Recharge nominale 10 € avec 4242
const k1 = key("e2e-topup")
const created = await call("topups.create", { currency: "EUR", amountCents: 1000, idempotencyKey: k1 })
check("create : référence + secret client", /^TOP-/.test(created.reference) && !!created.clientSecret, created.reference)
const replay = await call("topups.create", { currency: "EUR", amountCents: 1000, idempotencyKey: k1 })
check("create rejoué : même référence (idempotence)", replay.reference === created.reference && replay.replayed === true)
await expectError("create rejoué avec un autre montant refusé", () => call("topups.create", { currency: "EUR", amountCents: 2000, idempotencyKey: k1 }), "idempotence")
const noCredit = await call("topups.confirm", { reference: created.reference })
check("confirm avant paiement : pas de crédit", noCredit.status === "pending", noCredit.status)
const paid = await call("topups.simPay", { reference: created.reference, cardNumber: "4242 4242 4242 4242" })
check("simPay 4242 : succès + crédit", paid.status === "succeeded" && paid.balanceCents === before + 1000, `statut ${paid.status}, solde ${paid.balanceCents}`)
const again = await call("topups.confirm", { reference: created.reference })
check("confirm rejoué : toujours crédité une seule fois", again.status === "succeeded" && again.balanceCents === before + 1000, `solde ${again.balanceCents}`)
const after1 = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("solde du wallet = avant + 10,00 €", after1.balanceCents === before + 1000, `${before} → ${after1.balanceCents}`)
const tx = await call("transactions.listMine", { limit: 5 }, { method: "GET" })
const topupTx = tx.items.filter((x) => x.type === "topup" && x.reference === created.reference)
check("ledger : exactement 1 transaction 'topup' créditée", topupTx.length === 1 && topupTx[0].direction === "credit" && topupTx[0].amountCents === 1000, topupTx[0]?.description)

// 2) Refus bancaire
const c2 = await call("topups.create", { currency: "EUR", amountCents: 1500, idempotencyKey: key("e2e-decline") })
const declined = await call("topups.simPay", { reference: c2.reference, cardNumber: "4000 0000 0000 0002" })
check("simPay 0002 : refusée, aucun crédit", declined.status === "failed" && declined.balanceCents === after1.balanceCents, `${declined.status} / ${declined.failureCode}`)

// 3) 3D Secure
const c3 = await call("topups.create", { currency: "EUR", amountCents: 2500, idempotencyKey: key("e2e-3ds") })
const step = await call("topups.simPay", { reference: c3.reference, cardNumber: "4000 0027 6000 3184" })
check("simPay 3184 : validation bancaire requise, pas encore crédité", step.status === "requires_action" && step.balanceCents === after1.balanceCents, step.status)
const done3ds = await call("topups.simAuthenticate", { reference: c3.reference })
check("3D Secure validée : crédité", done3ds.status === "succeeded" && done3ds.balanceCents === after1.balanceCents + 2500, `solde ${done3ds.balanceCents}`)

// 4) Garde-fous
await expectError("montant sous le minimum refusé", () => call("topups.create", { currency: "EUR", amountCents: 100, idempotencyKey: key("e2e-min") }), "minimum")
await expectError("montant au-dessus du maximum refusé", () => call("topups.create", { currency: "EUR", amountCents: 9_000_000, idempotencyKey: key("e2e-max") }), "maximum")
console.log("   (pause 62 s : le limiteur autorise 10 opérations d'argent par minute)")
await sleep(62000)
await expectError("numéro de carte invalide (Luhn) : pas de crédit", async () => {
  const c = await call("topups.create", { currency: "EUR", amountCents: 1000, idempotencyKey: key("e2e-luhn") })
  const r = await call("topups.simPay", { reference: c.reference, cardNumber: "1234 5678 9012 3456" })
  if (r.status === "succeeded") throw new Error("crédité à tort")
  throw new Error("refusé:" + r.failureCode)
}, "refusé")
const unauth = token
token = null
const anon = await call("topups.create", { currency: "EUR", amountCents: 1000, idempotencyKey: key("e2e-anon") }, { raw: true })
check("sans session : refusé (401)", !anon.ok)
token = unauth

// 5) Concurrence : 5 confirmations simultanées ne créditent qu'une fois
const c5 = await call("topups.create", { currency: "EUR", amountCents: 3000, idempotencyKey: key("e2e-race") })
const balBefore = (await call("topups.config", { currency: "EUR" }, { method: "GET" })).balanceCents
await call("topups.simPay", { reference: c5.reference, cardNumber: "4242 4242 4242 4242" }).catch(() => null)
await Promise.allSettled(Array.from({ length: 5 }, () => call("topups.confirm", { reference: c5.reference })))
const balAfter = (await call("topups.config", { currency: "EUR" }, { method: "GET" })).balanceCents
check("concurrence : 5 confirmations = 1 seul crédit de 30,00 €", balAfter === balBefore + 3000, `${balBefore} → ${balAfter}`)
const list = await call("topups.listMine", { limit: 10 }, { method: "GET" })
check("listMine : historique des recharges", Array.isArray(list) && list.length >= 5, `${list.length} lignes`)

// ── WALLET PRO ──
console.log("\n── WALLET PRO ──")
console.log("   (pause 62 s : limiteur)")
await sleep(62000)
const businesses = await call("businesses.mine", undefined, { method: "GET" })
const biz = businesses[0]
const pcfg = await call("businessTopups.config", { businessId: biz.id }, { method: "GET" })
check("pro config : sim + comptes", pcfg.enabled && pcfg.mode === "sim" && pcfg.accounts.length >= 1, `${pcfg.accounts.length} compte(s)`)
const acct = pcfg.accounts[0]
const pc = await call("businessTopups.create", { businessId: biz.id, businessWalletAccountId: acct.id, amountCents: 50000, billingName: "SAS Demo VTEX", idempotencyKey: key("e2e-pro") })
const ppaid = await call("businessTopups.simPay", { reference: pc.reference, cardNumber: "5555 5555 5555 4444" })
check("pro : Mastercard → crédit de 500,00 €", ppaid.status === "succeeded" && ppaid.balanceCents === acct.availableBalanceCents + 50000, `${acct.availableBalanceCents} → ${ppaid.balanceCents}`)
const ptx = await call("wallet.listTransactions", { businessId: biz.id, limit: 5 }, { method: "GET" })
check("pro : transaction 'topup' au ledger", ptx.some((x) => x.type === "topup" && x.reference === pc.reference && x.direction === "credit"))
await call("businessTopups.confirm", { reference: pc.reference })
const pcfg2 = await call("businessTopups.config", { businessId: biz.id }, { method: "GET" })
check("pro : confirm rejoué sans double crédit", pcfg2.accounts[0].availableBalanceCents === ppaid.balanceCents, `${pcfg2.accounts[0].availableBalanceCents}`)
await expectError("pro : compte d'une autre entreprise refusé", () => call("businessTopups.create", { businessId: biz.id, businessWalletAccountId: 999999, amountCents: 50000, idempotencyKey: key("e2e-pro-x") }), "introuvable")
const plist = await call("businessTopups.list", { businessId: biz.id }, { method: "GET" })
check("pro : liste des recharges", plist.length >= 1)

console.log(`\n${failures === 0 ? "TOUS LES TESTS PASSENT" : failures + " ÉCHEC(S)"}`)
process.exit(failures === 0 ? 0 : 1)
