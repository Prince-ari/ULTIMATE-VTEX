import { and, desc, eq, inArray, sql } from "drizzle-orm"
import {
  NotFoundError,
  ValidationError,
  canConvert,
  checkRateLimit,
  convertMinor,
  db,
  formatMinor,
  getSimGateway,
  getStripeGateway,
  logAction,
  stripePublicConfig,
  topupLimits,
  type Actor,
  type Db,
  type GatewayEvent,
  type IntentSnapshot,
} from "@vtex/core"

import { businessWalletAccounts, businesses, paymentLinkEvents, paymentLinkPayments, paymentLinks, type PaymentLink, type PaymentLinkPayment } from "./db/schema"
import { changeAvailable, generatedReference, insertBusinessNotification, insertBusinessTransaction, writeBusinessLedger } from "./service"

/**
 * Lien de paiement public : la personne qui paie n'a AUCUN compte. Elle ne voit que le nom du lien, la société, le montant ; jamais un identifiant
 * interne. Le numéro de carte ne passe jamais par VTEX (Payment Element du prestataire ; simulateur en développement uniquement). Tout
 * point d'entrée est limité en débit par adresse IP et le règlement est revérifié auprès du prestataire (référence, montant, devise) avant tout crédit.
 */

type Executor = Db

/** Un paiement « en cours » qui bloque un lien à usage unique pendant 10 minutes (au-delà, il est libéré). */
const HOLD_SECONDS = 600
const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB", unknown: "Carte" }
const brandLabel = (brand: string | null) => (brand ? BRANDS[brand.toLowerCase()] ?? brand : "Carte")
const OPEN = ["pending", "requires_action", "processing"] as const

/** Messages de refus lisibles par un payeur (vouvoiement), indépendants de la langue ou du ton renvoyés par le prestataire. */
const DECLINE_MESSAGES: Record<string, string> = {
  card_declined: "Votre banque a décliné la transaction.",
  generic_decline: "Votre banque a décliné la transaction.",
  insufficient_funds: "Fonds insuffisants sur la carte.",
  expired_card: "La carte est expirée.",
  incorrect_cvc: "Le code de sécurité de la carte est incorrect.",
  incorrect_number: "Le numéro de carte est incorrect.",
  authentication_required: "L'authentification bancaire n'a pas abouti.",
  processing_error: "Une erreur est survenue lors du traitement. Réessayez dans un instant.",
}
const declineMessage = (code: string | null | undefined) => (code && DECLINE_MESSAGES[code]) || "Le paiement a été refusé par votre banque."

interface Resolved {
  link: PaymentLink
  businessName: string
  businessLogoUrl: string | null
  account: { id: number; currency: string; status: string }
}

/** Lien + société + compte cible, ou `null` s'il n'existe pas ou n'est pas publié (jamais de distinction publique : pas d'énumération). */
async function resolveLink(executor: Executor, slug: string): Promise<{ resolved: Resolved | null; unavailableReason: string | null }> {
  if (!/^[A-Za-z0-9_-]{4,24}$/.test(slug)) return { resolved: null, unavailableReason: null }
  const [link] = await executor.select().from(paymentLinks).where(eq(paymentLinks.slug, slug)).limit(1)
  if (!link || link.status === "draft" || link.status === "disabled") return { resolved: null, unavailableReason: null }
  const [company] = await executor.select({ brandName: businesses.brandName, logoUrl: businesses.logoUrl, status: businesses.status }).from(businesses).where(eq(businesses.id, link.businessId)).limit(1)
  if (!company || company.status !== "active") return { resolved: null, unavailableReason: null }
  const accountId = link.targetAccountId ?? (await executor.select({ id: businessWalletAccounts.id }).from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, link.businessId)).orderBy(businessWalletAccounts.id).limit(1))[0]?.id
  const [account] = accountId ? await executor.select({ id: businessWalletAccounts.id, currency: businessWalletAccounts.currency, status: businessWalletAccounts.status }).from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, accountId), eq(businessWalletAccounts.businessId, link.businessId))).limit(1) : []
  const resolved: Resolved = { link, businessName: company.brandName, businessLogoUrl: company.logoUrl, account: account ?? { id: 0, currency: link.currency, status: "closed" } }

  if (link.status === "expired" || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
    if (link.status !== "expired") await executor.update(paymentLinks).set({ status: "expired", updatedAt: new Date() }).where(eq(paymentLinks.id, link.id))
    return { resolved, unavailableReason: "Ce lien de paiement n'est plus valable." }
  }
  if (!account || account.status !== "active") return { resolved, unavailableReason: "Ce lien ne peut pas recevoir de paiement pour le moment." }
  if (link.mode === "unique") {
    const [taken] = await executor.select({ id: paymentLinkPayments.id }).from(paymentLinkPayments).where(and(
      eq(paymentLinkPayments.paymentLinkId, link.id),
      sql`(${paymentLinkPayments.status} = 'succeeded' OR (${paymentLinkPayments.status} IN ('pending','requires_action','processing') AND TIMESTAMPDIFF(SECOND, ${paymentLinkPayments.createdAt}, NOW()) < ${HOLD_SECONDS}))`,
    )).limit(1)
    if (taken) return { resolved, unavailableReason: "Ce lien à usage unique a déjà été utilisé ou est en cours de règlement." }
  }
  return { resolved, unavailableReason: null }
}

