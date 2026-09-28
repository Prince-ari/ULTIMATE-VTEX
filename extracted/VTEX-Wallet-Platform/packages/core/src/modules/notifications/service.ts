import { and, desc, eq, isNull, or } from "drizzle-orm"

import type { Db } from "../../db/client"
import { notifications, notificationReads, users, type WalletType } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole, ValidationError } from "../../auth/permissions"
import { publishRealtime } from "../realtime/events"

type NotificationContent = { targetUserId: number | null; title: string; body: string }

function assertNotificationContent(input: NotificationContent) {
  if (input.title.trim().length === 0 || input.title.length > 120) {
    throw new ValidationError("Titre invalide (1 à 120 caractères).")
  }
  if (input.body.trim().length === 0 || input.body.length > 500) {
    throw new ValidationError("Message invalide (1 à 500 caractères).")
  }
}

/** Notification persistante créée par un service métier interne, sans pouvoir être exposée aux clients. */
export async function createSystemNotification(db: Db, input: NotificationContent & { createdBy: number }) {
  assertNotificationContent(input)
  const [inserted] = await db.insert(notifications).values({
    targetUserId: input.targetUserId,
    title: input.title.trim(),
    body: input.body.trim(),
    status: "sent",
    scheduledAt: null,
    sentAt: new Date(),
    createdBy: input.createdBy,
  })
  const notificationId = inserted.insertId
  publishRealtime({ type: "notification.created", targetUserId: input.targetUserId, payload: { notificationId, title: input.title.trim() } })
  return notificationId
}

/**
 * Suggestions : un message d'un membre de l'équipe à propos d'UN wallet, remis à chacun de ses destinataires (une ligne par destinataire,
 * donc un état « lu » par personne). Aucune vérification de droit ici : l'appelant a déjà contrôlé la permission ET le périmètre
 * (un gestionnaire n'écrit qu'aux wallets qui lui sont attribués).
 */
export async function insertSuggestions(
  db: Db,
  input: { senderId: number; walletType: WalletType; holderId: number; targetUserIds: number[]; title: string; body: string },
): Promise<number[]> {
  assertNotificationContent({ targetUserId: input.targetUserIds[0] ?? null, title: input.title, body: input.body })
  const ids: number[] = []
  for (const targetUserId of input.targetUserIds) {
    const [inserted] = await db.insert(notifications).values({
      targetUserId,
      title: input.title.trim(),
      body: input.body.trim(),
      status: "sent",
      kind: "suggestion",
      walletType: input.walletType,
      holderId: input.holderId,
      scheduledAt: null,
      sentAt: new Date(),
      createdBy: input.senderId,
    })
    ids.push(inserted.insertId)
    publishRealtime({ type: "notification.created", targetUserId, payload: { notificationId: inserted.insertId, title: input.title.trim() } })
  }
  return ids
}

/** notifications.create — admin (diffusion ou ciblée) ou agent (ciblée uniquement, Sprint 0 §2). */
export async function createNotification(
  db: Db,
  actor: Actor,
  input: { targetUserId: number | null; title: string; body: string; scheduledAt?: Date },
) {
  requireRole(actor, "admin", "agent")
  if (actor.role === "agent" && input.targetUserId === null) {
    throw new ValidationError("Un agent ne peut envoyer qu'à un utilisateur ciblé, jamais une diffusion à tous.")
  }
  assertNotificationContent(input)

  const isScheduled = !!input.scheduledAt && input.scheduledAt.getTime() > Date.now()
  if (!isScheduled) return createSystemNotification(db, { targetUserId: input.targetUserId, title: input.title, body: input.body, createdBy: actor.id })
  const [inserted] = await db.insert(notifications).values({
    targetUserId: input.targetUserId,
    title: input.title,
    body: input.body,
    status: isScheduled ? "scheduled" : "sent",
    scheduledAt: isScheduled ? input.scheduledAt : null,
    sentAt: isScheduled ? null : new Date(),
    createdBy: actor.id,
  })
  const notificationId = inserted.insertId
  return notificationId
}

/** notifications.list — admin/agent : diffusions et messages système ; les suggestions ont leur propre écran. */
export async function listNotifications(db: Db, actor: Actor) {
  requireRole(actor, "admin", "agent")
  return db.select().from(notifications).where(eq(notifications.kind, "notification")).orderBy(desc(notifications.createdAt)).limit(2000)
}

/**
 * notifications.listMine — diffusions à tous + celles ciblées sur l'utilisateur connecté (suggestions comprises).
 * Une suggestion porte le prénom et le rôle de son auteur — jamais son e-mail ni son identifiant.
 */
export async function listMyNotifications(db: Db, actor: Actor) {
  const visible = await db
    .select({ notification: notifications, senderFirstName: users.firstName, senderRole: users.role })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.createdBy))
    .where(or(isNull(notifications.targetUserId), eq(notifications.targetUserId, actor.id)))
    .orderBy(desc(notifications.createdAt))

  const readRows = await db
    .select()
    .from(notificationReads)
    .where(eq(notificationReads.userId, actor.id))
  const readIds = new Set(readRows.map((r) => r.notificationId))

  return visible.map(({ notification: n, senderFirstName, senderRole }) => ({
    ...n,
    isRead: readIds.has(n.id),
    sender: n.kind === "suggestion" && senderFirstName ? { firstName: senderFirstName, role: senderRole } : null,
  }))
}

/** notifications.unreadCount — appelé au polling léger (Sprint 4 §9). */
export async function unreadCount(db: Db, actor: Actor): Promise<number> {
  const mine = await listMyNotifications(db, actor)
  return mine.filter((n) => !n.isRead).length
}

/** notifications.markRead — seule une notification VISIBLE de l'utilisateur peut être marquée lue (jamais celle d'autrui). */
export async function markRead(db: Db, actor: Actor, notificationId: number) {
  const [target] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), or(isNull(notifications.targetUserId), eq(notifications.targetUserId, actor.id))))
    .limit(1)
  if (!target) return // introuvable ou destinée à quelqu'un d'autre : rien à faire (pas d'oracle d'existence)
  const existing = await db
    .select()
    .from(notificationReads)
    .where(and(eq(notificationReads.notificationId, notificationId), eq(notificationReads.userId, actor.id)))
    .limit(1)
  if (existing.length > 0) return // déjà lu, idempotent
  await db.insert(notificationReads).values({ notificationId, userId: actor.id })
}

/** notifications.markAllRead */
export async function markAllRead(db: Db, actor: Actor) {
  const mine = await listMyNotifications(db, actor)
  for (const n of mine.filter((x) => !x.isRead)) {
    await markRead(db, actor, n.id)
  }
}
