import { randomUUID } from "node:crypto"
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  assertAcceptedMedia,
  assertMediaSignature,
  checkRateLimit,
  createSystemNotification,
  db,
  documentFiles,
  documents,
  getPrivateObject,
  isWalletAssigned,
  listAssignments,
  logAction,
  logs,
  protectedProcedure,
  publishRealtime,
  requirePermission,
  router,
  safeFileName,
  sha256Hex,
  users,
  walletKey,
  type Actor,
  type Db,
} from "@vtex/core"
import { businesses } from "@vtex/business"
import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { likeContains } from "./sqlLike"

import { holderKey, loadHolders, recipientsOf, searchHolders, type HolderRef } from "./walletHolders"

/**
 * Documents (Dashboard → wallets).
 *
 *  - envoyer : `documents.send` — ADMIN et SUPER_ADMIN vers n'importe quel wallet ; GESTIONNAIRE DE COMPTE uniquement vers ses wallets attribués
 *    (vérifié pour CHAQUE wallet avant tout envoi : un refus annule l'ensemble) ;
 *  - lire : `documents.read` — SUPPORT et administrateurs voient tout, un gestionnaire seulement les documents de son portefeuille ;
 *  - valider / refuser une pièce remise par un titulaire : `documents.review` ; archiver / retirer / restaurer : `documents.archive` (motif obligatoire, journalisé) ;
 *  - le fichier est stocké UNE fois (objet privé, empreinte SHA-256, signature du contenu vérifiée côté serveur) et remis à chaque destinataire ;
 *  - AUCUNE clé d'objet ni URL de stockage ne sort de ce module : le téléchargement passe par `/api/media/documents/{id}` (session + droit + périmètre).
 */

export const DOCUMENT_CATEGORIES = ["statement", "receipt", "contract", "identity", "tax", "notice", "account_document", "rib", "other"] as const
const ALL_CATEGORIES = [...DOCUMENT_CATEGORIES, "transfer_proof"] as const
const STATUSES = ["active", "archived", "revoked"] as const
const REVIEWS = ["none", "pending", "validated", "rejected"] as const
const MAX_WALLETS_PER_SEND = 50
const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const id = z.number().int().positive()
const reasonSchema = z.string().trim().min(8, "Le motif doit contenir au moins huit caractères.").max(250)

const sendProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `documents:send:${ctx.actor.id}`, 20, 60_000)
  return next()
})
const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})

const fullName = (row: { firstName: string; lastName: string } | undefined | null) => (row ? `${row.firstName} ${row.lastName}`.trim() : "—")

/** Périmètre de lecture : `null` = tout ; sinon l'ensemble des wallets d'un gestionnaire (clés `PERSONAL:12`). */
async function readScope(actor: Actor): Promise<Set<string> | null> {
  requirePermission(actor, "documents.read")
  if (actor.role !== "account_manager") return null
  return new Set((await listAssignments(db, actor.id)).map((assignment) => walletKey(assignment.walletType, assignment.holderId)))
}

type DocRow = typeof documents.$inferSelect

async function presentRows(rows: DocRow[]) {
  const userIds = [...new Set(rows.flatMap((row) => [row.userId, row.uploadedBy, row.reviewedBy].filter((value): value is number => value !== null)))]
  const [people, holders] = await Promise.all([
    userIds.length ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    loadHolders(db, rows.filter((row) => row.walletType !== null && row.holderId !== null).map((row) => ({ walletType: row.walletType!, holderId: row.holderId! }))),
  ])
  return rows.map((row) => {
    const holder = row.walletType && row.holderId ? holders.get(holderKey({ walletType: row.walletType, holderId: row.holderId })) : undefined
    const uploader = people.find((person) => person.id === row.uploadedBy)
    const reviewer = people.find((person) => person.id === row.reviewedBy)
    return {
      id: row.id,
      title: row.title,
      category: row.documentType,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      source: row.source,
      status: row.status,
      reviewStatus: row.reviewStatus,
      reviewReason: row.reviewReason,
      reviewedAt: row.reviewedAt,
      reviewedBy: reviewer ? fullName(reviewer) : null,
      note: row.note,
      transactionReference: row.transactionReference,
      batchId: row.batchId,
      walletType: row.walletType,
      holderId: row.holderId,
      holder: holder ? { name: holder.name, subtitle: holder.subtitle } : null,
      recipient: { id: row.userId, name: fullName(people.find((person) => person.id === row.userId)) },
      sender: uploader ? { id: uploader.id, name: fullName(uploader), role: uploader.role } : null,
      firstViewedAt: row.firstViewedAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
    }
  })
}

