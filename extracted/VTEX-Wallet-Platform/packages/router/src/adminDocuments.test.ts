import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { adminUploadKey, db, documentFiles, documents, hashPassword, logs, notifications, putPrivateObject, resolveDownload as resolveDownloadRaw, runWithRequestContext, sha256Hex, users, type Actor, type Role } from "@vtex/core"

import { createManagedUser } from "./admin"
import { appRouter } from "./index"

// Stockage local jetable : aucun objet réel n'est touché, aucune variable S3 n'est lue.
const previous = { dir: process.env.VTEX_MEDIA_LOCAL_DIR, endpoint: process.env.VTEX_MEDIA_S3_ENDPOINT }
beforeAll(() => {
  process.env.VTEX_MEDIA_LOCAL_DIR = mkdtempSync(join(tmpdir(), "vtex-docs-"))
  delete process.env.VTEX_MEDIA_S3_ENDPOINT
})
afterAll(() => {
  if (previous.dir === undefined) delete process.env.VTEX_MEDIA_LOCAL_DIR
  else process.env.VTEX_MEDIA_LOCAL_DIR = previous.dir
  if (previous.endpoint !== undefined) process.env.VTEX_MEDIA_S3_ENDPOINT = previous.endpoint
})

async function makeStaff(role: Role, label = "Staff"): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: label, lastName: suffix, email: `doc-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}
const callerFor = (actor: Actor | null, ip = "10.8.0.1") => appRouter.createCaller({ actor, jti: actor ? "jti-doc" : null, ip, requestId: `req-${randomUUID().slice(0, 6)}` })
const detailOf = (entry: { detail: unknown }) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail) as Record<string, unknown>

const resolveDownload = (actor: Actor, id: number) => runWithRequestContext({ requestId: `req-${randomUUID().slice(0, 6)}`, actorId: actor.id, actorRole: actor.role, sessionJti: "jti-dl", ip: "10.8.0.9", supportSessionId: null }, () => resolveDownloadRaw(db, actor, id))

async function personal(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Cliente", lastName: suffix, email: `cliente-doc-${suffix}@test.local`, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
  return { actor: { id: created.userId, role: "user" as const } satisfies Actor, holderId: created.userId, name: `Cliente ${suffix}`, suffix }
}
async function company(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Gérant", lastName: suffix, email: `gerant-doc-${suffix}@test.local`, walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: `SARL Papiers ${suffix}`, brandName: `Papiers ${suffix}` } })
  return { owner: { id: created.userId, role: "user" as const } satisfies Actor, holderId: created.businessId!, name: `Papiers ${suffix}` }
}
async function newManager(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await callerFor(admin).admin.managers.create({ firstName: "Gestion", lastName: suffix, email: `gestion-doc-${suffix}@test.local`, role: "account_manager" })
  return { actor: { id: created.id, role: "account_manager" } as Actor, id: created.id }
}

const pdfBytes = (marker = randomUUID()) => new TextEncoder().encode(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`)
/** Dépose un objet privé comme le fait `/api/media/upload` (clé propre à l'expéditeur). */
async function upload(actor: Actor, bytes: Uint8Array = pdfBytes(), fileName = "releve.pdf", mime = "application/pdf") {
  const key = adminUploadKey(actor.id, fileName, mime)
  await putPrivateObject(key, bytes, mime)
  return { storageKey: key, fileName, bytes }
}

