import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm"
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
  requireSelfOrRole,
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

import { cards, walletAccounts, walletTopups, type WalletTopup } from "./db/schema"
import { changeAvailable, ensureWalletAccount, generatedReference, getAccountOrThrow, insertTransaction, insertWalletNotification, writeLedger } from "./service"

type Executor = Db
type Currency = "EUR" | "USD" | "XPF"

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB", unknown: "Carte" }
const brandLabel = (brand: string | null) => (brand ? BRANDS[brand.toLowerCase()] ?? brand : "Carte")

/** « 1 234,56 € » / « 119 000 ₣ » : le franc Pacifique s'écrit toujours avec son signe. */
export function formatTopupAmount(cents: number, currency: string) {
  return formatMinor(cents, currency)
}

/** « 2 000 € » : montant entier en euros pour les messages de plafond. */
function wholeEuros(cents: number) {
  return `${Math.round(cents / 100).toLocaleString("fr-FR")} €`
}

/** Montant crédité sur le compte, dans SA devise (le wallet est en euros ; un paiement en XPF est converti à la parité fixe). */
function creditedMinor(row: Pick<WalletTopup, "amountCents" | "currency">, accountCurrency: string) {
  return convertMinor(row.amountCents, row.currency, accountCurrency)
}

function assertPayable(paymentCurrency: string, accountCurrency: string) {
  if (!canConvert(paymentCurrency, accountCurrency)) {
    throw new ValidationError(`Ce wallet est en ${accountCurrency} : une recharge en ${paymentCurrency} n'est pas disponible (seuls l'euro et le franc Pacifique sont convertibles).`)
  }
}

/** Recharges abandonnées (jamais payées) : libérées au bout de 10 min pour ne pas consommer le plafond quotidien. */
async function releaseAbandonedTopups(userId: number) {
  const abandoned = await db.select().from(walletTopups).where(and(
    eq(walletTopups.userId, userId),
    eq(walletTopups.status, "pending"),
    sql`TIMESTAMPDIFF(SECOND, ${walletTopups.createdAt}, NOW()) > 600`,
  )).limit(20)
  for (const row of abandoned) {
    if (row.stripePaymentIntentId) {
      try { await getStripeGateway().cancelIntent(row.stripePaymentIntentId) } catch { /* déjà terminée ou introuvable : on libère quand même localement */ }
    }
    await db.update(walletTopups).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(walletTopups.id, row.id), eq(walletTopups.status, "pending")))
  }
}

/** Recharges des dernières 24 h qui comptent dans le plafond quotidien, en centimes d'euro équivalents. */
async function usedTodayEurCents(userId: number) {
  const rows = await db.select({ amountCents: walletTopups.amountCents, currency: walletTopups.currency }).from(walletTopups).where(and(
    eq(walletTopups.userId, userId),
    inArray(walletTopups.status, ["pending", "requires_action", "processing", "succeeded"]),
    sql`TIMESTAMPDIFF(SECOND, ${walletTopups.createdAt}, NOW()) < 86400`,
  ))
  return rows.reduce((sum, row) => sum + eurEquivalentMinor(row.amountCents, row.currency), 0)
}

/** Ce que le navigateur a le droit de savoir : jamais le PaymentIntent brut. */
function present(row: WalletTopup, balanceCents: number | null = null) {
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
    refundedAt: row.refundedAt,
    createdAt: row.createdAt,
    balanceCents,
  }
}

async function getByReference(reference: string): Promise<WalletTopup> {
  const [row] = await db.select().from(walletTopups).where(eq(walletTopups.reference, reference)).limit(1)
  if (!row) throw new NotFoundError("Recharge introuvable.")
  return row
}

/** Solde du compte exprimé dans la devise de paiement (le solde affiché suit la devise choisie). */
async function balanceOf(accountId: number, currency?: string) {
  const [account] = await db.select({ available: walletAccounts.availableBalanceCents, currency: walletAccounts.currency }).from(walletAccounts).where(eq(walletAccounts.id, accountId)).limit(1)
  if (!account) return null
  return currency && canConvert(account.currency, currency) ? convertMinor(account.available, account.currency, currency) : account.available
}

