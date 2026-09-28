// Test bout en bout du Sprint 1 : création atomique utilisateur + wallet, mot de passe temporaire imposé côté serveur, devise initiale,
// devise d'affichage synchronisée, fiche centrale, RBAC (super_admin / admin / support), réinitialisation, journal d'audit.
// API locale sur :4000. Usage : $env:E2E_PASSWORD='…'; node scripts/admin-users-e2e.mjs
// Limiteur de connexion : 5 tentatives / minute / IP — le script s'y adapte (une pause d'une minute avant les connexions suivantes).
const API = "http://localhost:4000/api/trpc/"
let token = null
let failures = 0

async function call(path, input, { method = "POST", as = token } = {}) {
  const headers = { "content-type": "application/json" }
  if (as) headers.authorization = `Bearer ${as}`
  const url = method === "GET" ? `${API}${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : `${API}${path}`
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify({ json: input ?? null }) })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload.error) {
    const error = new Error(payload?.error?.json?.message ?? `HTTP ${res.status}`)
    error.code = payload?.error?.json?.data?.code
    throw error
  }
  return payload.result.data.json
}
const check = (label, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  → " + extra : ""}`); if (!cond) failures++ }
const expectError = async (label, fn, contains) => {
  try { await fn(); check(label, false, "aucune erreur levée") } catch (e) { check(label, contains ? e.message.toLowerCase().includes(contains.toLowerCase()) : true, e.message.slice(0, 160)) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let logins = 0
async function login(email, password, device) {
  if (logins > 0 && logins % 4 === 0) { console.log("   (pause 62 s : limiteur de connexion 5/min)"); await sleep(62000) }
  logins++
  const { userId } = await call("auth.login", { email, password }, { as: null })
  const { code } = await call("auth.devPeekOtp", { userId }, { method: "GET", as: null })
  const { token: t } = await call("auth.verifyOtp", { userId, code, device }, { as: null })
  return { userId, token: t }
}

const adminPassword = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", adminPassword, "e2e-admin")
token = root.token
const me = await call("users.getMe", null, { method: "GET" })
check("connecté en SUPER_ADMIN", me.role === "super_admin", me.role)

const stamp = Date.now()
const catalog = await call("config.currencies", null, { method: "GET", as: null })
check("config.currencies (public) : EUR, USD, XPF ; XPF = ₣ à parité 119,3317", catalog.map((c) => c.code).join() === "EUR,USD,XPF" && catalog[2].symbol === "₣" && catalog[2].eurRate === 119.3317)

console.log("\n── CRÉATION ATOMIQUE : wallet PERSONNEL en francs Pacifique ──")
const personalEmail = `e2e-perso-${stamp}@vtex.local`
const personal = await call("admin.users.create", { firstName: "Perso", lastName: "Pacifique", email: personalEmail, phone: "+687123456", walletType: "PERSONAL", currency: "XPF", passwordMode: "generate" })
check("utilisateur + compte XPF créés en une opération", Number.isInteger(personal.userId) && Number.isInteger(personal.walletAccountId) && personal.walletType === "PERSONAL", JSON.stringify({ userId: personal.userId, account: personal.walletAccountId }))
check("mot de passe temporaire généré (16 car.), renvoyé une seule fois", typeof personal.temporaryPassword === "string" && personal.temporaryPassword.length === 16)
await expectError("e-mail déjà utilisé : refusé sans doublon", () => call("admin.users.create", { firstName: "X", lastName: "Y", email: personalEmail, walletType: "PERSONAL", currency: "EUR" }), "déjà utilisé")

console.log("\n── FICHE CENTRALE ──")
let file = await call("admin.users.file", { userId: personal.userId }, { method: "GET" })
check("fiche : type PERSONAL, un compte XPF à 0 ₣, une carte virtuelle, mot de passe temporaire", file.walletTypes.join() === "PERSONAL" && file.personal.accounts.length === 1 && file.personal.accounts[0].currency === "XPF" && file.personal.accounts[0].availableBalanceCents === 0 && file.personal.accounts[0].cards.length === 1 && file.security.mustChangePassword === true, JSON.stringify(file.security))
check("fiche : aucun hash de mot de passe exposé", !JSON.stringify(file).includes("passwordHash") && !JSON.stringify(file).includes(personal.temporaryPassword))
check("fiche : activité d'audit avec création rattachée au titulaire", file.activity.some((e) => e.action === "user.create" && e.actorRole === "super_admin" && e.ip && e.requestId), file.activity.map((e) => e.action).join(", "))
const list = await call("admin.users.list", { walletType: "PERSONAL", currency: "XPF", search: "Perso" }, { method: "GET" })
check("liste filtrée type + devise + recherche", list.some((u) => u.id === personal.userId && u.currencies.join() === "XPF"), `${list.length} résultat(s)`)

console.log("\n── MOT DE PASSE TEMPORAIRE : imposé par le serveur ──")
const user1 = await login(personalEmail, personal.temporaryPassword, "e2e-perso")
await expectError("wallets.bootstrap refusé tant que le mot de passe n'est pas remplacé", () => call("wallets.bootstrap", null, { as: user1.token }), "PASSWORD_CHANGE_REQUIRED")
await expectError("notifications.listMine refusé aussi", () => call("notifications.listMine", null, { method: "GET", as: user1.token }), "PASSWORD_CHANGE_REQUIRED")
const meUser = await call("users.getMe", null, { method: "GET", as: user1.token })
check("users.getMe reste permis et indique l'obligation", meUser.mustChangePassword === true)
await expectError("changement : mot de passe actuel faux refusé", () => call("auth.changePassword", { currentPassword: "faux-faux-faux", newPassword: "Nouveau-Secret-2026" }, { as: user1.token }), "actuel incorrect")
await expectError("changement : politique (trop court) refusée", () => call("auth.changePassword", { currentPassword: personal.temporaryPassword, newPassword: "court1" }, { as: user1.token }))
await call("auth.changePassword", { currentPassword: personal.temporaryPassword, newPassword: "Nouveau-Secret-2026" }, { as: user1.token })
const boot = await call("wallets.bootstrap", null, { as: user1.token })
check("après le changement, le wallet s'ouvre sur le compte XPF (devise initiale) — aucun compte EUR créé", boot.account.currency === "XPF" && boot.settings.displayCurrency === null, `${boot.account.currency}`)
file = await call("admin.users.file", { userId: personal.userId }, { method: "GET" })
check("fiche : obligation levée, un seul compte (XPF)", file.security.mustChangePassword === false && file.personal.accounts.length === 1)

console.log("\n── DEVISE D'AFFICHAGE : réglée par l'administrateur, relue par le wallet ──")
await expectError("USD refusé (pas de parité fixe)", () => call("walletSettings.adminUpdate", { userId: personal.userId, displayCurrency: "USD" }), "parité")
await call("walletSettings.adminUpdate", { userId: personal.userId, displayCurrency: "XPF" })
const boot2 = await call("wallets.bootstrap", null, { as: user1.token })
check("le wallet relit la devise d'affichage ₣ depuis le serveur", boot2.settings.displayCurrency === "XPF")
await call("walletSettings.updateMine", { displayCurrency: "EUR" }, { as: user1.token })
const mine = await call("walletSettings.mine", null, { method: "GET", as: user1.token })
check("le titulaire change lui-même sa devise d'affichage", mine.displayCurrency === "EUR")

console.log("\n── CRÉATION ATOMIQUE : wallet PROFESSIONNEL ──")
const proEmail = `e2e-pro-${stamp}@vtex.local`
const pro = await call("admin.users.create", { firstName: "Pro", lastName: "Titulaire", email: proEmail, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Initial-Pro-2026x", company: { legalName: `SAS E2E ${stamp}`, brandName: `E2E ${stamp}`, industry: "Test" } })
check("utilisateur + société + membre owner + compte principal EUR", Number.isInteger(pro.businessId) && Number.isInteger(pro.businessAccountId) && pro.temporaryPassword === null, JSON.stringify({ business: pro.businessId, account: pro.businessAccountId }))
await expectError("validation serveur : société exigée pour PROFESSIONAL", () => call("admin.users.create", { firstName: "A", lastName: "B", email: `x-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR" }))
const proFile = await call("admin.users.file", { userId: pro.userId }, { method: "GET" })
check("fiche Pro : société, rôle owner, un compte EUR", proFile.walletTypes.join() === "PROFESSIONAL" && proFile.companies[0]?.myRole === "owner" && proFile.companies[0].accounts.length === 1, proFile.companies[0]?.brandName)
const detail = await call("businessAdmin.detail", { businessId: pro.businessId }, { method: "GET" })
check("le Dashboard Wallet Pro voit la société créée (source de vérité unique)", detail.business.id === pro.businessId)

console.log("\n── RBAC : ce qu'un simple ADMIN et un SUPPORT ne peuvent pas faire ──")
const adminEmail = `e2e-admin-${stamp}@vtex.local`
const agentEmail = `e2e-agent-${stamp}@vtex.local`
const adminId = await call("users.create", { firstName: "Adm", lastName: "E2E", email: adminEmail, temporaryPassword: "Adm-E2E-Password-1" })
await call("users.update", { id: adminId, role: "admin" })
check("SUPER_ADMIN nomme un ADMIN", (await call("users.getById", { id: adminId }, { method: "GET" })).role === "admin")
const agentId = await call("users.create", { firstName: "Sup", lastName: "E2E", email: agentEmail, temporaryPassword: "Agent-E2E-Password-1" })
await call("users.update", { id: agentId, role: "agent" })
const plainAdmin = await login(adminEmail, "Adm-E2E-Password-1", "e2e-plain-admin")
const agent = await login(agentEmail, "Agent-E2E-Password-1", "e2e-agent")
const created2 = await call("admin.users.create", { firstName: "Par", lastName: "Admin", email: `e2e-byadmin-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR" }, { as: plainAdmin.token })
check("ADMIN : peut créer un utilisateur + wallet", Number.isInteger(created2.userId))
await expectError("ADMIN : ne peut pas se promouvoir SUPER_ADMIN (propre rôle)", () => call("users.update", { id: plainAdmin.userId, role: "super_admin" }, { as: plainAdmin.token }), "propre rôle")
await expectError("ADMIN : ne peut pas nommer un administrateur", () => call("users.update", { id: created2.userId, role: "admin" }, { as: plainAdmin.token }), "permission")
await expectError("ADMIN : ne peut pas réinitialiser le mot de passe du SUPER_ADMIN", () => call("users.resetPassword", { id: root.userId }, { as: plainAdmin.token }))
const adminSeesFile = await call("admin.users.file", { userId: personal.userId }, { method: "GET", as: plainAdmin.token })
check("ADMIN : ouvre n'importe quelle fiche par son identifiant (décision produit), avec historique", adminSeesFile.user.id === personal.userId && Array.isArray(adminSeesFile.activity))
const agentFile = await call("admin.users.file", { userId: personal.userId }, { method: "GET", as: agent.token })
check("SUPPORT : lit la fiche mais sans historique d'audit", agentFile.user.id === personal.userId && agentFile.activity === null)
await expectError("SUPPORT : ne peut pas créer d'utilisateur", () => call("admin.users.create", { firstName: "N", lastName: "O", email: `e2e-nope-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR" }, { as: agent.token }), "permission")
await expectError("SUPPORT : ne peut pas régler la devise d'un wallet", () => call("walletSettings.adminUpdate", { userId: personal.userId, displayCurrency: "EUR" }, { as: agent.token }), "permission")
await expectError("SUPPORT : ne peut pas réinitialiser un mot de passe", () => call("users.resetPassword", { id: personal.userId }, { as: agent.token }), "permission")

console.log("\n── RÉINITIALISATION PAR L'ADMINISTRATEUR ──")
const reset = await call("users.resetPassword", { id: personal.userId })
check("mot de passe temporaire régénéré, échéance 72 h", typeof reset.temporaryPassword === "string" && reset.temporaryPassword.length === 16 && new Date(reset.expiresAt).getTime() > Date.now() + 71 * 3600 * 1000)
await expectError("la session du titulaire est coupée immédiatement", () => call("users.getMe", null, { method: "GET", as: user1.token }), "authentification")
file = await call("admin.users.file", { userId: personal.userId }, { method: "GET" })
check("fiche : mot de passe temporaire à nouveau actif, journal sans secret", file.security.mustChangePassword === true && !JSON.stringify(file.activity).includes(reset.temporaryPassword) && file.activity.some((e) => e.action === "user.password.reset"))

console.log(`\n${failures === 0 ? "TOUS LES TESTS SPRINT 1 PASSENT" : failures + " ÉCHEC(S)"}`)
process.exit(failures === 0 ? 0 : 1)