describe("admin.documents — envoi à plusieurs wallets", () => {
  it("un fichier stocké une fois, une remise par destinataire, notifiée et journalisée sur chaque wallet ; aucune clé de stockage ne sort", async () => {
    const admin = await makeStaff("admin")
    const client = await personal(admin)
    const shop = await company(admin)
    const file = await upload(admin)
    const title = `Contrat cadre ${client.suffix}`

    const result = await callerFor(admin).admin.documents.send({
      storageKey: file.storageKey, fileName: file.fileName, title, category: "contract", note: "À signer avant la fin du mois.",
      wallets: [{ walletType: "PERSONAL", holderId: client.holderId }, { walletType: "PROFESSIONAL", holderId: shop.holderId }, { walletType: "PERSONAL", holderId: client.holderId }],
    })
    expect(result).toMatchObject({ sent: 2, wallets: 2, skipped: [] })

    // Un seul objet, une seule empreinte, deux remises partageant le même envoi.
    const files = await db.select().from(documentFiles).where(eq(documentFiles.storageKey, file.storageKey))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ sha256: sha256Hex(file.bytes), mimeType: "application/pdf", uploadedBy: admin.id, sizeBytes: file.bytes.byteLength })
    const rows = await db.select().from(documents).where(eq(documents.batchId, result.batchId))
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.fileId === files[0]!.id && row.status === "active" && row.reviewStatus === "none" && row.source === "admin" && row.storageKey === null)).toBe(true)
    expect(rows.map((row) => row.userId).sort()).toEqual([client.holderId, shop.owner.id].sort())

    // Le titulaire le voit, sans clé ni empreinte ; la première ouverture est horodatée.
    const mine = await callerFor(client.actor).documents.listMine()
    const seen = mine.find((row) => row.title === title)!
    expect(seen).toMatchObject({ documentType: "contract", note: "À signer avant la fin du mois.", reviewStatus: "none", firstViewedAt: null, walletType: "PERSONAL", holderId: client.holderId })
    expect(JSON.stringify(mine)).not.toMatch(/storageKey|storage_key|sha256|media\/admin/)
    const target = await resolveDownload(client.actor, seen.id)
    expect(target).toMatchObject({ fileName: "releve.pdf", storageKey: file.storageKey })
    expect((await db.select().from(documents).where(eq(documents.id, seen.id)))[0]!.firstViewedAt).not.toBeNull()
    // Un autre titulaire ne peut pas le résoudre, et un membre de l'entreprise ne voit que sa remise.
    const stranger = await personal(admin)
    await expect(resolveDownload(stranger.actor, seen.id)).rejects.toThrow(/introuvable/)
    expect((await callerFor(shop.owner).documents.listMine()).filter((row) => row.title === title)).toHaveLength(1)

    // Notification persistante pour chaque destinataire, sans contenu du fichier.
    const told = await db.select().from(notifications).where(and(inArray(notifications.targetUserId, [client.holderId, shop.owner.id]), eq(notifications.title, "Nouveau document disponible")))
    expect(told).toHaveLength(2)

    // Audit : un envoi par wallet, sur le wallet concerné, avec l'empreinte mais jamais le contenu ni la note.
    const trail = await db.select().from(logs).where(and(eq(logs.action, "document.send"), inArray(logs.holderId, [client.holderId, shop.holderId])))
    expect(trail).toHaveLength(2)
    expect(trail.find((entry) => entry.walletType === "PERSONAL")).toMatchObject({ actorId: admin.id, holderId: client.holderId, targetType: "document" })
    expect(detailOf(trail[0]!)).toMatchObject({ title, category: "contract", sha256: sha256Hex(file.bytes), batchId: result.batchId })
    expect(JSON.stringify(trail)).not.toContain("À signer")

    // Vue administrateur : holder, destinataire, expéditeur ; jamais la clé ; empreinte et historique dans la fiche.
    const listed = await callerFor(admin).admin.documents.list({ search: client.suffix })
    expect(listed.find((row) => row.id === seen.id)).toMatchObject({ title, holder: { name: client.name }, recipient: { id: client.holderId }, sender: { id: admin.id, role: "admin" }, batchId: result.batchId, firstViewedAt: expect.any(Date) })
    expect(JSON.stringify(listed)).not.toMatch(/storageKey|storage_key|media\/admin|sha256/)
    const detail = await callerFor(admin).admin.documents.get({ id: seen.id })
    expect(detail).toMatchObject({ sha256: sha256Hex(file.bytes), batchSize: 2 })
    expect(detail.history?.map((entry) => entry.action)).toEqual(expect.arrayContaining(["document.send", "document.download"]))
    // Recherche par nom d'entreprise et filtres.
    expect((await callerFor(admin).admin.documents.list({ search: shop.name })).some((row) => row.holder?.name === shop.name && row.title === title)).toBe(true)
    expect((await callerFor(admin).admin.documents.list({ search: client.suffix, walletType: "PROFESSIONAL" })).some((row) => row.id === seen.id)).toBe(false)
    expect((await callerFor(admin).admin.documents.list({ search: client.suffix, category: "contract", status: "active" })).length).toBeGreaterThan(0)
  })

  it("validation : clé étrangère, contenu déguisé, fichier absent, titre, 50 wallets, wallet inconnu ; un titulaire suspendu est ignoré (signalé) ; rôles sans droit refusés", async () => {
    const admin = await makeStaff("admin")
    const other = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const active = await personal(admin)
    const suspended = await personal(admin)
    await callerFor(admin).users.suspend({ id: suspended.holderId })
    const wallet = { walletType: "PERSONAL" as const, holderId: active.holderId }
    const file = await upload(admin)
    const send = (input: Partial<Parameters<ReturnType<typeof callerFor>["admin"]["documents"]["send"]>[0]> = {}) =>
      callerFor(admin).admin.documents.send({ storageKey: file.storageKey, fileName: file.fileName, title: "Relevé annuel", category: "statement", wallets: [wallet], ...input })

    await expect(send({ title: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ note: "y".repeat(501) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: Array.from({ length: 51 }, (_, index) => ({ walletType: "PERSONAL" as const, holderId: index + 1 })) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ category: "transfer_proof" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: [{ walletType: "PERSONAL", holderId: 999_999_999 }] })).rejects.toThrow(/introuvable/)

    // Clé d'un autre administrateur, traversée de chemin, objet inexistant.
    const foreign = await upload(other)
    await expect(send({ storageKey: foreign.storageKey })).rejects.toThrow(/ne correspond pas à la session/)
    await expect(send({ storageKey: `media/admin/${admin.id}/documents/../../users/1/avatar/x.png` })).rejects.toThrow(/Fichier introuvable|média/)
    await expect(send({ storageKey: `media/admin/${admin.id}/documents/${randomUUID()}.pdf` })).rejects.toThrow(/Fichier introuvable/)

    // Contenu qui ne correspond pas à son type : un HTML stocké comme « PDF », un exécutable renommé.
    const disguised = await upload(admin, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "faux.pdf", "application/pdf")
    await expect(send({ storageKey: disguised.storageKey, fileName: "faux.pdf" })).rejects.toThrow(/ne correspond pas à son type/)
    const exe = await upload(admin, new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "prog.pdf", "application/pdf")
    await expect(send({ storageKey: exe.storageKey, fileName: "prog.pdf" })).rejects.toThrow(/ne correspond pas à son type/)
    expect(await db.select().from(documentFiles).where(inArray(documentFiles.storageKey, [disguised.storageKey, exe.storageKey]))).toHaveLength(0)

    // Un chemin dans le nom est retiré : on ne garde que le nom de fichier.
    const named = await send({ fileName: "..\\..\\etc\\passwd.pdf" })
    expect(named.sent).toBe(1)
    expect((await db.select().from(documents).where(eq(documents.batchId, named.batchId)))[0]!.fileName).toBe("passwd.pdf")

    const mixed = await send({ storageKey: (await upload(admin)).storageKey, wallets: [wallet, { walletType: "PERSONAL", holderId: suspended.holderId }] })
    expect(mixed).toMatchObject({ sent: 1, wallets: 1, skipped: [expect.objectContaining({ holderId: suspended.holderId, reason: "Aucun destinataire actif" })] })

    await expect(callerFor(agent).admin.documents.send({ storageKey: file.storageKey, fileName: file.fileName, title: "Relevé annuel", category: "statement", wallets: [wallet] })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(active.actor).admin.documents.send({ storageKey: file.storageKey, fileName: file.fileName, title: "Relevé annuel", category: "statement", wallets: [wallet] })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(active.actor).admin.documents.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(null).admin.documents.list()).rejects.toThrow(/Authentification/)
  })
})

