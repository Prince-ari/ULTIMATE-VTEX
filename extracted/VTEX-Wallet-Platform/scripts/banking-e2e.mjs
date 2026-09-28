// Test bout en bout du Sprint 2 (Banque) : RIB principal + sous-RIB (IBAN virtuels), écriture jumelée avec le Wallet, permissions par rôle,
// IBAN masqué partout sauf révélation journalisée, attribution / réattribution / retrait, désactivation, vue du titulaire (Wallet et Wallet Pro).
// API réelle sur :4000, base réelle. Usage : $env:E2E_PASSWORD='…'; node scripts/banking-e2e.mjs
const API = "http://localhost:4000/api/trpc/"
let failures = 0

async function call(path, input, { method = "POST", as = null } = {}) {
  const headers = { "content-type": "application/json" }
  if (as) headers.authorization = `Bearer ${as}`
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
const hasKey = (value, key) => value && typeof value === "object" && Object.entries(value).some(([k, inner]) => k === key || hasKey(inner, key))

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "bank-e2e-root")
const stamp = Date.now()

// Deux titulaires : une personne (EUR) et une société (EUR) ; un second compte de devise différente pour tester la compatibilité.
const person = await call("admin.users.create", { firstName: "Banque", lastName: "Personne", email: `bank-person-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Banque-Initial-2026x" }, { as: root })
const xpf = await call("admin.users.create", { firstName: "Banque", lastName: "Pacifique", email: `bank-xpf-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "XPF" }, { as: root })
const company = await call("admin.users.create", { firstName: "Banque", lastName: "Gerant", email: `bank-company-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Banque-Initial-2026x", company: { legalName: `SAS Banque ${stamp}`, brandName: `Banque ${stamp}` } }, { as: root })

const staff = {}
for (const [name, role] of [["admin", "admin"], ["agent", "agent"]]) {
  const email = `bank-${name}-${stamp}@vtex.local`
  const id = await call("users.create", { firstName: name, lastName: "Banque", email, temporaryPassword: `${name}-Banque-Password-1` }, { as: root })
  await call("users.update", { id, role }, { as: root })
  staff[name] = await login(email, `${name}-Banque-Password-1`, `bank-e2e-${name}`)
}

console.log("\n── PERMISSIONS ──")
const main = await call("admin.banking.create", { kind: "MAIN", walletType: "PERSONAL", holderId: person.userId, ledgerAccountId: person.walletAccountId, label: "RIB principal", generate: true, reason: "Ouverture du compte" }, { as: staff.admin })
check("ADMIN crée un RIB principal (IBAN généré, masqué à la réponse)", main.account.kind === "MAIN" && /^FR•• •••• •••• \d{4}$/.test(main.account.ibanMasked), main.account.ibanMasked)
const list = await call("admin.banking.list", {}, { method: "GET", as: staff.agent })
check("SUPPORT liste les RIB masqués", list.some((row) => row.id === main.account.id))
const seen = await call("admin.banking.get", { id: main.account.id }, { method: "GET", as: staff.agent })
check("SUPPORT n'a pas l'historique d'audit", seen.history === null)
await expectError("SUPPORT ne peut PAS créer", () => call("admin.banking.create", { kind: "SUB", currency: "EUR", label: "Refusé", generate: true }, { as: staff.agent }), "permission")
await expectError("SUPPORT ne peut PAS révéler", () => call("admin.banking.reveal", { id: main.account.id }, { as: staff.agent }), "permission")
await expectError("sans session : refusé", () => call("admin.banking.list", {}, { method: "GET" }), "authentification")

console.log("\n── ÉCRITURE JUMELÉE (le Wallet lit la même vérité) ──")
const revealed = await call("admin.banking.reveal", { id: main.account.id }, { as: staff.admin })
check("ADMIN révèle l'IBAN complet", /^FR\d{2}\d{5}/.test(revealed.iban) && revealed.ibanFormatted.includes(" "))
const holderToken = await login(`bank-person-${stamp}@vtex.local`, "Banque-Initial-2026x", "bank-e2e-holder")
await call("auth.changePassword", { currentPassword: "Banque-Initial-2026x", newPassword: "Banque-Nouveau-2026x" }, { as: holderToken })
const boot = await call("wallets.bootstrap", {}, { as: holderToken })
check("le Wallet du titulaire porte l'IBAN et le BIC du RIB principal", boot.account.iban === revealed.iban && boot.account.bic === "VTEXFRPPXXX")
const mine = await call("bankAccounts.mine", {}, { method: "GET", as: holderToken })
check("bankAccounts.mine : le titulaire voit son RIB principal complet", mine.length === 1 && mine[0].iban === revealed.iban)
const sub = await call("admin.banking.create", { kind: "SUB", walletType: "PERSONAL", holderId: person.userId, ledgerAccountId: person.walletAccountId, label: "Loyer", generate: true }, { as: staff.admin })
check("sous-RIB généré (banque 30006) et visible du titulaire", (await call("bankAccounts.mine", {}, { method: "GET", as: holderToken })).some((row) => row.kind === "SUB" && row.label === "Loyer" && /^FR\d{2}30006/.test(row.iban)))
const rotated = await call("admin.banking.update", { id: main.account.id, iban: "FR7630006000011234567890189", reason: "Rotation demandée par le titulaire" }, { as: staff.admin })
const bootAfter = await call("wallets.bootstrap", {}, { as: holderToken })
check("rotation d'IBAN : le Wallet lit le nouvel IBAN", bootAfter.account.iban === "FR7630006000011234567890189" && rotated.account.ibanLast4 === "0189")

console.log("\n── SOUS-RIB : ATTRIBUTION, RÉATTRIBUTION, RETRAIT ──")
const stock = await call("admin.banking.create", { kind: "SUB", currency: "EUR", label: "Au stock", generate: true }, { as: staff.admin })
check("sous-RIB non attribué dans le stock", stock.account.holderId === null)
await expectError("compte d'un autre titulaire refusé (IDOR)", () => call("admin.banking.assign", { id: stock.account.id, walletType: "PERSONAL", holderId: person.userId, ledgerAccountId: xpf.walletAccountId, reason: "Titulaire incohérent" }, { as: staff.admin }), "n'appartient pas")
await expectError("devise incompatible refusée", () => call("admin.banking.assign", { id: stock.account.id, walletType: "PERSONAL", holderId: xpf.userId, ledgerAccountId: xpf.walletAccountId, reason: "Mauvaise devise" }, { as: staff.admin }), "est en EUR")
await expectError("motif trop court refusé", () => call("admin.banking.assign", { id: stock.account.id, walletType: "PERSONAL", holderId: person.userId, ledgerAccountId: person.walletAccountId, reason: "court" }, { as: staff.admin }))
await call("admin.banking.assign", { id: stock.account.id, walletType: "PERSONAL", holderId: person.userId, ledgerAccountId: person.walletAccountId, reason: "Demande du titulaire" }, { as: staff.admin })
check("attribué : le titulaire le voit", (await call("bankAccounts.mine", {}, { method: "GET", as: holderToken })).some((row) => row.label === "Au stock"))
const moved = await call("admin.banking.assign", { id: stock.account.id, walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.businessAccountId, reason: "Transfert vers la société" }, { as: staff.admin })
check("réattribué à la société", moved.account.walletType === "PROFESSIONAL" && moved.account.holderId === company.businessId && moved.relations.length >= 1)
check("l'ancien titulaire ne le voit plus", !(await call("bankAccounts.mine", {}, { method: "GET", as: holderToken })).some((row) => row.label === "Au stock"))
await call("admin.banking.unassign", { id: stock.account.id, reason: "Retour au stock" }, { as: staff.admin })
await expectError("un RIB principal ne s'attribue pas", () => call("admin.banking.assign", { id: main.account.id, walletType: "PERSONAL", holderId: xpf.userId, ledgerAccountId: xpf.walletAccountId, reason: "Tentative sur le principal" }, { as: staff.admin }), "Seul un sous-RIB")

console.log("\n── DÉSACTIVATION ──")
await call("admin.banking.setStatus", { id: sub.account.id, status: "disabled", reason: "Sous-RIB abandonné" }, { as: staff.admin })
check("un sous-RIB désactivé disparaît du Wallet", !(await call("bankAccounts.mine", {}, { method: "GET", as: holderToken })).some((row) => row.label === "Loyer"))
await call("admin.banking.setStatus", { id: main.account.id, status: "disabled", reason: "Compte clôturé chez la banque" }, { as: staff.admin })
const bootOff = await call("wallets.bootstrap", {}, { as: holderToken })
check("RIB principal désactivé : le Wallet n'affiche plus d'IBAN", bootOff.account.iban === null)
await call("admin.banking.setStatus", { id: main.account.id, status: "active", reason: "Réouverture du compte" }, { as: staff.admin })
check("réactivé : l'IBAN revient", (await call("wallets.bootstrap", {}, { as: holderToken })).account.iban === "FR7630006000011234567890189")

console.log("\n── WALLET PRO ──")
const proMain = await call("admin.banking.create", { kind: "MAIN", walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.businessAccountId, label: "RIB principal", generate: true }, { as: staff.admin })
const proToken = await login(`bank-company-${stamp}@vtex.local`, "Banque-Initial-2026x", "bank-e2e-pro")
await call("auth.changePassword", { currentPassword: "Banque-Initial-2026x", newPassword: "Banque-Nouveau-2026x" }, { as: proToken })
const proBanks = await call("wallet.bankAccounts", { businessId: company.businessId }, { method: "GET", as: proToken })
check("le propriétaire de la société voit ses RIB (principal, IBAN pro 30005)", proBanks.length === 1 && proBanks[0].kind === "MAIN" && /^FR\d{2}30005/.test(proBanks[0].iban))
await expectError("le titulaire personnel ne voit pas les RIB d'une société qui n'est pas la sienne", () => call("wallet.bankAccounts", { businessId: company.businessId }, { method: "GET", as: holderToken }))

console.log("\n── JOURNAL ET FUITES ──")
const logs = await call("journal.list", { targetType: "bank_account", limit: 300 }, { method: "GET", as: root })
const mineLogs = logs.filter((entry) => [main.account.id, sub.account.id, stock.account.id, proMain.account.id].includes(entry.targetId))
const actions = new Set(mineLogs.map((entry) => entry.action))
check("événements journalisés : create, update, reveal, assign, reassign, unassign, disable, enable", ["bank.account.create", "bank.account.update", "bank.iban.reveal", "bank.account.assign", "bank.account.reassign", "bank.account.unassign", "bank.account.disable", "bank.account.enable"].every((action) => actions.has(action)), [...actions].join(", "))
const blob = JSON.stringify(mineLogs)
check("le journal ne contient AUCUN IBAN", !blob.includes(revealed.iban) && !blob.includes("FR7630006000011234567890189") && !/FR\d{2}3000[456]\d{15,}/.test(blob))
const everything = JSON.stringify([await call("admin.banking.list", {}, { method: "GET", as: root }), await call("admin.banking.get", { id: main.account.id }, { method: "GET", as: root }), await call("admin.users.file", { userId: person.userId }, { method: "GET", as: root })])
check("aucun IBAN complet dans liste / fiche RIB / fiche utilisateur", !/FR\d{2}3000[456]\d{15,}/.test(everything) && !everything.includes("FR7630006000011234567890189") && !hasKey(JSON.parse(everything), "iban"))
check("les événements portent le rôle et l'IP", mineLogs.every((entry) => entry.actorRole && entry.ip))

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
