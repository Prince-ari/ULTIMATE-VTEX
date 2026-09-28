import { and, desc, eq, isNull, or, sql } from "drizzle-orm"

import type { Actor } from "../../auth/permissions"
import { NotFoundError, ValidationError, requireRole } from "../../auth/permissions"
import { can } from "../../auth/rbac"
import type { Db } from "../../db/client"
import { documentFiles, documents, users } from "../../db/schema"
import { isWalletAssigned } from "../managers/assignments"
import { assertPrivateObject } from "../media/objectStorage"
import { createNotification, createSystemNotification } from "../notifications/service"
import { logAction } from "../journal/service"
import { publishRealtime } from "../realtime/events"

/** Ce que voit un destinataire d'une remise : jamais la clé de l'objet stocké, jamais l'empreinte du fichier. */
const documentProjection = {
  id: documents.id,
  userId: documents.userId,
  title: documents.title,
  documentType: documents.documentType,
  fileName: documents.fileName,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  source: documents.source,
  status: documents.status,
  transactionReference: documents.transactionReference,
  note: documents.note,
  reviewStatus: documents.reviewStatus,
  reviewReason: documents.reviewReason,
  firstViewedAt: documents.firstViewedAt,
  walletType: documents.walletType,
  holderId: documents.holderId,
  createdAt: documents.createdAt,
}

function assertPrefix(actorId: number, key: string, kind: "documents" | "transfer-proof") {
  const prefix = kind === "documents" ? `media/admin/${actorId}/documents/` : `media/users/${actorId}/transfer-proof/`
  if (!key.startsWith(prefix)) throw new ValidationError("Cet objet média ne correspond pas à la session qui le téléverse.")
}

/** Liste les documents actifs du titulaire connecté (remises archivées ou retirées : invisibles). */
export async function listMine(db: Db, actor: Actor) {
  return db.select(documentProjection).from(documents).where(and(eq(documents.userId, actor.id), eq(documents.status, "active"))).orderBy(desc(documents.createdAt)).limit(100)
}

/** Liste de supervision historique (Dashboard v1). Le Dashboard actuel passe par `admin.documents.*`, qui borne aussi le périmètre d'un gestionnaire. */
export async function listAll(db: Db, actor: Actor) {
  requireRole(actor, "admin", "agent")
  return db.select(documentProjection).from(documents).orderBy(desc(documents.createdAt)).limit(2000)
}

export interface DownloadTarget {
  id: number
  fileName: string
  mimeType: string
  /** Objet privé à servir ; NULL pour un très ancien document qui n'a que son texte. */
  storageKey: string | null
  content: string | null
}

/**
 * Résout un document téléchargeable, sans jamais exposer un objet hors autorisation :
 *  - le destinataire télécharge ses remises ACTIVES (première consultation horodatée) ;
 *  - le personnel autorisé (`documents.read`) télécharge quel que soit l'état, un GESTIONNAIRE seulement pour les wallets de son portefeuille ;
 *  - tout autre cas répond « introuvable » (jamais « interdit » : on ne révèle pas l'existence d'un document).
 */
export async function resolveDownload(db: Db, actor: Actor, id: number): Promise<DownloadTarget> {
  const [document] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  if (!document) throw new NotFoundError("Document introuvable.")

  const isRecipient = document.userId === actor.id
  if (isRecipient) {
    if (document.status !== "active") throw new NotFoundError("Document introuvable.")
  } else {
    if (!can(actor, "documents.read")) throw new NotFoundError("Document introuvable.")
    if (actor.role === "account_manager") {
      const inScope = document.walletType !== null && document.holderId !== null && (await isWalletAssigned(db, actor.id, document.walletType, document.holderId))
      if (!inScope) throw new NotFoundError("Document introuvable.")
    }
  }

  let storageKey = document.storageKey
  if (!storageKey && document.fileId) {
    const [file] = await db.select({ storageKey: documentFiles.storageKey }).from(documentFiles).where(eq(documentFiles.id, document.fileId)).limit(1)
    storageKey = file?.storageKey ?? null
  }
  // Horloge de la base (comme `created_at`) : la première ouverture ne peut jamais sembler antérieure à l'envoi.
  if (isRecipient && !document.firstViewedAt) await db.update(documents).set({ firstViewedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(documents.id, id), isNull(documents.firstViewedAt)))
  await logAction(db, actor.id, "document.download", "document", id, { source: document.source, byRecipient: isRecipient, status: document.status }, document.walletType && document.holderId ? { walletType: document.walletType, holderId: document.holderId } : undefined)
  return { id: document.id, fileName: document.fileName, mimeType: document.mimeType, storageKey, content: document.content }
}

/** Historique : l'ancien nom reste disponible pour les appelants existants. */
export const getForDownload = resolveDownload

