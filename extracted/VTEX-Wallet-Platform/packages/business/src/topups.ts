import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import {
  canConvert,
  convertMinor,
  db,
  eurEquivalentMinor,
  formatMinor,
  getSimGateway,
  getStripeGateway,
  logAction,
  NotFoundError,
  requireRole,
  stripeAdminStatus,
  stripePublicConfig,
  TOPUP_DAILY_MAX_EUR_CENTS,
  TOPUP_MAX_EUR_CENTS,
  topupLimits,
  topupLimitsByCurrency,
  users,
  ValidationError,
  type Actor,
  type Db,
  type GatewayEvent,
  type IntentSnapshot,
} from "@vtex/core"

import { businessCards, businessTopups, businessWalletAccounts, businesses, type BusinessTopup } from "./db/schema"
import { changeAvailable, generatedReference, getBusinessWallet, insertBusinessNotification, insertBusinessTransaction, requireBusinessRole, writeBusinessLedger } from "./service"
import { handlePaymentLinkStripeEvent } from "./paymentLinkPay"

type Executor = Db

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB", unknown: "Carte" }
const brandLabel = (brand: string | null) => (brand ? BRANDS[brand.toLowerCase()] ?? brand : "Carte")

/** « 1 234,56 € » / « 119 000 ₣ » : le franc Pacifique s'écrit toujours avec son signe. */
function formatAmount(cents: number, currency: string) {
  return formatMinor(cents, currency)
}

/** « 5 000 € » : montant entier en euros pour les messages de plafond. */
function wholeEuros(cents: number) {
  return `${Math.round(cents / 100).toLocaleString("fr-FR")} €`
}

/** Devises de paiement acceptées pour un compte : la sienne, plus l'euro ↔ franc Pacifique à la parité fixe. Le dollar reste en dollar. */
function payableCurrencies(accountCurrency: string) {
  return accountCurrency === "USD" ? ["USD"] : ["EUR", "XPF"]
}

function assertPayable(paymentCurrency: string, accountCurrency: string) {
  if (!canConvert(paymentCurrency, accountCurrency)) {
    throw new ValidationError(`Ce compte est en ${accountCurrency} : une recharge en ${paymentCurrency} n'est pas disponible (seuls l'euro et le franc Pacifique sont convertibles).`)
  }
}

/** Recharges abandonnées (jamais payées) : libérées au bout de 10 min pour ne pas consommer le plafond quotidien. */
async function releaseAbandonedTopups(businessId: number) {
  const abandoned = await db.select().from(businessTopups).where(and(
    eq(businessTopups.businessId, businessId),
    eq(businessTopups.status, "pending"),
    sql`TIMESTAMPDIFF(SECOND, ${businessTopups.createdAt}, NOW()) > 600`,
  )).limit(20)
  for (const row of abandoned) {
    if (row.stripePaymentIntentId) {
      try { await getStripeGateway().cancelIntent(row.stripePaymentIntentId) } catch { /* déjà terminée ou introuvable : on libère quand même localement */ }
    }
    await db.update(businessTopups).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(businessTopups.id, row.id), eq(businessTopups.status, "pending")))
  }
}

/** Recharges des dernières 24 h de toute l'entreprise (tous comptes) qui comptent dans le plafond quotidien, en centimes d'euro. */
async function usedTodayEurCents(businessId: number) {
  const rows = await db.select({ amountCents: businessTopups.amountCents, currency: businessTopups.currency }).from(businessTopups).where(and(
    eq(businessTopups.businessId, businessId),
    inArray(businessTopups.status, ["pending", "requires_action", "processing", "succeeded"]),
    sql`TIMESTAMPDIFF(SECOND, ${businessTopups.createdAt}, NOW()) < 86400`,
  ))
  return rows.reduce((sum, row) => sum + eurEquivalentMinor(row.amountCents, row.currency), 0)
}

function present(row: BusinessTopup, balanceCents: number | null = null) {
  return {
    reference: row.reference,
    status: row.status,
    businessWalletAccountId: row.businessWalletAccountId,
    amountCents: row.amountCents,
    currency: row.currency,
    mode: row.stripeMode,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    creditedAt: row.creditedAt,
    refundedAt: row.refundedAt,
    createdAt: row.createdAt,
    balanceCents,
  }
}