export async function listDocuments(actor: Actor, input: { search?: string; category?: (typeof ALL_CATEGORIES)[number]; status?: (typeof STATUSES)[number]; review?: (typeof REVIEWS)[number]; walletType?: "PERSONAL" | "PROFESSIONAL"; limit?: number } = {}) {
  const scope = await readScope(actor)
  // Périmètre d'un gestionnaire : poussé dans la requête (et non filtré après coup) pour ne jamais être tronqué par la limite de lignes.
  const scoped = scope
    ? or(...(["PERSONAL", "PROFESSIONAL"] as const).flatMap((walletType) => {
        const ids = [...scope].filter((key) => key.startsWith(`${walletType}:`)).map((key) => Number(key.split(":")[1]))
        return ids.length ? [and(eq(documents.walletType, walletType), inArray(documents.holderId, ids))] : []
      }))
    : undefined
  if (scope && scope.size === 0) return []

  // Recherche : tous les mots doivent se retrouver (titre, fichier, note, référence, ou nom du destinataire / expéditeur / titulaire).
  const tokens = input.search?.trim().split(/\s+/).filter(Boolean).map(likeContains) ?? []
  let searched: SQL | undefined
  if (tokens.length > 0) {
    const people = await db.select({ id: users.id }).from(users).where(and(...tokens.map((term) => or(like(users.firstName, term), like(users.lastName, term), like(users.email, term))))).limit(200)
    const companies = await db.select({ id: businesses.id }).from(businesses).where(and(...tokens.map((term) => or(like(businesses.brandName, term), like(businesses.legalName, term))))).limit(200)
    const personIds = people.map((person) => person.id)
    const companyIds = companies.map((company) => company.id)
    searched = or(
      and(...tokens.map((term) => or(like(documents.title, term), like(documents.fileName, term), like(documents.note, term), like(documents.transactionReference, term)))),
      personIds.length ? inArray(documents.userId, personIds) : undefined,
      personIds.length ? inArray(documents.uploadedBy, personIds) : undefined,
      companyIds.length ? and(eq(documents.walletType, "PROFESSIONAL"), inArray(documents.holderId, companyIds)) : undefined,
    )
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(
      scoped,
      searched,
      input.category ? eq(documents.documentType, input.category) : undefined,
      input.status ? eq(documents.status, input.status) : undefined,
      input.review ? eq(documents.reviewStatus, input.review) : undefined,
      input.walletType ? eq(documents.walletType, input.walletType) : undefined,
    ))
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(Math.min(Math.max(input.limit ?? 500, 1), 1000))
  return presentRows(rows)
}

export async function getDocumentDetail(actor: Actor, documentId: number) {
  const scope = await readScope(actor)
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  // Hors périmètre : « introuvable », jamais « interdit ».
  if (!row || (scope && !(row.walletType !== null && row.holderId !== null && scope.has(walletKey(row.walletType, row.holderId))))) throw new NotFoundError("Document introuvable.")
  const [presented] = await presentRows([row])
  const [file] = row.fileId ? await db.select({ sha256: documentFiles.sha256 }).from(documentFiles).where(eq(documentFiles.id, row.fileId)).limit(1) : []
  const siblings = row.batchId ? await db.select({ id: documents.id }).from(documents).where(eq(documents.batchId, row.batchId)) : []
  const history = actor.role === "account_manager"
    ? null
    : await db.select().from(logs).where(and(eq(logs.targetType, "document"), eq(logs.targetId, documentId))).orderBy(desc(logs.createdAt)).limit(50)
  const actors = history?.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, [...new Set(history.map((entry) => entry.actorId).filter((value): value is number => value !== null))])) : []
  return {
    ...presented,
    sha256: file?.sha256 ?? null,
    batchSize: siblings.length,
    history: history?.map((entry) => ({ id: entry.id, action: entry.action, actorName: entry.actorId ? fullName(actors.find((person) => person.id === entry.actorId)) : null, actorRole: entry.actorRole, createdAt: entry.createdAt, detail: entry.detail as Record<string, unknown> | null })) ?? null,
  }
}

const sendInput = z.object({
  storageKey: z.string().min(1).max(512),
  fileName: z.string().min(1).max(180),
  title: z.string().trim().min(2, "Donnez un titre au document.").max(180),
  category: z.enum(DOCUMENT_CATEGORIES),
  note: z.string().trim().max(500).optional(),
  wallets: z.array(z.object({ walletType: walletTypeSchema, holderId: id })).min(1, "Choisissez au moins un wallet.").max(MAX_WALLETS_PER_SEND, `Au plus ${MAX_WALLETS_PER_SEND} wallets par envoi.`),
})

