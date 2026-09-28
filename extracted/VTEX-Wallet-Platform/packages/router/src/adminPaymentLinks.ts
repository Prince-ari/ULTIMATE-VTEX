import {
  NotFoundError,
  ValidationError,
  checkRateLimit,
  db,
  logAction,
  protectedProcedure,
  requirePermission,
  router,
  users,
  type Actor,
} from "@vtex/core"
import {
  businessWalletAccounts,
  businesses,
  paymentLinkEvents,
  paymentLinkPayments,
  paymentLinks,
  reconcilePaymentLinkPayment,
  refundPaymentLinkPayment,
} from "@vtex/business"
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm"
import { z } from "zod"

import { likeContains } from "./sqlLike"

/**
 * Liens de paiement (Dashboard) — supervision transverse des liens créés dans Wallet Pro et des paiements reçus.
 *
 *  - lecture : `paymentlinks.read` (SUPPORT compris) ; jamais d'adresse IP du payeur ni d'identifiant d'intention chez le prestataire ;
 *  - désactiver / réactiver un lien, revérifier ou rembourser un paiement : `paymentlinks.manage` (ADMIN), avec un motif, journalisé
 *    sur la société concernée (`walletType = PROFESSIONAL`, `holderId = société`) ;
 *  - le crédit du compte n'a lieu qu'après règlement vérifié auprès du prestataire : ce module ne crédite jamais un paiement lui-même.
 */

const id = z.number().int().positive()
const reasonSchema = z.string().trim().min(8, "Le motif doit contenir au moins huit caractères.").max(250)
const LINK_STATUS = ["active", "expired", "draft", "disabled"] as const
const PAYMENT_STATUS = ["pending", "requires_action", "processing", "succeeded", "failed", "canceled", "refunded"] as const

const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})
const moneyProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:money:${ctx.actor.id}:${ctx.ip}`, 10, 60_000)
  return next()
})

const fullName = (row: { firstName: string | null; lastName: string | null }) => `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim()

type LinkRow = typeof paymentLinks.$inferSelect

/** Statut affiché : un lien actif dont la date d'expiration est passée est expiré, même si l'écriture n'a pas encore eu lieu. */
function effectiveStatus(link: Pick<LinkRow, "status" | "expiresAt">) {
  return link.status === "active" && link.expiresAt && link.expiresAt.getTime() < Date.now() ? ("expired" as const) : link.status
}

async function statsFor(linkIds: number[]) {
  const stats = new Map<number, { visits: number; paid: number; revenueCents: number }>()
  if (linkIds.length === 0) return stats
  const rows = await db
    .select({ paymentLinkId: paymentLinkEvents.paymentLinkId, kind: paymentLinkEvents.kind, count: sql<number>`count(*)`, revenue: sql<number>`coalesce(sum(${paymentLinkEvents.amountCents}), 0)` })
    .from(paymentLinkEvents)
    .where(inArray(paymentLinkEvents.paymentLinkId, linkIds))
    .groupBy(paymentLinkEvents.paymentLinkId, paymentLinkEvents.kind)
  for (const row of rows) {
    const entry = stats.get(row.paymentLinkId) ?? { visits: 0, paid: 0, revenueCents: 0 }
    if (row.kind === "visit") entry.visits = Number(row.count)
    else { entry.paid = Number(row.count); entry.revenueCents = Number(row.revenue) }
    stats.set(row.paymentLinkId, entry)
  }
  return stats
}

const publicPathOf = (slug: string) => `/pay/${slug}`

