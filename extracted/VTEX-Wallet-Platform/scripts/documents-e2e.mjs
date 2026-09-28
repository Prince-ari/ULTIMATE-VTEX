// Test bout en bout du Sprint 6 (Documents) contre l'API réelle sur :4000 (et le relais Wallet Pro sur :3001) : téléversement contrôlé (type, taille, CONTENU),
// envoi à plusieurs wallets, périmètre du gestionnaire, réception côté titulaire et côté entreprise, téléchargement sécurisé (en-têtes, journal, hors périmètre = introuvable),
// pièces remises par le titulaire (examen), archivage / retrait / rétablissement, journal sans contenu.
// Usage : $env:E2E_PASSWORD='…'; node scripts/documents-e2e.mjs   (≈ 3 minutes : pause pour le limiteur de connexion)
const API = "http://localhost:4000"
const PRO = "http://localhost:3001"
const TRPC = `${API}/api/trpc/`
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

const pdf = (marker = Math.random()) => new TextEncoder().encode(`%PDF-1.4\n% e2e ${marker}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`)
async function upload(token, purpose, bytes, name, type) {
  const form = new FormData()
  form.set("purpose", purpose)
  form.set("file", new File([bytes], name, { type }))
  const res = await fetch(`${API}/api/media/upload`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: form })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const download = (token, id, base = API, header = "authorization") => fetch(`${base}/api/media/documents/${id}`, { headers: token ? (header === "cookie" ? { cookie: `vtex_business_session=${token}` } : { authorization: `Bearer ${token}` }) : {} })

const password = process.env.E2E_PASSWORD ?? (() => { throw new Error("Définir E2E_PASSWORD (mot de passe du SUPER_ADMIN local).") })()
const stamp = Date.now()
const root = await login(process.env.E2E_EMAIL ?? "admin@vtex.local", password, "documents-e2e-root")