/**
 * Envoi d'un document déjà téléversé (`/api/media/upload`, usage `admin-document`) à un ou plusieurs wallets.
 * Le contenu est relu et re-vérifié ICI (type, signature, taille, empreinte) : on ne se fie pas au client ni à la seule route de téléversement.
 */
export async function sendDocuments(actor: Actor, input: z.infer<typeof sendInput>) {
  requirePermission(actor, "documents.send")
  if (!input.storageKey.startsWith(`media/admin/${actor.id}/documents/`)) throw new ValidationError("Cet objet média ne correspond pas à la session qui le téléverse.")
  const unique = [...new Map(input.wallets.map((wallet) => [holderKey(wallet), wallet])).values()]

  const holders = await loadHolders(db, unique)
  for (const wallet of unique) if (!holders.get(holderKey(wallet))) throw new NotFoundError("Un des wallets choisis est introuvable.")
  if (actor.role === "account_manager") {
    for (const wallet of unique) {
      if (!(await isWalletAssigned(db, actor.id, wallet.walletType, wallet.holderId))) throw new ForbiddenError(`Le wallet « ${holders.get(holderKey(wallet))!.name} » ne fait pas partie de votre portefeuille.`)
    }
  }

  let object: Awaited<ReturnType<typeof getPrivateObject>>
  try { object = await getPrivateObject(input.storageKey) } catch { throw new ValidationError("Fichier introuvable : importez-le de nouveau.") }
  const fileName = safeFileName(input.fileName)
  assertAcceptedMedia(fileName || "document", object.contentType, object.bytes.byteLength)
  assertMediaSignature(object.bytes, object.contentType)
  const sha256 = sha256Hex(object.bytes)

  const batchId = randomUUID()
  const skipped: Array<{ walletType: HolderRef["walletType"]; holderId: number; name: string; reason: string }> = []
  const result = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const [existing] = await executor.select().from(documentFiles).where(eq(documentFiles.storageKey, input.storageKey)).limit(1)
    if (existing && existing.uploadedBy !== actor.id) throw new ForbiddenError("Ce fichier appartient à un autre envoi.")
    let fileId = existing?.id
    if (!fileId) {
      const [inserted] = await executor.insert(documentFiles).values({ storageKey: input.storageKey, fileName, mimeType: object.contentType, sizeBytes: object.bytes.byteLength, sha256, uploadedBy: actor.id })
      fileId = inserted.insertId
    }
    const documentIds: number[] = []
    let reached = 0
    for (const wallet of unique) {
      const holder = holders.get(holderKey(wallet))!
      const recipients = await recipientsOf(executor, wallet)
      if (recipients.length === 0) { skipped.push({ ...wallet, name: holder.name, reason: "Aucun destinataire actif" }); continue }
      const walletDocumentIds: number[] = []
      for (const recipient of recipients) {
        const [row] = await executor.insert(documents).values({
          userId: recipient.userId, title: input.title, documentType: input.category, fileName, mimeType: object.contentType, content: null, storageKey: null, sizeBytes: object.bytes.byteLength,
          source: "admin", status: "active", uploadedBy: actor.id, fileId, walletType: wallet.walletType, holderId: wallet.holderId, batchId, note: input.note ?? null, reviewStatus: "none",
        })
        walletDocumentIds.push(row.insertId)
        await createSystemNotification(executor, { targetUserId: recipient.userId, createdBy: actor.id, title: "Nouveau document disponible", body: `« ${input.title} » est disponible dans vos documents.` })
      }
      documentIds.push(...walletDocumentIds)
      reached += 1
      await logAction(executor, actor.id, "document.send", "document", walletDocumentIds[0]!, { title: input.title, category: input.category, fileId, sha256, recipients: recipients.length, documentIds: walletDocumentIds, batchId }, wallet)
    }
    return { documentIds, reached, fileId }
  })
  for (const documentId of result.documentIds) publishRealtime({ type: "document.assigned", targetUserId: null, payload: { documentId, title: input.title } })
  return { sent: result.documentIds.length, wallets: result.reached, skipped, batchId, fileId: result.fileId }
}