describe("admin.documents — le périmètre du gestionnaire de compte", () => {
  it("il n'envoie et ne lit que dans son portefeuille : un seul refus annule tout, hors périmètre = introuvable, le support lit sans envoyer", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const manager = await newManager(admin)
    const mine = await personal(admin)
    const notMine = await personal(admin)
    await callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: mine.holderId })

    const file = await upload(manager.actor)
    const before = await db.select().from(documents).where(eq(documents.uploadedBy, manager.id))
    await expect(callerFor(manager.actor).admin.documents.send({ storageKey: file.storageKey, fileName: file.fileName, title: "Point de situation", category: "notice", wallets: [{ walletType: "PERSONAL", holderId: mine.holderId }, { walletType: "PERSONAL", holderId: notMine.holderId }] })).rejects.toThrow(/ne fait pas partie de votre portefeuille/)
    expect((await db.select().from(documents).where(eq(documents.uploadedBy, manager.id))).length).toBe(before.length)
    expect(await db.select().from(documentFiles).where(eq(documentFiles.storageKey, file.storageKey))).toHaveLength(0)

    const ok = await callerFor(manager.actor).admin.documents.send({ storageKey: file.storageKey, fileName: file.fileName, title: "Point de situation", category: "notice", wallets: [{ walletType: "PERSONAL", holderId: mine.holderId }] })
    expect(ok.sent).toBe(1)
    const adminDoc = await callerFor(admin).admin.documents.send({ storageKey: (await upload(admin)).storageKey, fileName: "autre.pdf", title: "Document du client hors portefeuille", category: "tax", wallets: [{ walletType: "PERSONAL", holderId: notMine.holderId }] })
    const [outside] = await db.select().from(documents).where(eq(documents.batchId, adminDoc.batchId))
    const [inside] = await db.select().from(documents).where(eq(documents.batchId, ok.batchId))

    const listed = await callerFor(manager.actor).admin.documents.list()
    expect(listed.every((row) => row.holderId === mine.holderId && row.walletType === "PERSONAL")).toBe(true)
    expect(listed.some((row) => row.id === inside!.id)).toBe(true)
    expect(listed.some((row) => row.id === outside!.id)).toBe(false)
    expect((await callerFor(manager.actor).admin.documents.list({ search: notMine.suffix })).length).toBe(0)
    const detail = await callerFor(manager.actor).admin.documents.get({ id: inside!.id })
    expect(detail.history).toBeNull()
    expect(detail).toMatchObject({ holder: { name: mine.name } })
    await expect(callerFor(manager.actor).admin.documents.get({ id: outside!.id })).rejects.toThrow(/Document introuvable/)
    await expect(callerFor(manager.actor).admin.documents.get({ id: 999_999_999 })).rejects.toThrow(/Document introuvable/)

    // Téléchargement : dans le périmètre oui, hors périmètre « introuvable » ; l'accès est journalisé.
    await expect(resolveDownload(manager.actor, inside!.id)).resolves.toMatchObject({ id: inside!.id })
    await expect(resolveDownload(manager.actor, outside!.id)).rejects.toThrow(/introuvable/)
    await expect(resolveDownload(agent, outside!.id)).resolves.toMatchObject({ id: outside!.id })
    const access = await db.select().from(logs).where(and(eq(logs.action, "document.download"), eq(logs.targetId, inside!.id)))
    expect(access[0]).toMatchObject({ actorId: manager.id, actorRole: "account_manager", holderId: mine.holderId })

    // Après retrait de l'attribution : plus rien.
    await callerFor(admin).admin.managers.unassign({ managerId: manager.id, walletType: "PERSONAL", holderId: mine.holderId })
    expect(await callerFor(manager.actor).admin.documents.list()).toEqual([])
    await expect(callerFor(manager.actor).admin.documents.get({ id: inside!.id })).rejects.toThrow(/Document introuvable/)

    // Cibles proposées à l'envoi.
    await callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: mine.holderId })
    expect((await callerFor(manager.actor).admin.documents.targets({ query: "" })).map((target) => target.holderId)).toEqual([mine.holderId])
    expect((await callerFor(admin).admin.documents.targets({ query: notMine.name })).some((target) => target.holderId === notMine.holderId)).toBe(true)
    await expect(callerFor(agent).admin.documents.targets({ query: "" })).rejects.toThrow(/Permission requise/)

    // Le support lit tout mais ne peut ni envoyer, ni valider, ni archiver.
    expect((await callerFor(agent).admin.documents.list({ search: notMine.suffix })).some((row) => row.id === outside!.id)).toBe(true)
    await expect(callerFor(agent).admin.documents.setStatus({ id: outside!.id, status: "archived", reason: "Tentative du support" })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(manager.actor).admin.documents.setStatus({ id: inside!.id, status: "archived", reason: "Tentative du gestionnaire" })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(manager.actor).admin.documents.review({ id: inside!.id, decision: "validated" })).rejects.toThrow(/Permission requise/)
  })
})