/**
 * Configuration de la recharge pour une devise de PAIEMENT donnée (EUR ou XPF).
 * La recharge crédite le compte PRINCIPAL du titulaire (sa devise initiale : euro ou franc Pacifique, convertibles à la parité fixe) :
 * le navigateur re-demande cette configuration à chaque changement de devise, ce qui recalcule les plafonds
 * (2 000 € par recharge, 5 000 € par 24 h) et le solde dans la nouvelle devise.
 */
export async function walletTopupConfig(actor: Actor, currency: Currency = "EUR") {
  const config = stripePublicConfig()
  const account = await ensureWalletAccount(actor)
  assertPayable(currency, account.currency)
  await releaseAbandonedTopups(actor.id)
  const used = await usedTodayEurCents(actor.id)
  const limitsByCurrency = topupLimitsByCurrency("wallet", used)
  const limits = limitsByCurrency[currency] ?? { ...topupLimits(currency, "wallet"), dailyRemainingCents: 0, effectiveMaxCents: 0 }
  const accountCards = await db.select({ id: cards.id, label: cards.label, lastFour: cards.lastFour, network: cards.network, status: cards.status }).from(cards).where(eq(cards.walletAccountId, account.id))
  return {
    enabled: config.enabled,
    mode: config.mode,
    publishableKey: config.publishableKey,
    reason: config.reason,
    fallback: config.fallback,
    currency,
    accountCurrency: account.currency,
    minCents: limits.minCents,
    maxCents: limits.maxCents,
    dailyMaxCents: limits.dailyMaxCents,
    dailyRemainingCents: limits.dailyRemainingCents,
    effectiveMaxCents: limits.effectiveMaxCents,
    limitsByCurrency,
    balanceCents: convertMinor(account.availableBalanceCents, account.currency, currency),
    walletAccountId: account.id,
    cards: accountCards,
  }
}