export async function reviewDocument(actor: Actor, input: { id: number; decision: "validated" | "rejected"; reason?: string }) {
  requirePermission(actor, "documents.review")
  if (input.decision === "rejected" && (input.reason?.trim().length ?? 0) < 8) throw new ValidationError("Un refus doit être justifié (8 caractères minimum).")
  const [row] = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1)
  if (!row) throw new NotFoundError("Document introuvable.")
  if (row.reviewStatus !== "pending") throw new ValidationError(row.reviewStatus === "none" ? "Ce document n'a pas à être validé : il vient de l'administration." : "Ce document a déjà été examiné.")
  const reason = input.reason?.trim() || null
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    // Compare-and-swap : deux administrateurs qui décident en même temps ne produisent qu'UNE décision (l'autre est refusé), pas deux notifications.
    const [written] = await executor.update(documents).set({ reviewStatus: input.decision, reviewedBy: actor.id, reviewedAt: sql`CURRENT_TIMESTAMP`, reviewReason: reason }).where(and(eq(documents.id, row.id), eq(documents.reviewStatus, "pending")))
    if (written.affectedRows !== 1) throw new ValidationError("Ce document a déjà été examiné.")
    await logAction(executor, actor.id, input.decision === "validated" ? "document.validate" : "document.reject", "document", row.id, { reason, title: row.title }, row.walletType && row.holderId ? { walletType: row.walletType, holderId: row.holderId } : undefined)
    await createSystemNotification(executor, { targetUserId: row.userId, createdBy: actor.id, title: input.decision === "validated" ? "Justificatif validé" : "Justificatif refusé", body: input.decision === "validated" ? `« ${row.title} » a été validé.` : `« ${row.title} » a été refusé : ${reason}` })
  })
  return getDocumentDetail(actor, row.id)
}

const TRANSITIONS: Record<(typeof STATUSES)[number], Array<(typeof STATUSES)[number]>> = { active: ["archived", "revoked"], archived: ["active", "revoked"], revoked: ["active"] }

export async function setDocumentStatus(actor: Actor, input: { id: number; status: (typeof STATUSES)[number]; reason: string }) {
  requirePermission(actor, "documents.archive")
  const [row] = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1)
  if (!row) throw new NotFoundError("Document introuvable.")
  if (row.status === input.status) throw new ValidationError("Ce document est déjà dans cet état.")
  if (!TRANSITIONS[row.status].includes(input.status)) throw new ValidationError(`Transition « ${row.status} » → « ${input.status} » non autorisée.`)
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const [written] = await executor.update(documents).set({ status: input.status, archivedAt: input.status === "archived" ? sql`CURRENT_TIMESTAMP` : null }).where(and(eq(documents.id, row.id), eq(documents.status, row.status)))
    if (written.affectedRows !== 1) throw new ValidationError("Ce document vient d'être modifié : actualisez la page.")
    const action = input.status === "archived" ? "document.archive" : input.status === "revoked" ? "document.revoke" : "document.restore"
    await logAction(executor, actor.id, action, "document", row.id, { from: row.status, to: input.status, reason: input.reason, title: row.title }, row.walletType && row.holderId ? { walletType: row.walletType, holderId: row.holderId } : undefined)
    if (input.status === "revoked") await createSystemNotification(executor, { targetUserId: row.userId, createdBy: actor.id, title: "Document retiré", body: `« ${row.title} » a été retiré de vos documents.` })
  })
  return getDocumentDetail(actor, row.id)
}

/** Wallets vers lesquels l'appelant peut envoyer un document : tous pour un administrateur, son portefeuille pour un gestionnaire. */
export async function documentTargets(actor: Actor, query: string) {
  requirePermission(actor, "documents.send")
  if (actor.role !== "account_manager") return searchHolders(query)
  const assigned = await listAssignments(db, actor.id)
  const holders = await loadHolders(db, assigned)
  const needle = query.trim().toLowerCase()
  return assigned
    .map((assignment) => holders.get(holderKey(assignment)))
    .filter((holder): holder is NonNullable<typeof holder> => Boolean(holder))
    .filter((holder) => !needle || `${holder.name} ${holder.subtitle ?? ""}`.toLowerCase().includes(needle))
}

export const adminDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(100).optional(), category: z.enum(ALL_CATEGORIES).optional(), status: z.enum(STATUSES).optional(), review: z.enum(REVIEWS).optional(), walletType: walletTypeSchema.optional(), limit: z.number().int().min(1).max(1000).optional() }).optional())
    .query(({ ctx, input }) => listDocuments(ctx.actor, input ?? {})),
  get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => getDocumentDetail(ctx.actor, input.id)),
  send: sendProcedure.input(sendInput).mutation(({ ctx, input }) => sendDocuments(ctx.actor, input)),
  review: writeProcedure
    .input(z.object({ id, decision: z.enum(["validated", "rejected"]), reason: z.string().trim().max(250).optional() }))
    .mutation(({ ctx, input }) => reviewDocument(ctx.actor, input)),
  setStatus: writeProcedure
    .input(z.object({ id, status: z.enum(STATUSES), reason: reasonSchema }))
    .mutation(({ ctx, input }) => setDocumentStatus(ctx.actor, input)),
  targets: protectedProcedure.input(z.object({ query: z.string().max(100).default("") })).query(({ ctx, input }) => documentTargets(ctx.actor, input.query)),
})