function assertPayableCurrency(link: PaymentLink, account: { currency: string }) {
  if (link.currency !== account.currency && !canConvert(link.currency, account.currency)) throw new ValidationError("Ce lien ne peut pas être réglé dans cette devise.")
}

/** Ce que voit un payeur : rien d'interne (ni identifiant de société, ni de compte, ni de créateur). */
export async function getPublicPaymentLink(slug: string, ip: string) {
  await checkRateLimit(db, `paylink:view:${ip}`, 60, 60_000)
  const { resolved, unavailableReason } = await resolveLink(db, slug)
  if (!resolved) throw new NotFoundError("Ce lien de paiement n'est pas disponible.")
  const config = stripePublicConfig()
  await db.insert(paymentLinkEvents).values({ paymentLinkId: resolved.link.id, kind: "visit" })
  return {
    name: resolved.link.name,
    description: resolved.link.description,
    amountCents: resolved.link.amountCents,
    currency: resolved.link.currency,
    mode: resolved.link.mode,
    businessName: resolved.businessName,
    businessLogoUrl: resolved.businessLogoUrl,
    payable: unavailableReason === null && config.enabled,
    unavailableReason: unavailableReason ?? (config.enabled ? null : config.reason ?? "Le paiement en ligne n'est pas disponible pour le moment."),
    stripe: { enabled: config.enabled, mode: config.mode, publishableKey: config.publishableKey },
  }
}

function present(row: PaymentLinkPayment, extra: { linkName?: string; businessName?: string } = {}) {
  return {
    reference: row.reference,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    mode: row.stripeMode,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    creditedAt: row.creditedAt,
    createdAt: row.createdAt,
    ...extra,
  }
}

async function getByReference(reference: string): Promise<PaymentLinkPayment> {
  const [row] = await db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.reference, reference)).limit(1)
  if (!row) throw new NotFoundError("Paiement introuvable.")
  return row
}