export async function createWalletTopup(actor: Actor, input: { currency: Currency; amountCents: number; idempotencyKey: string }) {
  const config = stripePublicConfig()
  if (!config.enabled || !config.mode) throw new ValidationError(config.reason ?? "Les recharges par carte ne sont pas disponibles.")
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError("Le montant de la recharge doit être un entier positif.")

  // Compte principal du titulaire ; la devise de paiement (EUR ou XPF) est convertie à la parité fixe au crédit.
  const account = await ensureWalletAccount(actor)
  if (account.status !== "active") throw new ValidationError("Ce wallet n’est pas actif : la recharge est impossible.")
  assertPayable(input.currency, account.currency)
  const limits = topupLimits(input.currency, "wallet")
  if (input.amountCents < limits.minCents) throw new ValidationError(`Montant minimum par recharge : ${formatTopupAmount(limits.minCents, input.currency)}.`)
  if (input.amountCents > limits.maxCents) throw new ValidationError(`Montant maximum par recharge : ${formatTopupAmount(limits.maxCents, input.currency)}${input.currency === "XPF" ? ` (${wholeEuros(TOPUP_MAX_EUR_CENTS.wallet)})` : ""}.`)

  const [existing] = await db.select().from(walletTopups).where(eq(walletTopups.idempotencyKey, input.idempotencyKey)).limit(1)
  if (!existing) {
    await releaseAbandonedTopups(actor.id)
    const remaining = topupLimitsByCurrency("wallet", await usedTodayEurCents(actor.id), [input.currency])[input.currency]!.dailyRemainingCents
    if (input.amountCents > remaining) {
      throw new ValidationError(remaining <= 0
        ? `Plafond quotidien atteint : ${wholeEuros(TOPUP_DAILY_MAX_EUR_CENTS)} de recharges par 24 h. Réessaie plus tard.`
        : `Plafond quotidien : il te reste ${formatTopupAmount(remaining, input.currency)} de recharge sur 24 h (${wholeEuros(TOPUP_DAILY_MAX_EUR_CENTS)} maximum par jour).`)
    }
  }
  if (existing) {
    if (existing.userId !== actor.id || existing.amountCents !== input.amountCents || existing.currency !== input.currency) {
      throw new ValidationError("Cette clé d’idempotence a déjà été utilisée pour une autre recharge.")
    }
    if (existing.status === "pending" && existing.stripePaymentIntentId) {
      const intent = await getStripeGateway().retrieveIntent(existing.stripePaymentIntentId)
      return { ...present(existing), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: true }
    }
    return { ...present(existing), clientSecret: null, publishableKey: config.publishableKey, replayed: true }
  }

  const reference = generatedReference("TOP")
  await db.insert(walletTopups).values({
    reference,
    idempotencyKey: input.idempotencyKey,
    walletAccountId: account.id,
    userId: actor.id,
    amountCents: input.amountCents,
    currency: input.currency,
    status: "pending",
    stripeMode: config.mode,
  })

  let intent: IntentSnapshot
  try {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, actor.id)).limit(1)
    intent = await getStripeGateway().createIntent({
      amountCents: input.amountCents,
      currency: input.currency,
      description: `Recharge wallet VTEX ${reference}`,
      metadata: { scope: "wallet", topupReference: reference, walletAccountId: String(account.id), userId: String(actor.id) },
      idempotencyKey: `wallet-topup:${reference}`,
      receiptEmail: owner?.email ?? null,
    })
  } catch (error) {
    await db.update(walletTopups).set({ status: "failed", failureCode: "intent_creation_failed", failureMessage: "Initialisation du paiement impossible.", updatedAt: new Date() }).where(eq(walletTopups.reference, reference))
    throw new ValidationError(error instanceof ValidationError ? error.message : "Impossible d’initialiser le paiement pour le moment. Réessaie dans un instant.")
  }

  await db.update(walletTopups).set({ stripePaymentIntentId: intent.id, updatedAt: new Date() }).where(eq(walletTopups.reference, reference))
  await logAction(db, actor.id, "wallet.topup.create", "wallet_topup", account.id, { reference, amountCents: input.amountCents, currency: input.currency, mode: config.mode })
  const row = await getByReference(reference)
  return { ...present(row), clientSecret: intent.clientSecret, publishableKey: config.publishableKey, replayed: false }
}

/**
 * Crédit unique. Verrou de ligne + garde de statut : même si le navigateur et
 * le webhook arrivent en même temps, le wallet n'est crédité qu'une fois.
 */
async function creditTopup(topupId: number, intent: IntentSnapshot): Promise<{ credited: boolean }> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(walletTopups).where(eq(walletTopups.id, topupId)).for("update")
    if (!locked) throw new NotFoundError("Recharge introuvable.")
    if (locked.status === "succeeded" || locked.status === "refunded") return { credited: false }

    const account = await getAccountOrThrow(executor, locked.walletAccountId)
    // Paiement en XPF sur un wallet en EUR : conversion à la parité fixe (aucun risque de change).
    const creditCents = creditedMinor(locked, account.currency)
    const converted = locked.currency !== account.currency
    const balanceAfter = await changeAvailable(executor, account.id, creditCents)
    const transaction = await insertTransaction(executor, {
      reference: locked.reference,
      idempotencyKey: `topup:${locked.reference}`,
      walletAccountId: account.id,
      initiatedByUserId: locked.userId,
      type: "topup",
      direction: "credit",
      status: "completed",
      amountCents: creditCents,
      feeCents: 0,
      currency: account.currency,
      description: `Recharge par carte ${brandLabel(intent.cardBrand)} •••• ${intent.cardLast4 ?? "----"}${converted ? ` (${formatTopupAmount(locked.amountCents, locked.currency)})` : ""}`,
      metadata: { stripePaymentIntentId: intent.id, stripeMode: locked.stripeMode, cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, paidAmountCents: locked.amountCents, paidCurrency: locked.currency },
      completedAt: new Date(),
    })
    await writeLedger(executor, { accountId: account.id, transactionId: transaction.id, entryKind: "available", deltaCents: creditCents, balanceAfterCents: balanceAfter })
    await executor.update(walletTopups).set({
      status: "succeeded",
      cardBrand: intent.cardBrand,
      cardLast4: intent.cardLast4,
      failureCode: null,
      failureMessage: null,
      transactionId: transaction.id,
      creditedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(walletTopups.id, locked.id))
    await logAction(executor, locked.userId, "wallet.topup.credit", "wallet_topup", locked.id, { reference: locked.reference, amountCents: locked.amountCents, currency: locked.currency, paymentIntent: intent.id, mode: locked.stripeMode })
    await insertWalletNotification(executor, locked.userId, locked.userId, "Recharge confirmée", `Votre recharge de ${formatTopupAmount(locked.amountCents, locked.currency)} a été créditée sur votre wallet.`)
    return { credited: true }
  })
}