async function getByReference(reference: string): Promise<BusinessTopup> {
  const [row] = await db.select().from(businessTopups).where(eq(businessTopups.reference, reference)).limit(1)
  if (!row) throw new NotFoundError("Recharge introuvable.")
  return row
}

/** Solde du compte exprimé dans la devise de paiement (le solde affiché suit la devise choisie). */
async function balanceOf(accountId: number, currency?: string) {
  const [account] = await db.select({ available: businessWalletAccounts.availableBalanceCents, currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, accountId)).limit(1)
  if (!account) return null
  return currency && canConvert(account.currency, currency) ? convertMinor(account.available, account.currency, currency) : account.available
}

/**
 * Configuration de la recharge d'une entreprise. Les plafonds (5 000 € par recharge, 5 000 € par 24 h pour toute
 * l'entreprise ; voir `TOPUP_MAX_EUR_CENTS`) sont fournis pour chaque devise de paiement : le navigateur les réapplique à chaque changement de devise.
 */
export async function businessTopupConfig(actor: Actor, businessId: number) {
  const accounts = await getBusinessWallet(actor, businessId)
  const config = stripePublicConfig()
  await releaseAbandonedTopups(businessId)
  const used = await usedTodayEurCents(businessId)
  const limitsByCurrency = topupLimitsByCurrency("business", used, ["EUR", "XPF", "USD"])
  const currencyOf = accounts[0]?.currency ?? "EUR"
  const limits = limitsByCurrency[currencyOf] ?? limitsByCurrency.EUR!
  const accountIds = accounts.map((account) => account.id)
  const accountCards = accountIds.length === 0 ? [] : await db.select({ id: businessCards.id, businessWalletAccountId: businessCards.businessWalletAccountId, label: businessCards.label, lastFour: businessCards.lastFour, network: businessCards.network, status: businessCards.status }).from(businessCards).where(inArray(businessCards.businessWalletAccountId, accountIds))
  return {
    enabled: config.enabled,
    mode: config.mode,
    publishableKey: config.publishableKey,
    reason: config.reason,
    fallback: config.fallback,
    minCents: limits.minCents,
    maxCents: limits.maxCents,
    dailyMaxCents: limits.dailyMaxCents,
    dailyRemainingCents: limits.dailyRemainingCents,
    effectiveMaxCents: limits.effectiveMaxCents,
    limitsByCurrency,
    accounts: accounts.map((account) => ({ id: account.id, label: account.label, currency: account.currency, availableBalanceCents: account.availableBalanceCents, status: account.status, payableCurrencies: payableCurrencies(account.currency) })),
    cards: accountCards,
  }
}

