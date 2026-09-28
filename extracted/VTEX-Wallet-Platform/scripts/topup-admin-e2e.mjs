// Test bout en bout (API locale sur :4000, STRIPE_MODE=sim). Usage : $env:E2E_PASSWORD='…'; node scripts/topup-admin-e2e.mjs
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

const { userId } = await call("auth.login", { email: process.env.E2E_EMAIL ?? "admin@vtex.local", password: process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe de l'administrateur local).") })() })
const { code } = await call("auth.devPeekOtp", { userId }, { method: "GET" })
const { token: t } = await call("auth.verifyOtp", { userId, code, device: "e2e-admin" })
token = t
console.log("Connecté (admin@vtex.local).\n── ADMIN · STRIPE ──")

const st = await call("walletAdmin.stripeStatus", undefined, { method: "GET" })
console.log("   stripeStatus:", JSON.stringify(st))
check("stripeStatus : diagnostic renvoyé", st && "requestedMode" in st)
check("stripeStatus : aucun secret exposé", !/mk_[A-Za-z0-9]{10,}/.test(JSON.stringify(st)) && !/(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/.test(JSON.stringify(st)) && !/pk_live_[A-Za-z0-9]{20,}/.test(JSON.stringify(st)))
const bst = await call("businessAdmin.stripeStatus", undefined, { method: "GET" })
check("businessAdmin.stripeStatus identique côté Pro", bst.requestedMode === st.requestedMode)

console.log("\n── ADMIN · WALLET PERSO ──")
const startCfg = await call("topups.config", { currency: "EUR" }, { method: "GET" })
const startBal = startCfg.balanceCents
const a = await call("topups.create", { currency: "EUR", amountCents: 1200, idempotencyKey: key("adm-a") })
await call("topups.simPay", { reference: a.reference, cardNumber: "4242 4242 4242 4242" })
const list = await call("walletAdmin.topups", { limit: 50 }, { method: "GET" })
const rowA = list.find((r) => r.reference === a.reference)
check("admin.topups : la recharge apparaît avec son statut", rowA?.status === "succeeded" && rowA.mode === "sim" && rowA.cardLast4 === "4242", `${rowA?.status}/${rowA?.cardBrand}/${rowA?.userEmail}`)
const filt = await call("walletAdmin.topups", { status: "succeeded" }, { method: "GET" })
check("admin.topups : filtre par statut", filt.every((r) => r.status === "succeeded") && filt.length >= 1)
const rec = await call("walletAdmin.reconcileTopup", { reference: a.reference })
check("reconcile d'une recharge déjà créditée : reste créditée, pas de double crédit", rec.status === "succeeded" && (await call("topups.config", { currency: "EUR" }, { method: "GET" })).balanceCents === startBal + 1200)
await expectError("refund sans justification suffisante refusé", () => call("walletAdmin.refundTopup", { reference: a.reference, reason: "x" }))
const refunded = await call("walletAdmin.refundTopup", { reference: a.reference, reason: "Test e2e : remboursement client" })
check("refund : statut refunded + solde rétabli", refunded.status === "refunded" && refunded.balanceCents === startBal, `solde ${refunded.balanceCents} (départ ${startBal})`)
await expectError("refund rejoué refusé (une seule fois)", () => call("walletAdmin.refundTopup", { reference: a.reference, reason: "Test e2e : deuxième tentative" }), "créditée")
const tx = await call("transactions.listMine", { limit: 10 }, { method: "GET" })
check("ledger : la recharge ET son remboursement sont tracés", tx.items.some((x) => x.description?.includes(a.reference) && x.direction === "debit"))

const b = await call("topups.create", { currency: "EUR", amountCents: 1300, idempotencyKey: key("adm-b") })
const canceled = await call("walletAdmin.cancelTopup", { reference: b.reference })
check("cancel d'une recharge en attente", canceled.status === "canceled", canceled.status)
await expectError("cancel impossible sur une recharge créditée", () => call("walletAdmin.cancelTopup", { reference: a.reference }))

// Solde insuffisant : on paie, on vide le compte (ajustement admin), puis le remboursement doit être refusé sans rien casser.
console.log("   (pause 62 s : limiteur d'argent)")
await sleep(62000)
const c =await call("topups.create", { currency: "EUR", amountCents: 1400, idempotencyKey: key("adm-c") })
const cPaid = await call("topups.simPay", { reference: c.reference, cardNumber: "4242 4242 4242 4242" })
const rowC = (await call("walletAdmin.topups", { limit: 50 }, { method: "GET" })).find((r) => r.reference === c.reference)
const drain = cPaid.balanceCents - 100
await call("walletAdmin.adjustBalance", { walletAccountId: rowC.walletAccountId, deltaCents: -drain, reason: "Test e2e : vidage du solde", idempotencyKey: key("adm-drain") })
await expectError("refund refusé si le solde ne couvre plus la recharge", () => call("walletAdmin.refundTopup", { reference: c.reference, reason: "Test e2e : solde insuffisant" }))
const cAfter = (await call("walletAdmin.topups", { limit: 50 }, { method: "GET" })).find((r) => r.reference === c.reference)
check("après refus : la recharge reste 'succeeded'", cAfter.status === "succeeded")
await call("walletAdmin.adjustBalance", { walletAccountId: rowC.walletAccountId, deltaCents: drain - 1400, reason: "Test e2e : remise à niveau du solde", idempotencyKey: key("adm-restore") })
console.log(`   solde final wallet perso: ${(await call("topups.config", { currency: "EUR" }, { method: "GET" })).balanceCents} (départ ${startBal}; +14,00 € de la recharge C conservée)`)

console.log("\n── ADMIN · WALLET PRO ──   (pause 62 s : limiteur d'argent)")
await sleep(62000)
const biz = (await call("businesses.mine", undefined, { method: "GET" }))[0]
const pcfg = await call("businessTopups.config", { businessId: biz.id }, { method: "GET" })
const acct = pcfg.accounts[0]
check("pro config : expose les cartes du compte", Array.isArray(pcfg.cards), `${pcfg.cards.length} carte(s)`)
const pc = await call("businessTopups.create", { businessId: biz.id, businessWalletAccountId: acct.id, amountCents: 20000, billingName: "SAS Demo VTEX", idempotencyKey: key("adm-p") })
const pp = await call("businessTopups.simPay", { reference: pc.reference, cardNumber: "4242 4242 4242 4242" })
const plist = await call("businessAdmin.topups", { limit: 50 }, { method: "GET" })
const prow = plist.find((r) => r.reference === pc.reference)
check("businessAdmin.topups : ligne avec entreprise + statut", prow?.status === "succeeded", `${prow?.businessName ?? prow?.business ?? Object.keys(prow ?? {}).join(",")}`)
const prefund = await call("businessAdmin.refundTopup", { reference: pc.reference, reason: "Test e2e : remboursement pro" })
check("pro refund : statut refunded + solde rétabli", prefund.status === "refunded" && prefund.balanceCents === acct.availableBalanceCents, `${pp.balanceCents} → ${prefund.balanceCents} (départ ${acct.availableBalanceCents})`)
const pb = await call("businessTopups.create", { businessId: biz.id, businessWalletAccountId: acct.id, amountCents: 20000, idempotencyKey: key("adm-pb") })
const pcan = await call("businessAdmin.cancelTopup", { reference: pb.reference })
check("pro cancel d'une recharge en attente", pcan.status === "canceled")

console.log(`\n${failures === 0 ? "TOUS LES TESTS ADMIN PASSENT" : failures + " ÉCHEC(S)"}`)
process.exit(failures === 0 ? 0 : 1)