export async function getMine(db: Db, actor: Actor, id: number) {
  const [row] = await db.select(documentProjection).from(documents).where(and(eq(documents.id, id), eq(documents.userId, actor.id), eq(documents.status, "active"))).limit(1)
  if (!row) throw new NotFoundError("Document introuvable.")
  return row
}

/** Attribution d’un PDF privé à un utilisateur par un administrateur (voie historique, un destinataire). Voir `admin.documents.send` pour l'envoi multi-wallets. */
export async function assignPdf(db: Db, actor: Actor, input: { userId: number; title: string; fileName: string; storageKey: string; sizeBytes: number }) {
  requireRole(actor, "admin")
  assertPrefix(actor.id, input.storageKey, "documents")
  if (!input.title.trim() || input.title.length > 180) throw new ValidationError("Titre de document invalide.")
  if (!input.fileName.trim() || input.fileName.length > 180 || input.sizeBytes <= 0) throw new ValidationError("Métadonnées de document invalides.")
  await assertPrivateObject(input.storageKey)

  const [inserted] = await db.insert(documents).values({
    userId: input.userId,
    title: input.title.trim(),
    documentType: "account_document",
    fileName: input.fileName,
    mimeType: "application/pdf",
    content: null,
    storageKey: input.storageKey,
    sizeBytes: input.sizeBytes,
    source: "admin",
    status: "active",
    uploadedBy: actor.id,
    walletType: "PERSONAL",
    holderId: input.userId,
  })
  const documentId = inserted.insertId
  await logAction(db, actor.id, "document.assign", "document", documentId, { userId: input.userId, fileName: input.fileName, sizeBytes: input.sizeBytes }, { walletType: "PERSONAL", holderId: input.userId })
  await createNotification(db, actor, { targetUserId: input.userId, title: "Nouveau document disponible", body: `« ${input.title.trim()} » est disponible dans votre portefeuille.` })
  publishRealtime({ type: "document.assigned", targetUserId: input.userId, payload: { documentId, title: input.title.trim() } })
  return documentId
}

/** Remise sécurisée d’un justificatif de virement par le titulaire : à examiner par l'administration. */
export async function submitTransferProof(db: Db, actor: Actor, input: { title: string; fileName: string; mimeType: string; storageKey: string; sizeBytes: number; transactionReference?: string }) {
  assertPrefix(actor.id, input.storageKey, "transfer-proof")
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) throw new ValidationError("Format de justificatif refusé.")
  if (!input.title.trim() || input.title.length > 180 || !input.fileName.trim() || input.fileName.length > 180 || input.sizeBytes <= 0) throw new ValidationError("Justificatif invalide.")
  await assertPrivateObject(input.storageKey)

  const [inserted] = await db.insert(documents).values({
    userId: actor.id,
    title: input.title.trim(),
    documentType: "transfer_proof",
    fileName: input.fileName,
    mimeType: input.mimeType,
    content: null,
    storageKey: input.storageKey,
    sizeBytes: input.sizeBytes,
    source: "user",
    status: "active",
    uploadedBy: actor.id,
    transactionReference: input.transactionReference?.trim() || null,
    walletType: "PERSONAL",
    holderId: actor.id,
    reviewStatus: "pending",
  })
  const documentId = inserted.insertId
  await logAction(db, actor.id, "transfer_proof.submit", "document", documentId, { transactionReference: input.transactionReference ?? null, mimeType: input.mimeType, sizeBytes: input.sizeBytes }, { walletType: "PERSONAL", holderId: actor.id })
  const supervisors = await db.select({ id: users.id }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "agent")))
  await Promise.all(supervisors.map((supervisor) => createSystemNotification(db, {
    targetUserId: supervisor.id,
    createdBy: actor.id,
    title: "Justificatif de virement reçu",
    body: `Un titulaire a transmis « ${input.title.trim()} »${input.transactionReference?.trim() ? ` · Référence ${input.transactionReference.trim()}` : ""}.`,
  })))
  publishRealtime({ type: "transfer_proof.submitted", targetUserId: null, payload: { documentId, userId: actor.id, title: input.title.trim(), transactionReference: input.transactionReference ?? null } })
  return documentId
}

/** Retrait logique : l’objet reste privé et le lien disparaît des surfaces utilisateur. */
export async function revokeDocument(db: Db, actor: Actor, id: number) {
  requireRole(actor, "admin")
  const [document] = await db.select({ id: documents.id, userId: documents.userId, status: documents.status, walletType: documents.walletType, holderId: documents.holderId }).from(documents).where(eq(documents.id, id)).limit(1)
  if (!document) throw new NotFoundError("Document introuvable.")
  if (document.status === "revoked") return
  await db.update(documents).set({ status: "revoked" }).where(eq(documents.id, id))
  await logAction(db, actor.id, "document.revoke", "document", id, undefined, document.walletType && document.holderId ? { walletType: document.walletType, holderId: document.holderId } : undefined)
  await createNotification(db, actor, { targetUserId: document.userId, title: "Document retiré", body: "Un document a été retiré de votre portefeuille." })
}