export async function createBusinessTopup(actor: Actor, input: { businessId: number; businessWalletAccountId: number; amountCents: number; currency?: "EUR" | "USD" | "XPF"; billingName?: string; idempotencyKey: string }) {
  await requireBusinessRole(db, actor, input.businessId, "owner", "admin", "finance")
  const config = stripePublicConfig()
  if (!config.enabled || !config.mode) throw new ValidationError(config.reason ?? "Les recharges par carte ne sont pas disponibles.")
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError("Le montant de la recharge doit être un entier positif.")

  const [account] = await db.select().from(businessWalletAccounts).where(and(eq(businessWalletAccounts.id, input.businessWalletAccountId), eq(businessWalletAccounts.businessId, input.businessId))).limit(1)
  if (!account) throw new NotFoundError("Compte Wallet Pro introuvable pour cette entreprise.")
  if (account.status !== "active") throw new ValidationError("Ce compte n’est pas actif : la recharge est impossible.")
  // Devise de paiement (par défaut celle du compte) ; EUR ↔ XPF est converti à la parité fixe au crédit.
  const paymentCurrency = input.currency ?? account.currency
  assertPayable(paymentCurrency, account.currency)
  const limits = topupLimits(paymentCurrency, "business")
  if (input.amountCents < limits.minCents) throw new ValidationError(`Montant minimum par recharge : ${formatAmount(limits.minCents, paymentCurrency)}.`)
  if (input.amountCents > limits.maxCents) throw new ValidationError(`Montant maximum par recharge : ${formatAmount(limits.maxCents, paymentCurrency)}${paymentCurrency === "XPF" ? ` (${wholeEuros(TOPUP_MAX_EUR_CENTS.business)})` : ""}.`)

  const [existing] = await db.select().from(businessTopups).where(eq(businessTopups.idempotencyKey, input.idempotencyKey)).limit(1)
  if (!existing) {
    await releaseAbandonedTopups(input.businessId)
    const remaining = topupLimitsByCurrency("business", await usedTodayEurCents(input.businessId), [paymentCurrency])[paymentCurrency]!.dailyRemainingCents
    if (input.amountCents > remaining) {
      throw new ValidationError(remaining <= 0
        ? `Plafond quotidien atteint : ${wholeEuros(TOPUP_DAILY_MAX_EUR_CENTS)} de recharges par 24 h pour cette entreprise. Réessaie plus tard.`
        : `Plafond quotidien : il reste ${formatAmount(remaining, paymentCurrency)} de recharge sur 24 h pour cette entreprise (${wholeEuros(TOPUP_DAILY_MAX_EUR_CENTS)} maximum par jour).`)
    }
  }
  if (existing) {
    if (existing.initiatedByUserId !== actor.id || existing.businessId !== input.businessId || existing.businessWalletAccountId !== account.id || existing.amountCents !== input.amountCents || existing.currency !== paymentCurrency) {
      throw new ValidationError("Cette clé d’idempotence a déjà été utilisée pour une autre recharge.")
    }
    if (existing.status === "pending" && existing.stripePaymentIntentId) {
      const intent = await getStripeGateway().retrieveIntent(existing.stripePaymentIntentId)
      return { ...present(existing), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: true }
    }
    return { ...present(existing), clientSecret: null, publishableKey: config.publishableKey, replayed: true }
  }

  const reference = generatedReference("TOP")
  await db.insert(businessTopups).values({
    reference,
    idempotencyKey: input.idempotencyKey,
    businessId: input.businessId,
    businessWalletAccountId: account.id,
    initiatedByUserId: actor.id,
    amountCents: input.amountCents,
    currency: paymentCurrency,
    status: "pending",
    stripeMode: config.mode,
    billingName: input.billingName?.trim().slice(0, 160) || null,
  })

  let intent: IntentSnapshot
  try {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, actor.id)).limit(1)
    intent = await getStripeGateway().createIntent({
      amountCents: input.amountCents,
      currency: paymentCurrency,
      description: `Recharge Wallet Pro VTEX ${reference}`,
      metadata: { scope: "business", topupReference: reference, businessId: String(input.businessId), businessWalletAccountId: String(account.id), userId: String(actor.id) },
      idempotencyKey: `business-topup:${reference}`,
      receiptEmail: owner?.email ?? null,
    })
  } catch (error) {
    await db.update(businessTopups).set({ status: "failed", failureCode: "intent_creation_failed", failureMessage: "Initialisation du paiement impossible.", updatedAt: new Date() }).where(eq(businessTopups.reference, reference))
    throw new ValidationError(error instanceof ValidationError ? error.message : "Impossible d’initialiser le paiement pour le moment. Réessaie dans un instant.")
  }

  await db.update(businessTopups).set({ stripePaymentIntentId: intent.id, updatedAt: new Date() }).where(eq(businessTopups.reference, reference))
  await logAction(db, actor.id, "business.topup.create", "business", input.businessId, { reference, amountCents: input.amountCents, currency: paymentCurrency, mode: config.mode })
  const row = await getByReference(reference)
  return { ...present(row), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: false }
}