describe("admin.documents — justificatifs remis par les titulaires", () => {
  it("à examiner → validé ou refusé (motif obligatoire), une seule décision, titulaire notifié, tout journalisé", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const holder = await personal(admin)
    const submit = async (title: string) => {
      const key = `media/users/${holder.holderId}/transfer-proof/${randomUUID()}.pdf`
      await putPrivateObject(key, pdfBytes(), "application/pdf")
      await callerFor(holder.actor).documents.submitTransferProof({ title, fileName: "preuve.pdf", mimeType: "application/pdf", storageKey: key, sizeBytes: 100, transactionReference: `REF-${randomUUID().slice(0, 6)}` })
      return (await callerFor(admin).admin.documents.list({ search: title })).find((row) => row.title === title)!
    }

    const first = await submit(`Preuve A ${holder.suffix}`)
    expect(first).toMatchObject({ category: "transfer_proof", source: "user", reviewStatus: "pending", holder: { name: holder.name }, recipient: { id: holder.holderId } })
    expect((await callerFor(admin).admin.documents.list({ review: "pending", search: holder.suffix })).map((row) => row.id)).toContain(first.id)

    await expect(callerFor(admin).admin.documents.review({ id: first.id, decision: "rejected" })).rejects.toThrow(/justifié/)
    await expect(callerFor(admin).admin.documents.review({ id: first.id, decision: "rejected", reason: "court" })).rejects.toThrow(/justifié/)
    await expect(callerFor(agent).admin.documents.review({ id: first.id, decision: "validated" })).rejects.toThrow(/Permission requise/)
    const validated = await callerFor(admin).admin.documents.review({ id: first.id, decision: "validated" })
    expect(validated).toMatchObject({ reviewStatus: "validated", reviewedBy: expect.any(String) })
    await expect(callerFor(admin).admin.documents.review({ id: first.id, decision: "rejected", reason: "Décision déjà prise ailleurs" })).rejects.toThrow(/déjà été examiné/)

    const second = await submit(`Preuve B ${holder.suffix}`)
    const rejected = await callerFor(admin).admin.documents.review({ id: second.id, decision: "rejected", reason: "Le montant n'est pas lisible sur la capture." })
    expect(rejected).toMatchObject({ reviewStatus: "rejected", reviewReason: "Le montant n'est pas lisible sur la capture." })
    expect((await callerFor(holder.actor).documents.listMine()).find((row) => row.id === second.id)).toMatchObject({ reviewStatus: "rejected", reviewReason: "Le montant n'est pas lisible sur la capture." })
    const told = await db.select().from(notifications).where(and(eq(notifications.targetUserId, holder.holderId), inArray(notifications.title, ["Justificatif validé", "Justificatif refusé"])))
    expect(told.map((item) => item.title).sort()).toEqual(["Justificatif refusé", "Justificatif validé"])

    // Deux administrateurs qui décident en même temps : une seule décision, une seule notification.
    const third = await submit(`Preuve C ${holder.suffix}`)
    const other = await makeStaff("admin")
    const race = await Promise.allSettled([
      callerFor(admin).admin.documents.review({ id: third.id, decision: "validated" }),
      callerFor(other, "10.8.0.2").admin.documents.review({ id: third.id, decision: "rejected", reason: "Décision concurrente refusée" }),
    ])
    expect(race.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(race.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)
    expect((await db.select().from(logs).where(and(inArray(logs.action, ["document.validate", "document.reject"]), eq(logs.targetId, third.id)))).length).toBe(1)

    // Un document envoyé par l'administration n'a rien à valider.
    const sent = await callerFor(admin).admin.documents.send({ storageKey: (await upload(admin)).storageKey, fileName: "avis.pdf", title: "Avis d'information", category: "notice", wallets: [{ walletType: "PERSONAL", holderId: holder.holderId }] })
    const [sentRow] = await db.select().from(documents).where(eq(documents.batchId, sent.batchId))
    await expect(callerFor(admin).admin.documents.review({ id: sentRow!.id, decision: "validated" })).rejects.toThrow(/n'a pas à être validé/)

    const trail = await db.select().from(logs).where(and(inArray(logs.action, ["document.validate", "document.reject"]), inArray(logs.targetId, [first.id, second.id])))
    expect(trail.map((entry) => entry.action).sort()).toEqual(["document.reject", "document.validate"])
    expect(trail.every((entry) => entry.actorId === admin.id && entry.walletType === "PERSONAL")).toBe(true)
  })
})

describe("admin.documents — archiver, retirer, restaurer", () => {
  it("motif obligatoire, transitions contrôlées, invisible du titulaire sitôt archivé, toujours consultable par l'administration, journal complet", async () => {
    const admin = await makeStaff("admin")
    const holder = await personal(admin)
    const sent = await callerFor(admin).admin.documents.send({ storageKey: (await upload(admin)).storageKey, fileName: "releve.pdf", title: `Relevé ${holder.suffix}`, category: "statement", wallets: [{ walletType: "PERSONAL", holderId: holder.holderId }] })
    const [row] = await db.select().from(documents).where(eq(documents.batchId, sent.batchId))
    const documentId = row!.id
    const setStatus = (status: "active" | "archived" | "revoked", reason = "Motif de test suffisant") => callerFor(admin).admin.documents.setStatus({ id: documentId, status, reason })

    await expect(setStatus("archived", "court")).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(setStatus("active")).rejects.toThrow(/déjà dans cet état/)

    expect((await setStatus("archived")).status).toBe("archived")
    expect((await callerFor(holder.actor).documents.listMine()).some((item) => item.id === documentId)).toBe(false)
    await expect(resolveDownload(holder.actor, documentId)).rejects.toThrow(/introuvable/)
    await expect(resolveDownload(admin, documentId)).resolves.toMatchObject({ id: documentId })
    expect((await callerFor(admin).admin.documents.list({ search: holder.suffix, status: "archived" })).map((item) => item.id)).toEqual([documentId])
    expect((await callerFor(admin).admin.documents.get({ id: documentId })).archivedAt).not.toBeNull()

    expect((await setStatus("active", "Archivé par erreur, on le rétablit")).status).toBe("active")
    expect((await callerFor(holder.actor).documents.listMine()).some((item) => item.id === documentId)).toBe(true)

    expect((await setStatus("revoked", "Document envoyé au mauvais titulaire")).status).toBe("revoked")
    await expect(setStatus("archived")).rejects.toThrow(/non autorisée/)
    expect((await callerFor(holder.actor).documents.listMine()).some((item) => item.id === documentId)).toBe(false)
    const told = await db.select().from(notifications).where(and(eq(notifications.targetUserId, holder.holderId), eq(notifications.title, "Document retiré")))
    expect(told).toHaveLength(1)

    const trail = (await db.select().from(logs).where(and(eq(logs.targetType, "document"), eq(logs.targetId, documentId)))).map((entry) => entry.action)
    expect(trail).toEqual(expect.arrayContaining(["document.send", "document.archive", "document.restore", "document.revoke", "document.download"]))
    const revoke = (await db.select().from(logs).where(and(eq(logs.action, "document.revoke"), eq(logs.targetId, documentId))))[0]!
    expect(detailOf(revoke)).toMatchObject({ from: "active", to: "revoked", reason: "Document envoyé au mauvais titulaire" })
    expect(revoke).toMatchObject({ actorId: admin.id, walletType: "PERSONAL", holderId: holder.holderId })
  })
})