const client = await trpc("admin.users.create", { firstName: "Cliente", lastName: `Papiers${stamp}`, email: `doc-client-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Papiers-Initial-2026x" }, { as: root })
const shop = await trpc("admin.users.create", { firstName: "Gérant", lastName: "Papiers", email: `doc-shop-${stamp}@vtex.local`, walletType: "PROFESSIONAL", currency: "EUR", passwordMode: "manual", initialPassword: "Papiers-Initial-2026x", company: { legalName: `SAS Papiers ${stamp}`, brandName: `Papiers ${stamp}` } }, { as: root })
const stranger = await trpc("admin.users.create", { firstName: "Autre", lastName: `Papiers${stamp}`, email: `doc-other-${stamp}@vtex.local`, walletType: "PERSONAL", currency: "EUR" }, { as: root })

const managerCreated = await trpc("admin.managers.create", { firstName: "Camille", lastName: `Docs${stamp}`, email: `doc-manager-${stamp}@vtex.local`, role: "account_manager" }, { as: root })
const supportCreated = await trpc("admin.managers.create", { firstName: "Sam", lastName: `Docs${stamp}`, email: `doc-support-${stamp}@vtex.local`, role: "agent" }, { as: root })
const manager = await login(`doc-manager-${stamp}@vtex.local`, managerCreated.temporaryPassword, "documents-e2e-manager")
await trpc("auth.changePassword", { currentPassword: managerCreated.temporaryPassword, newPassword: "Docs-Nouveau-2026x" }, { as: manager })
const support = await login(`doc-support-${stamp}@vtex.local`, supportCreated.temporaryPassword, "documents-e2e-support")
await trpc("auth.changePassword", { currentPassword: supportCreated.temporaryPassword, newPassword: "Docs-Nouveau-2026x" }, { as: support })
await trpc("admin.managers.assign", { managerId: managerCreated.id, walletType: "PERSONAL", holderId: client.userId }, { as: root })

console.log("\n── TÉLÉVERSEMENT CONTRÔLÉ ──")
const file = await upload(root, "admin-document", pdf(), "releve_septembre.pdf", "application/pdf")
check("un vrai PDF est accepté et reçoit une clé privée propre à l'expéditeur", file.status === 201 && file.body.storageKey?.startsWith("media/admin/") && file.body.url === null, file.body.storageKey)
const html = await upload(root, "admin-document", new TextEncoder().encode("<html><script>alert(1)</script></html>"), "faux.pdf", "application/pdf")
check("du HTML déguisé en PDF est refusé (signature du contenu)", html.status === 400 && /ne correspond pas/i.test(html.body.error ?? ""), html.body.error)
const exe = await upload(root, "admin-document", new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), "prog.pdf", "application/pdf")
check("un exécutable renommé en PDF est refusé", exe.status === 400)
const wrongType = await upload(root, "admin-document", new TextEncoder().encode("hello"), "note.txt", "text/plain")
check("un format non pris en charge est refusé", wrongType.status === 400 && /Format refusé/.test(wrongType.body.error ?? ""), wrongType.body.error)
const big = await upload(root, "admin-document", new Uint8Array(8 * 1024 * 1024 + 1024).fill(0x25), "gros.pdf", "application/pdf")
check("un fichier de plus de 8 Mo est refusé", big.status === 400, big.body.error)
check("usage inconnu refusé", (await upload(root, "secret", pdf(), "a.pdf", "application/pdf")).status === 400)
check("sans session : 401", (await upload(null, "admin-document", pdf(), "a.pdf", "application/pdf")).status === 401)
check("le SUPPORT ne peut pas téléverser un document à envoyer", (await upload(support, "admin-document", pdf(), "a.pdf", "application/pdf")).status === 403)
const managerFile = await upload(manager, "admin-document", pdf(), "point.pdf", "application/pdf")
check("le GESTIONNAIRE de compte le peut (permission documents.send)", managerFile.status === 201)
const png = await upload(root, "admin-document", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), "scan.png", "image/png")
check("un scan PNG est accepté", png.status === 201)

console.log("\n── ENVOI À PLUSIEURS WALLETS ──")
const note = `Merci de vérifier avant le 30 (${stamp})`
const sent = await trpc("admin.documents.send", { storageKey: file.body.storageKey, fileName: file.body.fileName, title: `Relevé de septembre ${stamp}`, category: "statement", note, wallets: [{ walletType: "PERSONAL", holderId: client.userId }, { walletType: "PROFESSIONAL", holderId: shop.businessId }] }, { as: root })
check("un envoi → deux wallets (un destinataire chacun)", sent.sent === 2 && sent.wallets === 2 && sent.skipped.length === 0)
await expectError("clé d'un autre expéditeur refusée", () => trpc("admin.documents.send", { storageKey: managerFile.body.storageKey, fileName: "point.pdf", title: "Vol de fichier", category: "notice", wallets: [{ walletType: "PERSONAL", holderId: client.userId }] }, { as: root }), "ne correspond pas")
await expectError("wallet inconnu refusé", () => trpc("admin.documents.send", { storageKey: png.body.storageKey, fileName: "scan.png", title: "Pièce à vérifier", category: "identity", wallets: [{ walletType: "PERSONAL", holderId: 999999999 }] }, { as: root }), "introuvable")
await expectError("le SUPPORT n'envoie pas", () => trpc("admin.documents.send", { storageKey: png.body.storageKey, fileName: "scan.png", title: "Pièce à vérifier", category: "identity", wallets: [{ walletType: "PERSONAL", holderId: client.userId }] }, { as: support }), "permission")
await expectError("un GESTIONNAIRE n'envoie pas hors de son portefeuille (et rien n'est envoyé)", () => trpc("admin.documents.send", { storageKey: managerFile.body.storageKey, fileName: "point.pdf", title: "Point de situation", category: "notice", wallets: [{ walletType: "PERSONAL", holderId: client.userId }, { walletType: "PERSONAL", holderId: stranger.userId }] }, { as: manager }), "portefeuille")
const own = await trpc("admin.documents.send", { storageKey: managerFile.body.storageKey, fileName: "point.pdf", title: `Point de situation ${stamp}`, category: "notice", wallets: [{ walletType: "PERSONAL", holderId: client.userId }] }, { as: manager })
check("un GESTIONNAIRE envoie dans son portefeuille", own.sent === 1)

console.log("\n── LECTURE ET PÉRIMÈTRE (Dashboard) ──")
const all = await trpc("admin.documents.list", { search: String(stamp) }, { method: "GET", as: root })
check("l'administrateur voit les 3 remises, sans clé de stockage ni empreinte dans la liste", all.length === 3 && !/storageKey|storage_key|media\/admin|sha256/.test(JSON.stringify(all)))
const mine = await trpc("admin.documents.list", { search: String(stamp) }, { method: "GET", as: manager })
check("le gestionnaire ne voit que les documents de son portefeuille", mine.length === 2 && mine.every((row) => row.holderId === client.userId))
const shopDoc = all.find((row) => row.walletType === "PROFESSIONAL")
await expectError("hors périmètre = introuvable (jamais « interdit »)", () => trpc("admin.documents.get", { id: shopDoc.id }, { method: "GET", as: manager }), "introuvable")
check("le SUPPORT lit tout", (await trpc("admin.documents.list", { search: String(stamp) }, { method: "GET", as: support })).length === 3)
const detail = await trpc("admin.documents.get", { id: shopDoc.id }, { method: "GET", as: root })
check("la fiche donne l'empreinte SHA-256 et l'historique", /^[0-9a-f]{64}$/.test(detail.sha256) && detail.history.some((entry) => entry.action === "document.send") && detail.batchSize === 2)

console.log("\n── RÉCEPTION ET TÉLÉCHARGEMENT ──")
await sleep(62_000)
const clientToken = await login(`doc-client-${stamp}@vtex.local`, "Papiers-Initial-2026x", "documents-e2e-client")
check("téléchargement refusé tant que le mot de passe temporaire n'est pas remplacé", (await download(clientToken, all.find((row) => row.walletType === "PERSONAL" && row.title.startsWith("Relevé")).id)).status === 403)
await trpc("auth.changePassword", { currentPassword: "Papiers-Initial-2026x", newPassword: "Papiers-Nouveau-2026x" }, { as: clientToken })
const inbox = await trpc("documents.listMine", {}, { method: "GET", as: clientToken })
const statement = inbox.find((row) => row.title === `Relevé de septembre ${stamp}`)
check("la titulaire voit son relevé (catégorie, note, wallet), sans clé ni empreinte", statement?.documentType === "statement" && statement.note === note && statement.walletType === "PERSONAL" && !/storageKey|storage_key|sha256|media\/admin/.test(JSON.stringify(inbox)))
const okDownload = await download(clientToken, statement.id)
const bytes = new Uint8Array(await okDownload.arrayBuffer())
check("téléchargement du PDF : 200 et contenu intact", okDownload.status === 200 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-")
const headers = Object.fromEntries(okDownload.headers.entries())
check("en-têtes : pièce jointe, sans mise en cache, sans détection de type, bac à sable", /^attachment/.test(headers["content-disposition"] ?? "") && /no-store/.test(headers["cache-control"] ?? "") && headers["x-content-type-options"] === "nosniff" && /sandbox/.test(headers["content-security-policy"] ?? "") && headers["cross-origin-resource-policy"] === "same-origin", headers["content-security-policy"])
check("sans session : 401 ; identifiant invalide : 404", (await download(null, statement.id)).status === 401 && (await download(clientToken, "abc")).status === 404)
check("la première ouverture est horodatée", (await trpc("admin.documents.get", { id: statement.id }, { method: "GET", as: root })).firstViewedAt !== null)

await sleep(20_000)
const ownerToken = await login(`doc-shop-${stamp}@vtex.local`, "Papiers-Initial-2026x", "documents-e2e-owner")
await trpc("auth.changePassword", { currentPassword: "Papiers-Initial-2026x", newPassword: "Papiers-Nouveau-2026x" }, { as: ownerToken })
const ownerInbox = await trpc("documents.listMine", {}, { method: "GET", as: ownerToken })
const proDoc = ownerInbox.find((row) => row.title === `Relevé de septembre ${stamp}`)
check("le propriétaire de l'entreprise reçoit le document adressé à son wallet Pro", proDoc?.walletType === "PROFESSIONAL" && proDoc.holderId === shop.businessId)
check("il ne voit pas les documents de la titulaire", !ownerInbox.some((row) => row.title.startsWith("Point de situation")))
check("un document d'un AUTRE titulaire est « introuvable » (IDOR)", (await download(ownerToken, statement.id)).status === 404)
const viaRelay = await download(ownerToken, proDoc.id, PRO, "cookie")
check("relais Wallet Pro : le propriétaire télécharge avec son cookie, mêmes en-têtes de sécurité", viaRelay.status === 200 && /sandbox/.test(viaRelay.headers.get("content-security-policy") ?? "") && /^attachment/.test(viaRelay.headers.get("content-disposition") ?? "") && new TextDecoder().decode(new Uint8Array(await viaRelay.arrayBuffer()).slice(0, 5)) === "%PDF-")
check("relais Wallet Pro sans cookie : 401 ; document d'un autre : 404", (await download(null, proDoc.id, PRO, "cookie")).status === 401 && (await download(ownerToken, statement.id, PRO, "cookie")).status === 404)

console.log("\n── ARCHIVER, RETIRER, RÉTABLIR ──")
await expectError("motif obligatoire", () => trpc("admin.documents.setStatus", { id: statement.id, status: "archived", reason: "court" }, { as: root }))
await trpc("admin.documents.setStatus", { id: statement.id, status: "archived", reason: "Doublon avec le relevé annuel" }, { as: root })
check("archivé : invisible du titulaire, téléchargement refusé", !(await trpc("documents.listMine", {}, { method: "GET", as: clientToken })).some((row) => row.id === statement.id) && (await download(clientToken, statement.id)).status === 404)
check("archivé : toujours téléchargeable par l'administration", (await download(root, statement.id)).status === 200)
await trpc("admin.documents.setStatus", { id: statement.id, status: "active", reason: "Archivé par erreur, on le rétablit" }, { as: root })
check("rétabli : de nouveau visible", (await trpc("documents.listMine", {}, { method: "GET", as: clientToken })).some((row) => row.id === statement.id))
await expectError("le SUPPORT n'archive pas", () => trpc("admin.documents.setStatus", { id: statement.id, status: "revoked", reason: "Tentative du support" }, { as: support }), "permission")
await expectError("le GESTIONNAIRE n'archive pas", () => trpc("admin.documents.setStatus", { id: statement.id, status: "revoked", reason: "Tentative du gestionnaire" }, { as: manager }), "permission")
await trpc("admin.documents.setStatus", { id: statement.id, status: "revoked", reason: "Envoyé par erreur à ce titulaire" }, { as: root })
check("retiré : plus rien côté titulaire, notification envoyée", (await download(clientToken, statement.id)).status === 404 && (await trpc("notifications.listMine", {}, { method: "GET", as: clientToken })).some((item) => item.title === "Document retiré"))

console.log("\n── PIÈCE REMISE PAR LE TITULAIRE ──")
const proof = await upload(clientToken, "transfer-proof", pdf(), "preuve.pdf", "application/pdf")
check("le titulaire téléverse une preuve de virement", proof.status === 201 && proof.body.storageKey?.startsWith(`media/users/${client.userId}/transfer-proof/`))
check("le titulaire ne peut pas téléverser « admin-document »", (await upload(clientToken, "admin-document", pdf(), "x.pdf", "application/pdf")).status === 403)
await trpc("documents.submitTransferProof", { title: `Preuve de virement ${stamp}`, fileName: "preuve.pdf", mimeType: "application/pdf", storageKey: proof.body.storageKey, sizeBytes: proof.body.sizeBytes, transactionReference: `VTX-${stamp}` }, { as: clientToken })
const pending = (await trpc("admin.documents.list", { review: "pending", search: String(stamp) }, { method: "GET", as: root }))
check("la preuve arrive « à examiner » côté administration", pending.length === 1 && pending[0].category === "transfer_proof" && pending[0].source === "user")
await expectError("le SUPPORT ne valide pas", () => trpc("admin.documents.review", { id: pending[0].id, decision: "validated" }, { as: support }), "permission")
await expectError("un refus se justifie", () => trpc("admin.documents.review", { id: pending[0].id, decision: "rejected" }, { as: root }), "justifié")
const rejected = await trpc("admin.documents.review", { id: pending[0].id, decision: "rejected", reason: "Le montant n'est pas lisible sur la capture." }, { as: root })
check("refus motivé : le titulaire lit le motif", rejected.reviewStatus === "rejected" && (await trpc("documents.listMine", {}, { method: "GET", as: clientToken })).some((row) => row.reviewStatus === "rejected" && row.reviewReason === "Le montant n'est pas lisible sur la capture."))
await expectError("une décision est définitive", () => trpc("admin.documents.review", { id: pending[0].id, decision: "validated" }, { as: root }), "déjà")

console.log("\n── JOURNAL ──")
const trail = await trpc("journal.list", { targetType: "document", limit: 500 }, { method: "GET", as: root })
const actions = new Set(trail.map((entry) => entry.action))
check("actions journalisées", ["document.send", "document.download", "document.archive", "document.restore", "document.revoke", "document.reject", "transfer_proof.submit"].every((action) => actions.has(action)), [...actions].filter((action) => /document|transfer/.test(action)).join(", "))
const scoped = trail.filter((entry) => entry.holderId === client.userId && entry.walletType === "PERSONAL")
check("chaque événement est rattaché au wallet concerné", scoped.length >= 5)
const dump = JSON.stringify(trail)
check("le journal ne contient ni le texte de la note, ni le contenu du fichier, ni un mot de passe", !dump.includes(note) && !dump.includes("%PDF") && !dump.includes(managerCreated.temporaryPassword))
check("les téléchargements portent le rôle de l'acteur", trail.some((entry) => entry.action === "document.download" && entry.actorRole === "user") && trail.some((entry) => entry.action === "document.download" && entry.actorRole === "super_admin"))

console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)