async function creditTopup(topupId: number, intent: IntentSnapshot): Promise<{ credited: boolean }> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(businessTopups).where(eq(businessTopups.id, topupId)).for("update")
    if (!locked) throw new NotFoundError("Recharge introuvable.")
    if (locked.status === "succeeded" || locked.status === "refunded") return { credited: false }

    // Paiement en XPF sur un compte en EUR (ou l'inverse) : conversion à la parité fixe (aucun risque de change).
    const [target] = await executor.select({ currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, locked.businessWalletAccountId)).limit(1)
    const accountCurrency = target?.currency ?? locked.currency
    const creditCents = convertMinor(locked.amountCents, locked.currency, accountCurrency)
    const converted = locked.currency !== accountCurrency
    const balanceAfter = await changeAvailable(executor, locked.businessWalletAccountId, creditCents)
    const transaction = await insertBusinessTransaction(executor, {
      reference: locked.reference,
      idempotencyKey: `topup:${locked.reference}`,
      businessId: locked.businessId,
      businessWalletAccountId: locked.businessWalletAccountId,
      initiatedByUserId: locked.initiatedByUserId,
      type: "topup",
      direction: "credit",
      amountCents: creditCents,
      currency: accountCurrency,
      description: `Recharge par carte ${brandLabel(intent.cardBrand)} •••• ${intent.cardLast4 ?? "----"}${converted ? ` (${formatAmount(locked.amountCents, locked.currency)})` : ""}`,
      metadata: { stripePaymentIntentId: intent.id, stripeMode: locked.stripeMode, cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, billingName: locked.billingName, paidAmountCents: locked.amountCents, paidCurrency: locked.currency },
    })
    await writeBusinessLedger(executor, { businessWalletAccountId: locked.businessWalletAccountId, transactionId: transaction.id, deltaCents: creditCents, balanceAfterCents: balanceAfter })
    await executor.update(businessTopups).set({
      status: "succeeded",
      cardBrand: intent.cardBrand,
      cardLast4: intent.cardLast4,
      failureCode: null,
      failureMessage: null,
      transactionId: transaction.id,
      creditedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(businessTopups.id, locked.id))
    await logAction(executor, locked.initiatedByUserId, "business.topup.credit", "business", locked.businessId, { reference: locked.reference, amountCents: locked.amountCents, currency: locked.currency, paymentIntent: intent.id, mode: locked.stripeMode })
    await insertBusinessNotification(executor, locked.initiatedByUserId, locked.initiatedByUserId, "Recharge Wallet Pro confirmée", `Votre recharge de ${formatAmount(locked.amountCents, locked.currency)} a été créditée sur le compte Wallet Pro.`)
    return { credited: true }
  })
}

async function settleTopup(row: BusinessTopup) {
  if (row.status === "succeeded" || row.status === "refunded") return present(row, await balanceOf(row.businessWalletAccountId, row.currency))
  if (!row.stripePaymentIntentId) return present(row)

  const gateway = getStripeGateway()
  const intent = await gateway.retrieveIntent(row.stripePaymentIntentId)

  if (intent.metadata.topupReference !== row.reference || intent.amountCents !== row.amountCents || intent.currency !== row.currency) {
    await db.update(businessTopups).set({ status: "failed", failureCode: "mismatch", failureMessage: "Le paiement ne correspond pas à la recharge demandée.", updatedAt: new Date() }).where(eq(businessTopups.id, row.id))
    await logAction(db, row.initiatedByUserId, "business.topup.mismatch", "business", row.businessId, { reference: row.reference, paymentIntent: intent.id })
    throw new ValidationError("Le paiement ne correspond pas à la recharge demandée. Aucun crédit n’a été effectué.")
  }

  const open = ["pending", "requires_action", "processing"] as const
  if (intent.status === "succeeded") {
    if (intent.amountReceivedCents !== row.amountCents) throw new ValidationError("Le montant encaissé ne correspond pas à la recharge demandée. Aucun crédit n’a été effectué.")
    await creditTopup(row.id, intent)
  } else if (intent.status === "processing") {
    await db.update(businessTopups).set({ status: "processing", updatedAt: new Date() }).where(and(eq(businessTopups.id, row.id), inArray(businessTopups.status, [...open])))
  } else if (intent.status === "requires_action") {
    await db.update(businessTopups).set({ status: "requires_action", updatedAt: new Date() }).where(and(eq(businessTopups.id, row.id), inArray(businessTopups.status, [...open])))
  } else if (intent.status === "canceled") {
    await db.update(businessTopups).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(businessTopups.id, row.id), inArray(businessTopups.status, [...open])))
  } else if (intent.failureCode || intent.failureMessage) {
    await db.update(businessTopups).set({ status: "failed", cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, failureCode: intent.failureCode?.slice(0, 64) ?? "payment_failed", failureMessage: (intent.failureMessage ?? "Paiement refusé.").slice(0, 250), updatedAt: new Date() }).where(and(eq(businessTopups.id, row.id), inArray(businessTopups.status, [...open])))
    await gateway.cancelIntent(intent.id)
  }

  const fresh = await getByReference(row.reference)
  return present(fresh, await balanceOf(fresh.businessWalletAccountId, fresh.currency))
}