export async function listPaymentLinksAdmin(actor: Actor, input: { search?: string; status?: (typeof LINK_STATUS)[number]; businessId?: number } = {}) {
  requirePermission(actor, "paymentlinks.read")
  const term = input.search?.trim() ? likeContains(input.search) : null
  const rows = await db
    .select({ link: paymentLinks, business: { id: businesses.id, brandName: businesses.brandName }, creator: { firstName: users.firstName, lastName: users.lastName }, target: { id: businessWalletAccounts.id, label: businessWalletAccounts.label, currency: businessWalletAccounts.currency } })
    .from(paymentLinks)
    .innerJoin(businesses, eq(businesses.id, paymentLinks.businessId))
    .leftJoin(users, eq(users.id, paymentLinks.createdBy))
    .leftJoin(businessWalletAccounts, eq(businessWalletAccounts.id, paymentLinks.targetAccountId))
    .where(and(
      input.businessId ? eq(paymentLinks.businessId, input.businessId) : undefined,
      term ? or(like(paymentLinks.name, term), like(paymentLinks.slug, term), like(businesses.brandName, term)) : undefined,
    ))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(500)
  const stats = await statsFor(rows.map(({ link }) => link.id))
  const lastPayments = rows.length
    ? await db.select({ paymentLinkId: paymentLinkPayments.paymentLinkId, at: sql<Date>`max(${paymentLinkPayments.creditedAt})` }).from(paymentLinkPayments).where(inArray(paymentLinkPayments.paymentLinkId, rows.map(({ link }) => link.id))).groupBy(paymentLinkPayments.paymentLinkId)
    : []
  const list = rows.map(({ link, business, creator, target }) => {
    const numbers = stats.get(link.id) ?? { visits: 0, paid: 0, revenueCents: 0 }
    return {
      id: link.id,
      slug: link.slug,
      publicPath: publicPathOf(link.slug),
      name: link.name,
      description: link.description,
      amountCents: link.amountCents,
      currency: link.currency,
      mode: link.mode,
      status: effectiveStatus(link),
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      business,
      createdBy: creator ? fullName(creator) : "—",
      target: target?.id ? { id: target.id, label: target.label, currency: target.currency } : null,
      visits: numbers.visits,
      paid: numbers.paid,
      revenueCents: numbers.revenueCents,
      lastPaymentAt: lastPayments.find((entry) => entry.paymentLinkId === link.id)?.at ?? null,
    }
  })
  return input.status ? list.filter((link) => link.status === input.status) : list
}

function presentPayment(row: typeof paymentLinkPayments.$inferSelect) {
  // Jamais l'adresse IP du payeur ni l'identifiant d'intention : ce sont des données du prestataire de paiement.
  return {
    reference: row.reference,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    payerName: row.payerName,
    payerEmail: row.payerEmail,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    mode: row.stripeMode,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    creditedAt: row.creditedAt,
    createdAt: row.createdAt,
  }
}

export async function getPaymentLinkAdmin(actor: Actor, linkId: number) {
  requirePermission(actor, "paymentlinks.read")
  const [row] = await db
    .select({ link: paymentLinks, business: { id: businesses.id, brandName: businesses.brandName, legalName: businesses.legalName }, creator: { firstName: users.firstName, lastName: users.lastName }, target: { id: businessWalletAccounts.id, label: businessWalletAccounts.label, currency: businessWalletAccounts.currency } })
    .from(paymentLinks)
    .innerJoin(businesses, eq(businesses.id, paymentLinks.businessId))
    .leftJoin(users, eq(users.id, paymentLinks.createdBy))
    .leftJoin(businessWalletAccounts, eq(businessWalletAccounts.id, paymentLinks.targetAccountId))
    .where(eq(paymentLinks.id, linkId))
    .limit(1)
  if (!row) throw new NotFoundError("Lien de paiement introuvable.")
  const [stats, payments] = await Promise.all([
    statsFor([linkId]),
    db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.paymentLinkId, linkId)).orderBy(desc(paymentLinkPayments.createdAt)).limit(50),
  ])
  const numbers = stats.get(linkId) ?? { visits: 0, paid: 0, revenueCents: 0 }
  return {
    id: row.link.id,
    slug: row.link.slug,
    publicPath: publicPathOf(row.link.slug),
    name: row.link.name,
    description: row.link.description,
    amountCents: row.link.amountCents,
    currency: row.link.currency,
    mode: row.link.mode,
    status: effectiveStatus(row.link),
    storedStatus: row.link.status,
    expiresAt: row.link.expiresAt,
    createdAt: row.link.createdAt,
    updatedAt: row.link.updatedAt,
    business: row.business,
    createdBy: row.creator ? fullName(row.creator) : "—",
    target: row.target?.id ? { id: row.target.id, label: row.target.label, currency: row.target.currency } : null,
    visits: numbers.visits,
    paid: numbers.paid,
    revenueCents: numbers.revenueCents,
    payments: payments.map(presentPayment),
  }
}