async function names(row: PaymentLinkPayment) {
  const [link] = await db.select({ name: paymentLinks.name, businessId: paymentLinks.businessId }).from(paymentLinks).where(eq(paymentLinks.id, row.paymentLinkId)).limit(1)
  const [company] = link ? await db.select({ brandName: businesses.brandName }).from(businesses).where(eq(businesses.id, link.businessId)).limit(1) : []
  return { linkName: link?.name, businessName: company?.brandName }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function startPublicPayment(input: { slug: string; payerName: string; payerEmail: string; idempotencyKey: string }, ip: string) {
  await checkRateLimit(db, `paylink:start:${ip}`, 10, 60_000)
  await checkRateLimit(db, `paylink:start:slug:${input.slug}`, 60, 60_000)
  const payerName = input.payerName.trim()
  const payerEmail = input.payerEmail.trim().toLowerCase()
  if (payerName.length < 2 || payerName.length > 160) throw new ValidationError("Indiquez votre nom.")
  if (!EMAIL.test(payerEmail) || payerEmail.length > 160) throw new ValidationError("Indiquez une adresse e-mail valide pour recevoir votre reçu.")

  const config = stripePublicConfig()
  if (!config.enabled || !config.mode) throw new ValidationError(config.reason ?? "Le paiement en ligne n'est pas disponible pour le moment.")

  // Rejeu : même clé, même lien → on renvoie le même paiement (jamais un doublon).
  const [existing] = await db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.idempotencyKey, input.idempotencyKey)).limit(1)
  const { resolved, unavailableReason } = await resolveLink(db, input.slug)
  if (!resolved) throw new NotFoundError("Ce lien de paiement n'est pas disponible.")
  if (existing) {
    if (existing.paymentLinkId !== resolved.link.id || existing.payerEmail !== payerEmail) throw new ValidationError("Cette clé d'idempotence a déjà été utilisée pour un autre paiement.")
    if (existing.status === "pending" && existing.stripePaymentIntentId) {
      const intent = await getStripeGateway().retrieveIntent(existing.stripePaymentIntentId)
      return { ...present(existing), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: true }
    }
    return { ...present(existing), clientSecret: null, publishableKey: config.publishableKey, replayed: true }
  }
  if (unavailableReason) throw new ValidationError(unavailableReason)
  assertPayableCurrency(resolved.link, resolved.account)
  const limits = topupLimits(resolved.link.currency, "business")
  if (resolved.link.amountCents < limits.minCents) throw new ValidationError(`Le montant de ce lien est inférieur au minimum encaissable (${formatMinor(limits.minCents, resolved.link.currency)}).`)

  const reference = generatedReference("PLP")
  await db.insert(paymentLinkPayments).values({
    reference,
    idempotencyKey: input.idempotencyKey,
    paymentLinkId: resolved.link.id,
    businessId: resolved.link.businessId,
    businessWalletAccountId: resolved.account.id,
    amountCents: resolved.link.amountCents,
    currency: resolved.link.currency,
    status: "pending",
    payerName,
    payerEmail,
    payerIp: ip.slice(0, 45),
    stripeMode: config.mode,
  })

  let intent: IntentSnapshot
  try {
    intent = await getStripeGateway().createIntent({
      amountCents: resolved.link.amountCents,
      currency: resolved.link.currency,
      description: `Lien de paiement « ${resolved.link.name} » — ${resolved.businessName}`,
      metadata: { scope: "payment_link", paymentReference: reference, paymentLinkId: String(resolved.link.id), businessId: String(resolved.link.businessId) },
      idempotencyKey: `payment-link:${reference}`,
      receiptEmail: payerEmail,
    })
  } catch (error) {
    await db.update(paymentLinkPayments).set({ status: "failed", failureCode: "intent_creation_failed", failureMessage: "Initialisation du paiement impossible.", updatedAt: new Date() }).where(eq(paymentLinkPayments.reference, reference))
    throw new ValidationError(error instanceof ValidationError ? error.message : "Impossible d'initialiser le paiement pour le moment. Réessayez dans un instant.")
  }
  await db.update(paymentLinkPayments).set({ stripePaymentIntentId: intent.id, updatedAt: new Date() }).where(eq(paymentLinkPayments.reference, reference))
  await logAction(db, null, "payment_link.payment.start", "payment_link", resolved.link.id, { reference, amountCents: resolved.link.amountCents, currency: resolved.link.currency, mode: config.mode }, { walletType: "PROFESSIONAL", holderId: resolved.link.businessId })
  const row = await getByReference(reference)
  return { ...present(row), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: false }
}

async function creditPayment(paymentId: number, intent: IntentSnapshot): Promise<{ credited: boolean }> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.id, paymentId)).for("update")
    if (!locked) throw new NotFoundError("Paiement introuvable.")
    // Déjà crédité (ou crédité puis remboursé) : jamais un second crédit, quel que soit l'état que le prestataire renvoie ensuite.
    if (locked.status === "succeeded" || locked.status === "refunded") return { credited: false }
    const [link] = await executor.select().from(paymentLinks).where(eq(paymentLinks.id, locked.paymentLinkId)).limit(1)
    if (!link) throw new NotFoundError("Lien de paiement introuvable.")
    const [account] = await executor.select({ currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, locked.businessWalletAccountId)).limit(1)
    const accountCurrency = account?.currency ?? locked.currency
    const creditCents = convertMinor(locked.amountCents, locked.currency, accountCurrency)
    const balanceAfter = await changeAvailable(executor, locked.businessWalletAccountId, creditCents)
    const transaction = await insertBusinessTransaction(executor, {
      reference: locked.reference,
      idempotencyKey: `payment-link:${locked.reference}`,
      businessId: locked.businessId,
      businessWalletAccountId: locked.businessWalletAccountId,
      initiatedByUserId: link.createdBy,
      type: "payment_link",
      direction: "credit",
      amountCents: creditCents,
      currency: accountCurrency,
      description: `Paiement via le lien « ${link.name} » — ${locked.payerName ?? "client"} · ${brandLabel(intent.cardBrand)} •••• ${intent.cardLast4 ?? "----"}`,
      metadata: { paymentLinkId: link.id, stripePaymentIntentId: intent.id, stripeMode: locked.stripeMode, cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, payerName: locked.payerName, paidAmountCents: locked.amountCents, paidCurrency: locked.currency },
    })
    await writeBusinessLedger(executor, { businessWalletAccountId: locked.businessWalletAccountId, transactionId: transaction.id, deltaCents: creditCents, balanceAfterCents: balanceAfter })
    await executor.update(paymentLinkPayments).set({ status: "succeeded", cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, failureCode: null, failureMessage: null, transactionId: transaction.id, creditedAt: new Date(), updatedAt: new Date() }).where(eq(paymentLinkPayments.id, locked.id))
    await executor.insert(paymentLinkEvents).values({ paymentLinkId: link.id, kind: "payment", amountCents: locked.amountCents })
    if (link.mode === "unique") await executor.update(paymentLinks).set({ status: "expired", updatedAt: new Date() }).where(eq(paymentLinks.id, link.id))
    await logAction(executor, null, "payment_link.payment.credit", "payment_link", link.id, { reference: locked.reference, amountCents: locked.amountCents, currency: locked.currency, paymentIntent: intent.id, accountId: locked.businessWalletAccountId }, { walletType: "PROFESSIONAL", holderId: locked.businessId })
    const [owner] = await executor.select({ ownerUserId: businesses.ownerUserId }).from(businesses).where(eq(businesses.id, locked.businessId)).limit(1)
    if (owner) await insertBusinessNotification(executor, owner.ownerUserId, link.createdBy, "Paiement reçu par lien", `${locked.payerName ?? "Un client"} a payé ${formatMinor(locked.amountCents, locked.currency)} via « ${link.name} ».`)
    return { credited: true }
  })
}