export async function confirmBusinessTopup(actor: Actor, reference: string) {
  const row = await getByReference(reference)
  await requireBusinessRole(db, actor, row.businessId, "owner", "admin", "finance")
  return settleTopup(row)
}

export async function listBusinessTopups(actor: Actor, businessId: number, limit = 20) {
  await requireBusinessRole(db, actor, businessId, "owner", "admin", "finance", "support", "viewer")
  const size = Math.min(Math.max(limit, 1), 50)
  const stale = await db.select().from(businessTopups).where(and(
    eq(businessTopups.businessId, businessId),
    inArray(businessTopups.status, ["pending", "requires_action", "processing"]),
    isNotNull(businessTopups.stripePaymentIntentId),
    sql`TIMESTAMPDIFF(SECOND, ${businessTopups.createdAt}, NOW()) > 60`,
  )).limit(5)
  for (const row of stale) {
    try { await settleTopup(row) } catch { /* recharge ancienne non vérifiable : la liste reste lisible */ }
  }
  const rows = await db.select().from(businessTopups).where(eq(businessTopups.businessId, businessId)).orderBy(desc(businessTopups.createdAt)).limit(size)
  return rows.map((row) => present(row))
}

export async function handleBusinessStripeEvent(event: GatewayEvent): Promise<boolean> {
  if (!event.intentId) return false
  const [row] = await db.select().from(businessTopups).where(eq(businessTopups.stripePaymentIntentId, event.intentId)).limit(1)
  if (!row) return handlePaymentLinkStripeEvent(event)
  await settleTopup(row)
  return true
}

/* ── Administration (Dashboard) ── */

export function businessStripeStatus(actor: Actor) {
  requireRole(actor, "admin", "agent")
  return stripeAdminStatus()
}

export async function listAdminBusinessTopups(actor: Actor, input?: { status?: BusinessTopup["status"]; limit?: number }) {
  requireRole(actor, "admin", "agent")
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500)
  return db.select({
    id: businessTopups.id,
    reference: businessTopups.reference,
    createdAt: businessTopups.createdAt,
    creditedAt: businessTopups.creditedAt,
    refundedAt: businessTopups.refundedAt,
    refundReason: businessTopups.refundReason,
    businessId: businessTopups.businessId,
    businessName: businesses.brandName,
    businessWalletAccountId: businessTopups.businessWalletAccountId,
    initiatedByUserId: businessTopups.initiatedByUserId,
    initiatedByName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    billingName: businessTopups.billingName,
    amountCents: businessTopups.amountCents,
    currency: businessTopups.currency,
    status: businessTopups.status,
    mode: businessTopups.stripeMode,
    cardBrand: businessTopups.cardBrand,
    cardLast4: businessTopups.cardLast4,
    failureCode: businessTopups.failureCode,
    failureMessage: businessTopups.failureMessage,
    stripePaymentIntentId: businessTopups.stripePaymentIntentId,
    transactionId: businessTopups.transactionId,
  }).from(businessTopups)
    .innerJoin(businesses, eq(businesses.id, businessTopups.businessId))
    .innerJoin(users, eq(users.id, businessTopups.initiatedByUserId))
    .where(input?.status ? eq(businessTopups.status, input.status) : undefined)
    .orderBy(desc(businessTopups.createdAt)).limit(limit)
}

export async function reconcileBusinessTopup(actor: Actor, reference: string) {
  requireRole(actor, "admin", "agent")
  const row = await getByReference(reference)
  const result = await settleTopup(row)
  await logAction(db, actor.id, "business.topup.reconcile", "business", row.businessId, { reference, status: result.status })
  return result
}

export async function cancelBusinessTopup(actor: Actor, reference: string) {
  requireRole(actor, "admin")
  const row = await getByReference(reference)
  if (row.status !== "pending" && row.status !== "requires_action") throw new ValidationError("Seule une recharge en attente peut être annulée.")
  if (row.stripePaymentIntentId) {
    try { await getStripeGateway().cancelIntent(row.stripePaymentIntentId) } catch { /* déjà terminée côté Stripe : on annule quand même localement */ }
  }
  await db.update(businessTopups).set({ status: "canceled", updatedAt: new Date() }).where(eq(businessTopups.id, row.id))
  await logAction(db, actor.id, "business.topup.cancel", "business", row.businessId, { reference })
  return present(await getByReference(reference))
}