/** Relit l'état réel du paiement auprès de Stripe et applique la conséquence, sans jamais faire confiance au navigateur. */
async function settleTopup(row: WalletTopup) {
  if (row.status === "succeeded" || row.status === "refunded") return present(row, await balanceOf(row.walletAccountId, row.currency))
  if (!row.stripePaymentIntentId) return present(row)

  const gateway = getStripeGateway()
  const intent = await gateway.retrieveIntent(row.stripePaymentIntentId)

  if (intent.metadata.topupReference !== row.reference || intent.amountCents !== row.amountCents || intent.currency !== row.currency) {
    await db.update(walletTopups).set({ status: "failed", failureCode: "mismatch", failureMessage: "Le paiement ne correspond pas à la recharge demandée.", updatedAt: new Date() }).where(eq(walletTopups.id, row.id))
    await logAction(db, row.userId, "wallet.topup.mismatch", "wallet_topup", row.id, { reference: row.reference, paymentIntent: intent.id })
    throw new ValidationError("Le paiement ne correspond pas à la recharge demandée. Aucun crédit n’a été effectué.")
  }

  if (intent.status === "succeeded") {
    if (intent.amountReceivedCents !== row.amountCents) throw new ValidationError("Le montant encaissé ne correspond pas à la recharge demandée. Aucun crédit n’a été effectué.")
    await creditTopup(row.id, intent)
  } else if (intent.status === "processing") {
    await db.update(walletTopups).set({ status: "processing", updatedAt: new Date() }).where(and(eq(walletTopups.id, row.id), inArray(walletTopups.status, ["pending", "requires_action", "processing"])))
  } else if (intent.status === "requires_action") {
    await db.update(walletTopups).set({ status: "requires_action", updatedAt: new Date() }).where(and(eq(walletTopups.id, row.id), inArray(walletTopups.status, ["pending", "requires_action", "processing"])))
  } else if (intent.status === "canceled") {
    await db.update(walletTopups).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(walletTopups.id, row.id), inArray(walletTopups.status, ["pending", "requires_action", "processing"])))
  } else if (intent.failureCode || intent.failureMessage) {
    await db.update(walletTopups).set({ status: "failed", cardBrand: intent.cardBrand, cardLast4: intent.cardLast4, failureCode: intent.failureCode?.slice(0, 64) ?? "payment_failed", failureMessage: (intent.failureMessage ?? "Paiement refusé.").slice(0, 250), updatedAt: new Date() }).where(and(eq(walletTopups.id, row.id), inArray(walletTopups.status, ["pending", "requires_action", "processing"])))
    await gateway.cancelIntent(intent.id)
  }

  const fresh = await getByReference(row.reference)
  return present(fresh, await balanceOf(fresh.walletAccountId, fresh.currency))
}

export async function confirmWalletTopup(actor: Actor, reference: string) {
  const row = await getByReference(reference)
  requireSelfOrRole(actor, row.userId, "admin", "agent")
  return settleTopup(row)
}