async function settlePayment(row: PaymentLinkPayment) {
  const decorate = async (fresh: PaymentLinkPayment) => present(fresh, await names(fresh))
  if (row.status === "succeeded" || row.status === "refunded" || !row.stripePaymentIntentId) return decorate(row)
  const gateway = getStripeGateway()
  const intent = await gateway.retrieveIntent(row.stripePaymentIntentId)

  if (intent.metadata.paymentReference !== row.reference || intent.amountCents !== row.amountCents || intent.currency !== row.currency) {
    await db.update(paymentLinkPayments).set({ status: "failed", failureCode: "mismatch", failureMessage: "Le paiement ne correspond pas à la demande.", updatedAt: new Date() }).where(eq(paymentLinkPayments.id, row.id))
    await logAction(db, null, "payment_link.payment.mismatch", "payment_link", row.paymentLinkId, { reference: row.reference, paymentIntent: intent.id }, { walletType: "PROFESSIONAL", holderId: row.businessId })
    throw new ValidationError("Le paiement ne correspond pas à la demande. Aucun crédit n'a été effectué.")
  }
  if (intent.status === "succeeded") {
    if (intent.amountReceivedCents !== row.amountCents) throw new ValidationError("Le montant encaissé ne correspond pas au lien. Aucun crédit n'a été effectué.")
    await creditPayment(row.id, intent)
  } else if (intent.status === "processing" || intent.status === "requires_action") {
    await db.update(paymentLinkPayments).set({ status: intent.status, updatedAt: new Date() }).where(and(eq(paymentLinkPayments.id, row.id), inArray(paymentLinkPayments.status, [...OPEN])))
  } else if (intent.status === "canceled") {
    await db.update(paymentLinkPayments).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(paymentLinkPayments.id, row.id), inArray(paymentLinkPayments.status, [...OPEN])))
  } else if (intent.failureCode || intent.failureMessage) {
    await db.update(paymentLinkPayments).set({ status: "failed", cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, failureCode: intent.failureCode?.slice(0, 64) ?? "payment_failed", failureMessage: declineMessage(intent.failureCode), updatedAt: new Date() }).where(and(eq(paymentLinkPayments.id, row.id), inArray(paymentLinkPayments.status, [...OPEN])))
    await gateway.cancelIntent(intent.id)
  }
  return decorate(await getByReference(row.reference))
}

/** Vérifie le règlement auprès du prestataire puis crédite (idempotent). Appelé au retour du payeur et par le webhook. */
export async function confirmPublicPayment(reference: string, ip: string) {
  await checkRateLimit(db, `paylink:confirm:${ip}`, 60, 60_000)
  return settlePayment(await getByReference(reference))
}

export async function handlePaymentLinkStripeEvent(event: GatewayEvent): Promise<boolean> {
  if (!event.intentId) return false
  const [row] = await db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.stripePaymentIntentId, event.intentId)).limit(1)
  if (!row) return false
  await settlePayment(row)
  return true
}

/** Revérifie un paiement auprès du prestataire (Dashboard) : crédite s'il est réellement encaissé, sinon met à jour l'état. Idempotent. */
export async function reconcilePaymentLinkPayment(actor: Actor, reference: string) {
  const row = await getByReference(reference)
  const result = await settlePayment(row)
  await logAction(db, actor.id, "payment_link.payment.reconcile", "payment_link", row.paymentLinkId, { reference, status: result.status }, { walletType: "PROFESSIONAL", holderId: row.businessId })
  return result
}