export async function listPaymentsAdmin(actor: Actor, input: { status?: (typeof PAYMENT_STATUS)[number]; search?: string; limit?: number } = {}) {
  requirePermission(actor, "paymentlinks.read")
  const term = input.search?.trim() ? likeContains(input.search) : null
  const rows = await db
    .select({ payment: paymentLinkPayments, link: { id: paymentLinks.id, name: paymentLinks.name }, business: { id: businesses.id, brandName: businesses.brandName } })
    .from(paymentLinkPayments)
    .innerJoin(paymentLinks, eq(paymentLinks.id, paymentLinkPayments.paymentLinkId))
    .innerJoin(businesses, eq(businesses.id, paymentLinkPayments.businessId))
    .where(and(
      input.status ? eq(paymentLinkPayments.status, input.status) : undefined,
      term ? or(like(paymentLinkPayments.reference, term), like(paymentLinkPayments.payerName, term), like(paymentLinkPayments.payerEmail, term), like(paymentLinks.name, term), like(businesses.brandName, term)) : undefined,
    ))
    .orderBy(desc(paymentLinkPayments.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 300))
  return rows.map(({ payment, link, business }) => ({ ...presentPayment(payment), link, business }))
}

export async function setPaymentLinkStatusAdmin(actor: Actor, input: { id: number; status: "active" | "disabled"; reason: string }) {
  requirePermission(actor, "paymentlinks.manage")
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, input.id)).limit(1)
  if (!link) throw new NotFoundError("Lien de paiement introuvable.")
  if (link.status === input.status) throw new ValidationError(input.status === "disabled" ? "Ce lien est déjà désactivé." : "Ce lien est déjà actif.")
  if (input.status === "active") {
    if (link.status === "expired" && link.mode === "unique") throw new ValidationError("Un lien à usage unique arrivé à terme ne peut pas être réactivé.")
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) throw new ValidationError("Ce lien a dépassé sa date d'expiration.")
  }
  await db.update(paymentLinks).set({ status: input.status, updatedBy: actor.id, updatedAt: new Date() }).where(eq(paymentLinks.id, link.id))
  await logAction(db, actor.id, input.status === "disabled" ? "payment_link.admin.disable" : "payment_link.admin.enable", "payment_link", link.id, { from: link.status, to: input.status, reason: input.reason }, { walletType: "PROFESSIONAL", holderId: link.businessId })
  return getPaymentLinkAdmin(actor, link.id)
}

export const adminPaymentLinksRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(100).optional(), status: z.enum(LINK_STATUS).optional(), businessId: id.optional() }).optional())
    .query(({ ctx, input }) => listPaymentLinksAdmin(ctx.actor, input ?? {})),
  get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => getPaymentLinkAdmin(ctx.actor, input.id)),
  payments: protectedProcedure
    .input(z.object({ status: z.enum(PAYMENT_STATUS).optional(), search: z.string().max(100).optional(), limit: z.number().int().min(1).max(300).optional() }).optional())
    .query(({ ctx, input }) => listPaymentsAdmin(ctx.actor, input ?? {})),
  setStatus: writeProcedure
    .input(z.object({ id, status: z.enum(["active", "disabled"]), reason: reasonSchema }))
    .mutation(({ ctx, input }) => setPaymentLinkStatusAdmin(ctx.actor, input)),
  reconcile: writeProcedure
    .input(z.object({ reference: z.string().min(8).max(64) }))
    .mutation(({ ctx, input }) => {
      requirePermission(ctx.actor, "paymentlinks.manage")
      return reconcilePaymentLinkPayment(ctx.actor, input.reference)
    }),
  refund: moneyProcedure
    .input(z.object({ reference: z.string().min(8).max(64), reason: reasonSchema }))
    .mutation(({ ctx, input }) => {
      requirePermission(ctx.actor, "paymentlinks.manage")
      return refundPaymentLinkPayment(ctx.actor, input)
    }),
})