export async function listMyTopups(actor: Actor, limit = 20) {
  const size = Math.min(Math.max(limit, 1), 50)
  // Ancienneté calculée par la base (NOW() - created_at) : indépendante du fuseau du serveur applicatif.
  const stale = await db.select().from(walletTopups).where(and(
    eq(walletTopups.userId, actor.id),
    inArray(walletTopups.status, ["pending", "requires_action", "processing"]),
    isNotNull(walletTopups.stripePaymentIntentId),
    sql`TIMESTAMPDIFF(SECOND, ${walletTopups.createdAt}, NOW()) > 60`,
  )).limit(5)
  for (const row of stale) {
    try { await settleTopup(row) } catch { /* une recharge ancienne peut ne plus être vérifiable ; la liste reste lisible */ }
  }
  const rows = await db.select().from(walletTopups).where(eq(walletTopups.userId, actor.id)).orderBy(desc(walletTopups.createdAt)).limit(size)
  return rows.map((row) => present(row))
}

/** Webhook Stripe : on ne croit pas la charge utile, on la relit. Renvoie true si la recharge nous appartient. */
export async function handleWalletStripeEvent(event: GatewayEvent): Promise<boolean> {
  if (!event.intentId) return false
  const [row] = await db.select().from(walletTopups).where(eq(walletTopups.stripePaymentIntentId, event.intentId)).limit(1)
  if (!row) return false
  await settleTopup(row)
  return true
}

/* ── Administration (Dashboard) ── */

export function stripeStatusForAdmin(actor: Actor) {
  requireRole(actor, "admin", "agent")
  return stripeAdminStatus()
}

export async function listAdminWalletTopups(actor: Actor, input?: { status?: WalletTopup["status"]; limit?: number }) {
  requireRole(actor, "admin", "agent")
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500)
  return db.select({
    id: walletTopups.id,
    reference: walletTopups.reference,
    createdAt: walletTopups.createdAt,
    creditedAt: walletTopups.creditedAt,
    refundedAt: walletTopups.refundedAt,
    refundReason: walletTopups.refundReason,
    userId: walletTopups.userId,
    userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    userEmail: users.email,
    walletAccountId: walletTopups.walletAccountId,
    amountCents: walletTopups.amountCents,
    currency: walletTopups.currency,
    status: walletTopups.status,
    mode: walletTopups.stripeMode,
    cardBrand: walletTopups.cardBrand,
    cardLast4: walletTopups.cardLast4,
    failureCode: walletTopups.failureCode,
    failureMessage: walletTopups.failureMessage,
    stripePaymentIntentId: walletTopups.stripePaymentIntentId,
    transactionId: walletTopups.transactionId,
  }).from(walletTopups).innerJoin(users, eq(users.id, walletTopups.userId)).where(input?.status ? eq(walletTopups.status, input.status) : undefined).orderBy(desc(walletTopups.createdAt)).limit(limit)
}

/** Relit l'état réel du paiement auprès de Stripe (utile si le navigateur ou le webhook ont manqué la fin). */
export async function reconcileWalletTopup(actor: Actor, reference: string) {
  requireRole(actor, "admin", "agent")
  const row = await getByReference(reference)
  const result = await settleTopup(row)
  await logAction(db, actor.id, "wallet.topup.reconcile", "wallet_topup", row.id, { reference, status: result.status })
  return result
}

export async function cancelWalletTopup(actor: Actor, reference: string) {
  requireRole(actor, "admin")
  const row = await getByReference(reference)
  if (row.status !== "pending" && row.status !== "requires_action") throw new ValidationError("Seule une recharge en attente peut être annulée.")
  if (row.stripePaymentIntentId) {
    try { await getStripeGateway().cancelIntent(row.stripePaymentIntentId) } catch { /* déjà terminée côté Stripe : on annule quand même localement */ }
  }
  await db.update(walletTopups).set({ status: "canceled", updatedAt: new Date() }).where(eq(walletTopups.id, row.id))
  await logAction(db, actor.id, "wallet.topup.cancel", "wallet_topup", row.id, { reference })
  return present(await getByReference(reference))
}

/**
 * Remboursement d'une recharge créditée : le wallet est débité du même montant
 * (refus si le solde ne suffit plus) puis Stripe rembourse la carte. Le tout dans
 * une seule transaction : si Stripe refuse, le ledger revient en arrière.
 */
