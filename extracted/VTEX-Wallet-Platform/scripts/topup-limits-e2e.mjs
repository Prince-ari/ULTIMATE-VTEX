// Test bout en bout des plafonds de recharge, de la conversion EUR ↔ XPF, du quota 24 h et des interventions Dashboard sur Wallet Pro
// (création d'entreprise, RIB, soldes). API locale sur :4000, STRIPE_MODE=sim.
// Usage : $env:E2E_PASSWORD='…'; node scripts/topup-limits-e2e.mjs      (E2E_PASSWORD = mot de passe de l'administrateur local)
// Le script crée ses propres utilisateur et entreprise de test : le quota 24 h de l'administrateur n'est pas consommé.
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
  try { await fn(); check(label, false, "aucune erreur levée") } catch (e) { check(label, contains ? e.message.toLowerCase().includes(contains.toLowerCase()) : true, e.message) }
}
const key = (s) => `${s}:${crypto.randomUUID()}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(email, password, device) {
  const { userId } = await call("auth.login", { email, password })
  const { code } = await call("auth.devPeekOtp", { userId }, { method: "GET" })
  const { token: t } = await call("auth.verifyOtp", { userId, code, device })
  token = t
  return userId
}

/** IBAN français valide (clé MOD 97) pour les tests. */
function frIban(bban23) {
  const rearranged = `${bban23}152700` // FR = 15 27, clé 00
  const check = 98n - (BigInt(rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))) % 97n)
  return `FR${String(check).padStart(2, "0")}${bban23}`
}

const adminPassword = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe de l'administrateur local).") })()
await login(process.env.E2E_EMAIL ?? "admin@vtex.local", adminPassword, "e2e-limits-admin")
console.log("Connecté (administrateur).")

// ── utilisateur de test isolé ──
const stamp = Date.now()
const testEmail = `e2e-limits-${stamp}@vtex.local`
const testPassword = `Tmp-${crypto.randomUUID()}`
const created = await call("users.create", { firstName: "E2E", lastName: "Plafonds", email: testEmail, temporaryPassword: testPassword })
const testUserId = typeof created === "number" ? created : (created.id ?? created.userId)
check("utilisateur de test créé", Number.isInteger(testUserId), `#${testUserId}`)
const wallet = await call("walletAdmin.createWallet", { userId: testUserId, currency: "EUR" })
check("compte EUR ouvert pour l'utilisateur de test", !!wallet)

console.log("\n── WALLET PERSO · PLAFONDS ──")
const adminToken = token
await login(testEmail, testPassword, "e2e-limits-user")
const cfg = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("config EUR : 2 000 € par recharge, 5 000 € par 24 h", cfg.maxCents === 200000 && cfg.dailyMaxCents === 500000 && cfg.effectiveMaxCents === 200000, `${cfg.maxCents}/${cfg.dailyMaxCents}`)
const xpf = cfg.limitsByCurrency?.XPF
check("config : plafonds XPF équivalents (238 663 ₣ / 596 658 ₣, arrondis vers le bas)", xpf?.maxCents === 238663 && xpf?.dailyMaxCents === 596658, `${xpf?.maxCents}/${xpf?.dailyMaxCents}`)
check("config : jamais plus de 2 000 € une fois converti", xpf.maxCents / 119.3317 <= 2000.0000001)
await expectError("2 000,01 € refusé (plafond par recharge)", () => call("topups.create", { currency: "EUR", amountCents: 200001, idempotencyKey: key("lim-eur") }), "maximum")
await expectError("238 664 ₣ refusé (plafond par recharge en francs Pacifique)", () => call("topups.create", { currency: "XPF", amountCents: 238664, idempotencyKey: key("lim-xpf") }), "maximum")
await expectError("USD refusé sur un compte en euros (aucune parité fixe)", () => call("topups.create", { currency: "USD", amountCents: 5000, idempotencyKey: key("lim-usd") }))

const start = cfg.balanceCents
const p1 = await call("topups.create", { currency: "EUR", amountCents: 200000, idempotencyKey: key("lim-1") })
const r1 = await call("topups.simPay", { reference: p1.reference, cardNumber: "4242 4242 4242 4242" })
check("2 000,00 € en euros : accepté et crédité", r1.status === "succeeded" && r1.balanceCents === start + 200000, `${r1.balanceCents}`)