/** Rembourse un paiement crédité : débit du compte Pro puis remboursement chez le prestataire, atomiquement (Dashboard uniquement). */
export async function refundPaymentLinkPayment(actor: Actor, input: { reference: string; reason: string }) {
  const reason = input.reason.trim()
  if (reason.length < 8) throw new ValidationError("Une justification d'au moins huit caractères est requise.")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.reference, input.reference)).for("update")
    if (!locked) throw new NotFoundError("Paiement introuvable.")
    if (locked.status !== "succeeded") throw new ValidationError("Seul un paiement encaissé peut être remboursé.")
    const [link] = await executor.select({ name: paymentLinks.name }).from(paymentLinks).where(eq(paymentLinks.id, locked.paymentLinkId)).limit(1)
    const [account] = await executor.select({ currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, locked.businessWalletAccountId)).limit(1)
    const accountCurrency = account?.currency ?? locked.currency
    const debitCents = convertMinor(locked.amountCents, locked.currency, accountCurrency)
    const balanceAfter = await changeAvailable(executor, locked.businessWalletAccountId, -debitCents)
    const transaction = await insertBusinessTransaction(executor, {
      reference: generatedReference("RFD"),
      idempotencyKey: `payment-link-refund:${locked.reference}`,
      businessId: locked.businessId,
      businessWalletAccountId: locked.businessWalletAccountId,
      initiatedByUserId: actor.id,
      type: "refund",
      direction: "debit",
      amountCents: debitCents,
      currency: accountCurrency,
      description: `Remboursement du paiement ${locked.reference} — lien « ${link?.name ?? "supprimé"} »`,
      metadata: { paymentReference: locked.reference, reason },
    })
    await writeBusinessLedger(executor, { businessWalletAccountId: locked.businessWalletAccountId, transactionId: transaction.id, deltaCents: -debitCents, balanceAfterCents: balanceAfter })
    if (locked.stripePaymentIntentId) await getStripeGateway().refundIntent(locked.stripePaymentIntentId, `payment-link-refund:${locked.reference}`)
    await executor.update(paymentLinkPayments).set({ status: "refunded", updatedAt: new Date() }).where(eq(paymentLinkPayments.id, locked.id))
    await logAction(executor, actor.id, "payment_link.payment.refund", "payment_link", locked.paymentLinkId, { reference: locked.reference, amountCents: locked.amountCents, currency: locked.currency, reason }, { walletType: "PROFESSIONAL", holderId: locked.businessId })
    return present({ ...locked, status: "refunded" })
  })
}
/* ── Simulateur (développement uniquement) ── */

function requireSim() {
  if (stripePublicConfig().mode !== "sim") throw new ValidationError("Le simulateur de paiement n'est disponible qu'en développement.")
  return getSimGateway()
}

export async function simPayPublicPayment(input: { reference: string; cardNumber: string }, ip: string) {
  await checkRateLimit(db, `paylink:sim:${ip}`, 30, 60_000)
  const sim = requireSim()
  const row = await getByReference(input.reference)
  if (!row.stripePaymentIntentId) throw new ValidationError("Paiement non initialisé.")
  const result = sim.pay(row.stripePaymentIntentId, input.cardNumber)
  return { simStatus: result.status, ...(await settlePayment(row)) }
}

export async function simAuthenticatePublicPayment(reference: string, ip: string) {
  await checkRateLimit(db, `paylink:sim:${ip}`, 30, 60_000)
  const sim = requireSim()
  const row = await getByReference(reference)
  if (!row.stripePaymentIntentId) throw new ValidationError("Paiement non initialisé.")
  sim.authenticate(row.stripePaymentIntentId)
  return settlePayment(row)
}

/** Paiements récents d'un lien (Dashboard et espace Pro). Jamais l'adresse IP ni l'identifiant d'intention. */
export async function recentPaymentsOfLink(paymentLinkId: number, limit = 20) {
  const rows = await db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.paymentLinkId, paymentLinkId)).orderBy(desc(paymentLinkPayments.createdAt)).limit(Math.min(limit, 50))
  return rows.map((row) => ({ reference: row.reference, status: row.status, amountCents: row.amountCents, currency: row.currency, payerName: row.payerName, cardBrand: row.cardBrand, cardLast4: row.cardLast4, failureMessage: row.failureMessage, creditedAt: row.creditedAt, createdAt: row.createdAt }))
}