/** Rembourse une recharge créditée : débit du compte Pro puis remboursement Stripe, atomiquement. */
export async function refundBusinessTopup(actor: Actor, input: { reference: string; reason: string }) {
  requireRole(actor, "admin")
  if (input.reason.trim().length < 8) throw new ValidationError("Une justification d’au moins huit caractères est requise.")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(businessTopups).where(eq(businessTopups.reference, input.reference)).for("update")
    if (!locked) throw new NotFoundError("Recharge introuvable.")
    if (locked.status !== "succeeded") throw new ValidationError("Seule une recharge créditée peut être remboursée.")
    const [target] = await executor.select({ currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, locked.businessWalletAccountId)).limit(1)
    const accountCurrency = target?.currency ?? locked.currency
    const debitCents = convertMinor(locked.amountCents, locked.currency, accountCurrency)
    const balanceAfter = await changeAvailable(executor, locked.businessWalletAccountId, -debitCents)
    const transaction = await insertBusinessTransaction(executor, {
      reference: generatedReference("RFD"),
      idempotencyKey: `topup-refund:${locked.reference}`,
      businessId: locked.businessId,
      businessWalletAccountId: locked.businessWalletAccountId,
      initiatedByUserId: actor.id,
      type: "refund",
      direction: "debit",
      amountCents: debitCents,
      currency: accountCurrency,
      description: `Remboursement de la recharge ${locked.reference}`,
      metadata: { topupReference: locked.reference, reason: input.reason.trim() },
    })
    await writeBusinessLedger(executor, { businessWalletAccountId: locked.businessWalletAccountId, transactionId: transaction.id, deltaCents: -debitCents, balanceAfterCents: balanceAfter })
    if (locked.stripePaymentIntentId) await getStripeGateway().refundIntent(locked.stripePaymentIntentId, `topup-refund:${locked.reference}`)
    await executor.update(businessTopups).set({ status: "refunded", refundedAt: new Date(), refundReason: input.reason.trim(), updatedAt: new Date() }).where(eq(businessTopups.id, locked.id))
    await logAction(executor, actor.id, "business.topup.refund", "business", locked.businessId, { reference: locked.reference, amountCents: locked.amountCents, reason: input.reason.trim() })
    await insertBusinessNotification(executor, locked.initiatedByUserId, actor.id, "Recharge Wallet Pro remboursée", `Votre recharge de ${formatAmount(locked.amountCents, locked.currency)} a été remboursée sur la carte.`)
    return present({ ...locked, status: "refunded", refundedAt: new Date(), refundReason: input.reason.trim() }, canConvert(accountCurrency, locked.currency) ? convertMinor(balanceAfter, accountCurrency, locked.currency) : balanceAfter)
  })
}

/* ── Simulateur (développement uniquement) ── */

function requireSim() {
  if (stripePublicConfig().mode !== "sim") throw new ValidationError("Le simulateur de paiement n’est disponible qu’en développement.")
  return getSimGateway()
}

export async function simPayBusinessTopup(actor: Actor, input: { reference: string; cardNumber: string }) {
  const sim = requireSim()
  const row = await getByReference(input.reference)
  await requireBusinessRole(db, actor, row.businessId, "owner", "admin", "finance")
  if (!row.stripePaymentIntentId) throw new ValidationError("Recharge non initialisée.")
  const result = sim.pay(row.stripePaymentIntentId, input.cardNumber)
  return { simStatus: result.status, ...(await settleTopup(row)) }
}

export async function simAuthenticateBusinessTopup(actor: Actor, reference: string) {
  const sim = requireSim()
  const row = await getByReference(reference)
  await requireBusinessRole(db, actor, row.businessId, "owner", "admin", "finance")
  if (!row.stripePaymentIntentId) throw new ValidationError("Recharge non initialisée.")
  sim.authenticate(row.stripePaymentIntentId)
  return settleTopup(row)
}