console.log("\n── WALLET PERSO · PAIEMENT EN ₣ (conversion à la parité fixe) ──")
const p2 = await call("topups.create", { currency: "XPF", amountCents: 238663, idempotencyKey: key("lim-2") })
check("recharge en ₣ créée : montant et devise de paiement conservés", p2.amountCents === 238663 && p2.currency === "XPF", `${p2.amountCents} ${p2.currency}`)
const r2 = await call("topups.simPay", { reference: p2.reference, cardNumber: "4242 4242 4242 4242" })
// Le reçu présente le solde dans la devise de paiement (₣) ; le compte, lui, reste en euros.
const cfg2 = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("238 663 ₣ crédités = 2 000,00 € sur le compte en euros", r2.status === "succeeded" && cfg2.balanceCents === start + 400000, `compte ${cfg2.balanceCents} (attendu ${start + 400000})`)
check("le reçu en ₣ affiche le solde converti (4 000,00 € = 477 327 ₣)", r2.balanceCents === 477327, `${r2.balanceCents}`)
check("quota 24 h : il reste 1 000 € (4 000 € déjà rechargés)", cfg2.dailyRemainingCents === 100000 && cfg2.effectiveMaxCents === 100000, `${cfg2.dailyRemainingCents}/${cfg2.effectiveMaxCents}`)
check("quota 24 h en ₣ : 119 331 ₣ restants (arrondi vers le bas)", cfg2.limitsByCurrency.XPF.dailyRemainingCents === 119331 && cfg2.limitsByCurrency.XPF.effectiveMaxCents === 119331, `${cfg2.limitsByCurrency.XPF.dailyRemainingCents}`)

console.log("   (pause 62 s : le limiteur autorise 10 opérations d'argent par minute)")
await sleep(62000)
await expectError("1 000,01 € refusé : dépasse le quota 24 h restant", () => call("topups.create", { currency: "EUR", amountCents: 100001, idempotencyKey: key("lim-q1") }), "quotidien")
await expectError("119 332 ₣ refusé : dépasse le quota 24 h restant", () => call("topups.create", { currency: "XPF", amountCents: 119332, idempotencyKey: key("lim-q2") }), "quotidien")
const p3 = await call("topups.create", { currency: "EUR", amountCents: 100000, idempotencyKey: key("lim-3") })
const r3 = await call("topups.simPay", { reference: p3.reference, cardNumber: "4242 4242 4242 4242" })
check("1 000,00 € : dernier palier accepté, 5 000 € atteints", r3.status === "succeeded" && r3.balanceCents === start + 500000, `${r3.balanceCents}`)
await expectError("plus aucune recharge possible (5 000 € en 24 h atteints)", () => call("topups.create", { currency: "EUR", amountCents: 500, idempotencyKey: key("lim-q3") }), "quotidien")
const cfg3 = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("config : quota restant = 0, effectiveMax = 0", cfg3.dailyRemainingCents === 0 && cfg3.effectiveMaxCents === 0, `${cfg3.dailyRemainingCents}/${cfg3.effectiveMaxCents}`)

console.log("\n── REMBOURSEMENT D'UNE RECHARGE EN ₣ (débit converti) ──")
token = adminToken
const refunded = await call("walletAdmin.refundTopup", { reference: p2.reference, reason: "Test e2e : remboursement d'une recharge en francs Pacifique" })
check("remboursement : statut refunded, solde du reçu converti (3 000,00 € = 357 995 ₣)", refunded.status === "refunded" && refunded.balanceCents === 357995, `${refunded.balanceCents}`)
await login(testEmail, testPassword, "e2e-limits-user-2")
const cfg4 = await call("topups.config", { currency: "EUR" }, { method: "GET" })
check("remboursement : compte débité de 2 000,00 € (3 000,00 € restants)", cfg4.balanceCents === start + 300000, `${cfg4.balanceCents}`)
check("un remboursement libère le quota 24 h (2 000 € de nouveau disponibles)", cfg4.dailyRemainingCents === 200000, `${cfg4.dailyRemainingCents}`)

