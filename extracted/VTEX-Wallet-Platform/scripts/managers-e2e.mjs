// Test bout en bout du Sprint 5 (Support / gestionnaires de compte / suggestions) contre l'API réelle sur :4000 : création d'un gestionnaire (mot de passe temporaire,
// première connexion, changement obligatoire), attributions, portefeuille borné, suggestions (périmètre, réception côté titulaire et côté entreprise, lecture), journal.
// Usage : $env:E2E_PASSWORD='…'; node scripts/managers-e2e.mjs   (≈ 3 minutes : pauses pour le limiteur de connexion)
const TRPC = "http://localhost:4000/api/trpc/"
let failures = 0
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function trpc(path, input, { method = "POST", as = null } = {}) {
  const headers = { "content-type": "application/json" }
  if (as) headers.authorization = `Bearer ${as}`
  const url = method === "GET" ? `${TRPC}${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}` : `${TRPC}${path}`
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
  const { userId } = await trpc("auth.login", { email, password })
  const { code } = await trpc("auth.devPeekOtp", { userId }, { method: "GET" })
  return (await trpc("auth.verifyOtp", { userId, code, device })).token
}

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const stamp = Date.now()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "managers-e2e-root")

const client = await trpc("admin.users.create", { firstName: "Cliente", lastName: `Suivie${stamp}`, email: `mgr-client-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Suivi-Initial-2026x" }, { as: root })
const shop = await trpc("admin.users.create", { firstName: "Gérant", lastName: "Suivi", email: `mgr-shop-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Suivi-Initial-2026x", company: { legalName: `SAS Suivi ${stamp}`, brandName: `Suivi ${stamp}` } }, { as: root })
const stranger = await trpc("admin.users.create", { firstName: "Autre", lastName: `Cliente${stamp}`, email: `mgr-other-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR" }, { as: root })

console.log("\n── CRÉATION ET PREMIÈRE CONNEXION ──")
const managerEmail = `mgr-manager-${stamp}@vtex.local`
const created = await trpc("admin.managers.create", { firstName: "Camille", lastName: `Gestion${stamp}`, email: managerEmail, role: "account_manager" }, { as: root })
check("gestionnaire créé avec un mot de passe temporaire (montré une fois)", created.temporaryPassword.length >= 12 && new Date(created.expiresAt) > new Date())
const supportCreated = await trpc("admin.managers.create", { firstName: "Sam", lastName: `Support${stamp}`, email: `mgr-support-${stamp}@vtex.local`, role: "agent" }, { as: root })
let manager = await login(managerEmail, created.temporaryPassword, "managers-e2e-manager")
const me = await trpc("users.getMe", {}, { method: "GET", as: manager })
check("compte gestionnaire : rôle account_manager, changement de mot de passe exigé", me.role === "account_manager" && me.mustChangePassword === true)
await expectError("tant que le mot de passe temporaire n'est pas remplacé, tout est refusé", () => trpc("admin.portfolio.list", {}, { method: "GET", as: manager }), "PASSWORD_CHANGE_REQUIRED")
await trpc("auth.changePassword", { currentPassword: created.temporaryPassword, newPassword: "Gestion-Nouveau-2026x" }, { as: manager })
check("après changement : portefeuille vide", (await trpc("admin.portfolio.list", {}, { method: "GET", as: manager })).length === 0)
await expectError("aucun accès transverse (utilisateurs)", () => trpc("admin.users.list", {}, { method: "GET", as: manager }), "permission")
await expectError("ni gestionnaires, ni banque, ni cartes", async () => { await trpc("admin.managers.list", {}, { method: "GET", as: manager }) }, "permission")

console.log("\n── ATTRIBUTIONS ──")
const assign = (walletType, holderId, extra = {}) => trpc("admin.managers.assign", { managerId: created.id, walletType, holderId, ...extra }, { as: root })
const first = await assign("PERSONAL", client.userId, { reason: "Cliente à suivre de près" })
check("attribution du wallet personnel", first.created === true && first.wallets.length === 1)
check("attribution idempotente (pas de doublon)", (await assign("PERSONAL", client.userId)).created === false)
await assign("PROFESSIONAL", shop.businessId)
await expectError("titulaire inexistant refusé", () => assign("PERSONAL", 999999999), "introuvable")
const listed = await trpc("admin.managers.list", { search: managerEmail }, { method: "GET", as: root })
check("la liste reflète 2 wallets", listed[0]?.walletCount === 2 && listed[0].wallets.length === 2)
const mine = await trpc("admin.portfolio.list", {}, { method: "GET", as: manager })
check("le gestionnaire voit exactement ses 2 wallets", mine.length === 2 && mine.some((row) => row.walletType === "PROFESSIONAL" && row.holderId === shop.businessId))
const sheet = await trpc("admin.portfolio.wallet", { walletType: "PERSONAL", holderId: client.userId }, { method: "GET", as: manager })
check("fiche du wallet : identité, compte en euros, aucune donnée sensible", sheet.holder.walletType === "PERSONAL" && sheet.accounts[0]?.currency === "EUR" && !/iban|passwordHash|pinHash|tokenReference|keyHash/i.test(JSON.stringify(sheet)))
await expectError("wallet d'un autre : refusé (IDOR)", () => trpc("admin.portfolio.wallet", { walletType: "PERSONAL", holderId: stranger.userId }, { method: "GET", as: manager }), "portefeuille")

console.log("\n── SUGGESTIONS ──")
const support = await login(`mgr-support-${stamp}@vtex.local`, supportCreated.temporaryPassword, "managers-e2e-support")
await trpc("auth.changePassword", { currentPassword: supportCreated.temporaryPassword, newPassword: "Support-Nouveau-2026x" }, { as: support })
const sent = await trpc("admin.suggestions.send", { wallets: [{ walletType: "PERSONAL", holderId: client.userId }, { walletType: "PROFESSIONAL", holderId: shop.businessId }], title: "Complétez votre profil", body: "Ajoutez un justificatif pour lever vos plafonds." }, { as: support })
check("le SUPPORT écrit à un wallet personnel et à une entreprise", sent.sent === 2 && sent.wallets === 2 && sent.skipped.length === 0)
await expectError("un GESTIONNAIRE n'écrit pas hors de son périmètre (et rien n'est envoyé)", () => trpc("admin.suggestions.send", { wallets: [{ walletType: "PERSONAL", holderId: client.userId }, { walletType: "PERSONAL", holderId: stranger.userId }], title: "Bonjour", body: "Message partiel interdit." }, { as: manager }), "portefeuille")
const own = await trpc("admin.suggestions.send", { wallets: [{ walletType: "PERSONAL", holderId: client.userId }], title: "Votre point mensuel", body: "Souhaitez-vous planifier un échange cette semaine ?" }, { as: manager })
check("un GESTIONNAIRE écrit à un wallet attribué", own.sent === 1)
const seen = await trpc("admin.suggestions.list", {}, { method: "GET", as: manager })
check("un gestionnaire ne lit que ses propres envois", seen.length === 1 && seen[0].title === "Votre point mensuel")
check("le SUPPORT voit tous les envois", (await trpc("admin.suggestions.list", { search: String(client.userId) === "" ? "" : "Complétez" }, { method: "GET", as: support })).length >= 2)
const targets = await trpc("admin.suggestions.targets", { query: "" }, { method: "GET", as: manager })
check("le sélecteur du gestionnaire ne propose que son portefeuille", targets.length === 2 && targets.every((target) => [client.userId, shop.businessId].includes(target.holderId)))

console.log("\n── RÉCEPTION (côté wallet) ──")
await sleep(62_000)
const clientToken = await login(`mgr-client-${stamp}@vtex.local`, "Suivi-Initial-2026x", "managers-e2e-client")
await trpc("auth.changePassword", { currentPassword: "Suivi-Initial-2026x", newPassword: "Suivi-Nouveau-2026x" }, { as: clientToken })
const inbox = await trpc("notifications.listMine", {}, { method: "GET", as: clientToken })
const suggestions = inbox.filter((item) => item.kind === "suggestion")
check("la titulaire reçoit les deux suggestions, avec le prénom et le rôle de l'auteur", suggestions.length === 2 && suggestions.some((item) => item.sender?.firstName === "Sam" && item.sender.role === "agent") && suggestions.some((item) => item.sender?.firstName === "Camille" && item.sender.role === "account_manager"))
check("aucun e-mail ni identifiant d'auteur dans ce qu'elle reçoit", !/@vtex\.local|createdBy/.test(JSON.stringify(suggestions.map((item) => ({ sender: item.sender })))) )
const before = await trpc("notifications.unreadCount", {}, { method: "GET", as: clientToken })
await trpc("notifications.markRead", { notificationId: suggestions[0].id }, { as: clientToken })
check("lire une suggestion décrémente le compteur", (await trpc("notifications.unreadCount", {}, { method: "GET", as: clientToken })) === before - 1)
const track = await trpc("admin.suggestions.list", { search: "Complétez" }, { method: "GET", as: support })
check("l'expéditeur voit l'état de lecture", track.some((row) => row.read === true) || track.some((row) => row.read === false))
const ownerToken = await login(`mgr-shop-${stamp}@vtex.local`, "Suivi-Initial-2026x", "managers-e2e-owner")
await trpc("auth.changePassword", { currentPassword: "Suivi-Initial-2026x", newPassword: "Suivi-Nouveau-2026x" }, { as: ownerToken })
const ownerInbox = await trpc("notifications.listMine", {}, { method: "GET", as: ownerToken })
check("le propriétaire de l'entreprise reçoit la suggestion adressée à son wallet Pro", ownerInbox.some((item) => item.kind === "suggestion" && item.walletType === "PROFESSIONAL" && item.holderId === shop.businessId))
await expectError("un titulaire ne peut pas envoyer de suggestion", () => trpc("admin.suggestions.send", { wallets: [{ walletType: "PERSONAL", holderId: client.userId }], title: "Titre valide", body: "Un titulaire n'écrit pas." }, { as: clientToken }), "permission")

console.log("\n── RETRAIT ET SUSPENSION ──")
const removed = await trpc("admin.managers.unassign", { managerId: created.id, walletType: "PERSONAL", holderId: client.userId, reason: "Suivi transféré à un collègue" }, { as: root })
check("retrait : le wallet quitte le portefeuille", removed.removed === true && removed.wallets.length === 1)
await expectError("l'accès disparaît immédiatement", () => trpc("admin.portfolio.wallet", { walletType: "PERSONAL", holderId: client.userId }, { method: "GET", as: manager }), "portefeuille")
const suspended = await trpc("admin.managers.setStatus", { id: created.id, status: "suspended", reason: "Départ du gestionnaire de l'équipe" }, { as: root })
check("suspension : compte suspendu", suspended.status === "suspended")
await expectError("ses sessions sont coupées", () => trpc("admin.portfolio.list", {}, { method: "GET", as: manager }))
await expectError("il ne peut plus se reconnecter", () => login(managerEmail, "Gestion-Nouveau-2026x", "managers-e2e-again"))

console.log("\n── JOURNAL ──")
const trail = await trpc("journal.list", { targetType: "user", limit: 500 }, { method: "GET", as: root })
const actions = new Set(trail.map((entry) => entry.action))
check("actions journalisées", ["manager.create", "manager.assign", "manager.unassign", "manager.suspend", "suggestion.send", "portfolio.view"].every((action) => actions.has(action)), [...actions].filter((action) => /manager|suggestion|portfolio/.test(action)).join(", "))
check("le journal ne contient ni mot de passe ni texte de suggestion", !JSON.stringify(trail).includes(created.temporaryPassword) && !JSON.stringify(trail).includes("justificatif"))

console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