export async function refundWalletTopup(actor: Actor, input: { reference: string; reason: string }) {
  requireRole(actor, "admin")
  if (input.reason.trim().length < 8) throw new ValidationError("Une justification d’au moins huit caractères est requise.")
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor
    const [locked] = await executor.select().from(walletTopups).where(eq(walletTopups.reference, input.reference)).for("update")
    if (!locked) throw new NotFoundError("Recharge introuvable.")
    if (locked.status !== "succeeded") throw new ValidationError("Seule une recharge créditée peut être remboursée.")
    const account = await getAccountOrThrow(executor, locked.walletAccountId)
    const debitCents = creditedMinor(locked, account.currency)
    const balanceAfter = await changeAvailable(executor, locked.walletAccountId, -debitCents)
    const transaction = await insertTransaction(executor, {
      reference: generatedReference("RFD"),
      idempotencyKey: `topup-refund:${locked.reference}`,
      walletAccountId: locked.walletAccountId,
      initiatedByUserId: actor.id,
      type: "adjustment",
      direction: "debit",
      status: "completed",
      amountCents: debitCents,
      feeCents: 0,
      currency: account.currency,
      description: `Remboursement de la recharge ${locked.reference}`,
      metadata: { topupReference: locked.reference, reason: input.reason.trim() },
      completedAt: new Date(),
    })
    await writeLedger(executor, { accountId: locked.walletAccountId, transactionId: transaction.id, entryKind: "available", deltaCents: -debitCents, balanceAfterCents: balanceAfter })
    if (locked.stripePaymentIntentId) await getStripeGateway().refundIntent(locked.stripePaymentIntentId, `topup-refund:${locked.reference}`)
    await executor.update(walletTopups).set({ status: "refunded", refundedAt: new Date(), refundReason: input.reason.trim(), updatedAt: new Date() }).where(eq(walletTopups.id, locked.id))
    await logAction(executor, actor.id, "wallet.topup.refund", "wallet_topup", locked.id, { reference: locked.reference, amountCents: locked.amountCents, reason: input.reason.trim() })
    await insertWalletNotification(executor, account.userId, actor.id, "Recharge remboursée", `Votre recharge de ${formatTopupAmount(locked.amountCents, locked.currency)} a été remboursée sur votre carte.`)
    return present({ ...locked, status: "refunded", refundedAt: new Date(), refundReason: input.reason.trim() }, canConvert(account.currency, locked.currency) ? convertMinor(balanceAfter, account.currency, locked.currency) : balanceAfter)
  })
}

/* ── Simulateur (développement uniquement) ── */

function requireSim() {
  if (stripePublicConfig().mode !== "sim") throw new ValidationError("Le simulateur de paiement n’est disponible qu’en développement.")
  return getSimGateway()
}

export async function simPayWalletTopup(actor: Actor, input: { reference: string; cardNumber: string }) {
  const sim = requireSim()
  const row = await getByReference(input.reference)
  requireSelfOrRole(actor, row.userId, "admin")
  if (!row.stripePaymentIntentId) throw new ValidationError("Recharge non initialisée.")
  const result = sim.pay(row.stripePaymentIntentId, input.cardNumber)
  return { simStatus: result.status, ...(await settleTopup(row)) }
}

export async function simAuthenticateWalletTopup(actor: Actor, reference: string) {
  const sim = requireSim()
  const row = await getByReference(reference)
  requireSelfOrRole(actor, row.userId, "admin")
  if (!row.stripePaymentIntentId) throw new ValidationError("Recharge non initialisée.")
  sim.authenticate(row.stripePaymentIntentId)
  return settleTopup(row)
}

/** Anciennes recharges jamais finalisées : pour un futur job de nettoyage. */
export async function expireStaleWalletTopups(olderThanMinutes = 60) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const stale = await db.select().from(walletTopups).where(and(eq(walletTopups.status, "pending"), lt(walletTopups.createdAt, cutoff)))
  for (const row of stale) {
    try { await settleTopup(row) } catch { /* ignoré */ }
  }
  return stale.length
}