console.log("\n── DASHBOARD · WALLET PRO : entreprise, RIB, soldes ──")
token = adminToken
const biz = await call("businessAdmin.createBusiness", { ownerUserId: testUserId, legalName: `E2E Plafonds ${stamp} SAS`, brandName: `E2E ${stamp}`, industry: "Test", currency: "EUR" })
check("entreprise créée avec son compte principal", Number.isInteger(biz.businessId) && Number.isInteger(biz.walletAccountId), JSON.stringify(biz))
let detail = await call("businessAdmin.detail", { businessId: biz.businessId }, { method: "GET" })
check("fiche : 1 compte, aucun RIB, solde nul", detail.wallet.length === 1 && !detail.wallet[0].iban && detail.wallet[0].availableBalanceCents === 0)

const prov = await call("wallet.provisionBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId })
const provisioned = (Array.isArray(prov) ? prov : detail.wallet).find((a) => a.id === biz.walletAccountId)
check("RIB généré automatiquement (IBAN valide FR + BIC)", /^FR\d{2}/.test(provisioned?.iban ?? "") && !!provisioned?.bic, provisioned?.iban)

const validIban = frIban("30004028320001234567890")
await expectError("RIB : IBAN invalide refusé (clé MOD 97)", () => call("businessAdmin.updateBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId, iban: "FR7630004028320001234567891", bic: "BNPAFRPP", reason: "Test e2e : IBAN invalide" }), "iban")
await expectError("RIB : BIC invalide refusé", () => call("businessAdmin.updateBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId, iban: validIban, bic: "12", reason: "Test e2e : BIC invalide" }))
await expectError("RIB : motif trop court refusé", () => call("businessAdmin.updateBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId, iban: validIban, bic: "BNPAFRPP", reason: "court" }))
detail = await call("businessAdmin.updateBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId, iban: validIban, bic: "BNPAFRPP", reason: "Test e2e : RIB validé par la conformité" })
check("RIB attribué (remplace le RIB généré)", detail.wallet[0].iban === validIban && detail.wallet[0].bic === "BNPAFRPP", detail.wallet[0].iban)
await expectError("RIB : compte d'une autre entreprise refusé", () => call("businessAdmin.updateBankDetails", { businessId: biz.businessId, accountId: 999999, iban: validIban, bic: "BNPAFRPP", reason: "Test e2e : compte étranger" }), "introuvable")

const adj = await call("businessAdmin.adjustBalance", { businessId: biz.businessId, accountId: biz.walletAccountId, deltaCents: 250000, reason: "Test e2e : solde initial à l'ouverture" })
check("solde mis à jour : +2 500,00 €", adj.wallet[0].availableBalanceCents === 250000, `${adj.wallet[0].availableBalanceCents}`)
await expectError("solde : retrait au-delà du disponible refusé", () => call("businessAdmin.adjustBalance", { businessId: biz.businessId, accountId: biz.walletAccountId, deltaCents: -250001, reason: "Test e2e : découvert interdit" }), "insuffisant")
await expectError("solde : compte d'une autre entreprise refusé", () => call("businessAdmin.adjustBalance", { businessId: biz.businessId, accountId: 999999, deltaCents: 100, reason: "Test e2e : compte étranger" }), "introuvable")
await expectError("solde : justification trop courte refusée", () => call("businessAdmin.adjustBalance", { businessId: biz.businessId, accountId: biz.walletAccountId, deltaCents: 100, reason: "court" }))
const lowered = await call("businessAdmin.adjustBalance", { businessId: biz.businessId, accountId: biz.walletAccountId, deltaCents: -50000, reason: "Test e2e : correction du solde" })
check("solde mis à jour : −500,00 € (2 000,00 € restants)", lowered.wallet[0].availableBalanceCents === 200000, `${lowered.wallet[0].availableBalanceCents}`)

const revoked = await call("businessAdmin.revokeBankDetails", { businessId: biz.businessId, accountId: biz.walletAccountId, reason: "Test e2e : compte clôturé à la demande" })
check("RIB retiré", !revoked.wallet[0].iban && !revoked.wallet[0].bic)

console.log("\n── WALLET PRO · PLAFONDS ET ₣ ──")
await login(testEmail, testPassword, "e2e-limits-pro")
const pcfg = await call("businessTopups.config", { businessId: biz.businessId }, { method: "GET" })
check("pro config : 5 000 € par recharge (perso : 2 000 €), 5 000 € par 24 h, XPF payable sur un compte EUR", pcfg.maxCents === 500000 && pcfg.dailyMaxCents === 500000 && pcfg.accounts[0].payableCurrencies.includes("XPF"), `${pcfg.maxCents}/${pcfg.dailyMaxCents}/${pcfg.accounts[0].payableCurrencies}`)
check("pro config : plafonds XPF équivalents (596 658 ₣ par recharge et par 24 h, arrondis vers le bas)", pcfg.limitsByCurrency.XPF.maxCents === 596658 && pcfg.limitsByCurrency.XPF.dailyMaxCents === 596658, `${pcfg.limitsByCurrency.XPF.maxCents}/${pcfg.limitsByCurrency.XPF.dailyMaxCents}`)
check("pro config : jamais plus de 5 000 € une fois converti", pcfg.limitsByCurrency.XPF.maxCents / 119.3317 <= 5000.0000001)
await expectError("pro : 5 000,01 € refusé (plafond par recharge)", () => call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, amountCents: 500001, idempotencyKey: key("pro-lim") }), "maximum")
await expectError("pro : 596 659 ₣ refusé (plafond par recharge)", () => call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, currency: "XPF", amountCents: 596659, idempotencyKey: key("pro-lim-x") }), "maximum")

// Au-dessus des 2 000 € du wallet personnel : le Wallet Pro accepte jusqu'à 5 000 € par recharge.
const pe = await call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, amountCents: 300000, billingName: "E2E Plafonds SAS", idempotencyKey: key("pro-eur") })
const pep = await call("businessTopups.simPay", { reference: pe.reference, cardNumber: "5555 5555 5555 4444" })
check("pro : 3 000,00 € en une recharge (au-delà des 2 000 € du perso) : accepté et crédité", pep.status === "succeeded" && pep.balanceCents === 500000, `${pep.balanceCents}`)
const pcfg1 = await call("businessTopups.config", { businessId: biz.businessId }, { method: "GET" })
check("pro : quota 24 h par entreprise (2 000 € restants)", pcfg1.dailyRemainingCents === 200000 && pcfg1.effectiveMaxCents === 200000, `${pcfg1.dailyRemainingCents}/${pcfg1.effectiveMaxCents}`)
await expectError("pro : 2 000,01 € refusé (il ne reste que 2 000 € sur les 24 h)", () => call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, amountCents: 200001, idempotencyKey: key("pro-q1") }), "quotidien")

