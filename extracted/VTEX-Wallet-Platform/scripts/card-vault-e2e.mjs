// Test bout en bout du coffre de cartes : saisie chiffrée, lecture masquée, révélation réservée au SUPER_ADMIN, journal sans valeur,
// unicité du numéro, effacement, et non-fuite côté titulaire. API réelle sur :4000, base réelle.
// Usage : $env:E2E_PASSWORD='…'; node scripts/card-vault-e2e.mjs      (numéros de TEST générés, jamais une vraie carte)
import { randomInt } from "node:crypto"

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
function freshPan(prefix, length = 16) {
  let body = prefix
  while (body.length < length - 1) body += String(randomInt(0, 10))
  let sum = 0, double = true
  for (let i = body.length - 1; i >= 0; i--) { let d = Number(body[i]); if (double) { d *= 2; if (d > 9) d -= 9 } sum += d; double = !double }
  return `${body}${(10 - (sum % 10)) % 10}`
}

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "vault-e2e-root")
const stamp = Date.now()

// Personnel : un titulaire avec sa carte virtuelle
const holder = await call("admin.users.create", { firstName: "Coffre", lastName: "Titulaire", email: `vault-holder-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Coffre-Initial-2026x" }, { as: root })
const file = await call("admin.users.file", { userId: holder.userId }, { method: "GET", as: root })
const cardId = file.personal.accounts[0].cards[0].id
const other = await call("admin.users.create", { firstName: "Autre", lastName: "Titulaire", email: `vault-other-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR" }, { as: root })
const otherCard = (await call("admin.users.file", { userId: other.userId }, { method: "GET", as: root })).personal.accounts[0].cards[0].id
const ref = { walletType: "PERSONAL", cardId }

// Personnel staff : ADMIN et SUPPORT
const staff = {}
for (const [name, role] of [["admin", "admin"], ["agent", "agent"]]) {
  const email = `vault-${name}-${stamp}@vtex.local`
  const id = await call("users.create", { firstName: name, lastName: "Coffre", email, temporaryPassword: `${name}-Coffre-Password-1` }, { as: root })
  await call("users.update", { id, role }, { as: root })
  staff[name] = await login(email, `${name}-Coffre-Password-1`, `vault-e2e-${name}`)
}

console.log("\n── PERMISSIONS ──")
for (const [name, token] of Object.entries(staff)) {
  const list = await call("admin.cards.list", {}, { method: "GET", as: token })
  check(`${name} : liste les cartes (état masqué)`, Array.isArray(list) && list.some((c) => c.id === cardId))
  await expectError(`${name} : ne peut PAS révéler`, () => call("admin.cards.reveal", ref, { as: token }), "permission")
  await expectError(`${name} : ne peut PAS saisir`, () => call("admin.cards.setData", { ...ref, pan: freshPan("4") }, { as: token }), "permission")
  await expectError(`${name} : ne peut PAS effacer`, () => call("admin.cards.clearData", ref, { as: token }), "permission")
}
await expectError("sans session : refusé", () => call("admin.cards.list", {}, { method: "GET" }), "authentification")

console.log("\n── SAISIE CHIFFRÉE (SUPER_ADMIN) ──")
const pan = freshPan("4")
const saved = await call("admin.cards.setData", { ...ref, pan: pan.replace(/(\d{4})(?=\d)/g, "$1 "), cvv: "737", pin: "2468", expiryMonth: 9, expiryYear: new Date().getFullYear() + 3, cardholderName: "COFFRE TITULAIRE" }, { as: root })
check("coffre rempli : numéro, CVV, PIN", saved.vault.hasPan && saved.vault.hasCvv && saved.vault.hasPin && saved.vault.configured)
check("carte cohérente : 4 derniers chiffres, titulaire, réseau", saved.lastFour === pan.slice(-4) && saved.cardholderName === "COFFRE TITULAIRE" && saved.network === "visa", `${saved.lastFour} ${saved.network}`)
const serialized = JSON.stringify([saved, await call("admin.cards.get", ref, { method: "GET", as: staff.admin }), await call("admin.cards.list", {}, { method: "GET", as: root }), await call("admin.users.file", { userId: holder.userId }, { method: "GET", as: root })])
// Le CVV et le PIN (3-4 chiffres) se retrouveraient par hasard dans des horodatages : on cherche donc le NUMÉRO et toute clé pan / cvv / pin.
const hasSecretKey = (value) => value && typeof value === "object" && Object.entries(value).some(([key, inner]) => ["pan", "cvv", "pin"].includes(key) || hasSecretKey(inner))
check("aucune valeur dans get / list / fiche utilisateur (ADMIN et SUPER_ADMIN)", !serialized.includes(pan) && !hasSecretKey(JSON.parse(serialized)))
await expectError("même numéro sur une autre carte : refusé", () => call("admin.cards.setData", { walletType: "PERSONAL", cardId: otherCard, pan }, { as: root }), "déjà rattaché")

console.log("\n── RÉVÉLATION ──")
const revealed = await call("admin.cards.reveal", ref, { as: root })
check("révèle numéro, CVV, PIN, expiration ; remasquage annoncé à 30 s", revealed.pan === pan && revealed.cvv === "737" && revealed.pin === "2468" && revealed.maskAfterSeconds === 30 && revealed.expiryMonth === 9)
const after = await call("admin.cards.get", ref, { method: "GET", as: root })
check("consultation comptée et attribuée", after.vault.revealCount >= 1 && after.lastRevealedByName, `${after.vault.revealCount} · ${after.lastRevealedByName}`)

console.log("\n── JOURNAL ──")
const logs = await call("journal.list", { targetType: "card", limit: 200 }, { method: "GET", as: root })
const mine = logs.filter((entry) => entry.targetId === cardId)
check("saisie et révélation journalisées avec le rôle et l'IP", ["card.vault.set", "card.vault.reveal"].every((action) => mine.some((entry) => entry.action === action && entry.actorRole === "super_admin" && entry.ip)), mine.map((entry) => entry.action).join(", "))
check("le journal ne contient AUCUNE valeur de carte", !JSON.stringify(mine).includes(pan) && !mine.some((entry) => hasSecretKey(typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail)))

console.log("\n── TITULAIRE ──")
const holderToken = await login(`vault-holder-${stamp}@vtex.local`, "Coffre-Initial-2026x", "vault-e2e-holder")
await call("auth.changePassword", { currentPassword: "Coffre-Initial-2026x", newPassword: "Coffre-Nouveau-2026x" }, { as: holderToken })
await expectError("le titulaire n'accède pas à admin.cards", () => call("admin.cards.list", {}, { method: "GET", as: holderToken }), "permission")
await call("cards.setPin", { cardId, pin: "8642" }, { as: holderToken })
const mineCards = await call("cards.listMine", {}, { method: "GET", as: holderToken })
check("le titulaire reçoit pinConfigured, jamais pinHash, ni numéro", mineCards[0].pinConfigured === true && !("pinHash" in mineCards[0]) && !JSON.stringify(mineCards).includes(pan))
const afterPin = await call("admin.cards.get", ref, { method: "GET", as: root })
check("PIN changé par le titulaire : le PIN du coffre est invalidé, le numéro reste", afterPin.vault.hasPin === false && afterPin.vault.hasPan === true)

console.log("\n── EFFACEMENT ──")
const cleared = await call("admin.cards.clearData", ref, { as: root })
check("données effacées du coffre", cleared.vault.configured === false)
const empty = await call("admin.cards.reveal", ref, { as: root })
check("plus rien à révéler", empty.pan === null && empty.cvv === null && empty.pin === null)
await call("admin.cards.setData", { walletType: "PERSONAL", cardId: otherCard, pan }, { as: root })
check("le numéro effacé redevient utilisable ailleurs", true)

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