const pc = await call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, currency: "XPF", amountCents: 238663, billingName: "E2E Plafonds SAS", idempotencyKey: key("pro-xpf") })
const pp = await call("businessTopups.simPay", { reference: pc.reference, cardNumber: "5555 5555 5555 4444" })
const pcfg2 = await call("businessTopups.config", { businessId: biz.businessId }, { method: "GET" })
check("pro : 238 663 ₣ crédités = 2 000,00 € sur le compte en euros (7 000,00 € au total)", pp.status === "succeeded" && pcfg2.accounts[0].availableBalanceCents === 700000, `compte ${pcfg2.accounts[0].availableBalanceCents} (attendu 700000)`)
check("pro : le reçu en ₣ affiche le solde converti (835 322 ₣)", pp.balanceCents === 835322, `${pp.balanceCents}`)
check("pro : 5 000 € atteints en 24 h, plus rien à recharger", pcfg2.dailyRemainingCents === 0, `${pcfg2.dailyRemainingCents}`)
await expectError("pro : plus aucune recharge possible (5 000 € en 24 h atteints)", () => call("businessTopups.create", { businessId: biz.businessId, businessWalletAccountId: biz.walletAccountId, amountCents: 1000, idempotencyKey: key("pro-q2") }), "quotidien")

console.log(`\n${failures === 0 ? "TOUS LES TESTS PLAFONDS / ₣ / RIB PASSENT" : failures + " ÉCHEC(S)"}`)
process.exit(failures === 0 ? 0 : 1)
