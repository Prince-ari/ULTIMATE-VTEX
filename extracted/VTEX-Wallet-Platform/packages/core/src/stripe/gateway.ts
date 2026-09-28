import { randomBytes } from "node:crypto"
import Stripe from "stripe"

import { ValidationError } from "../auth/permissions"
import { floorConvertMinor } from "./fx"

/**
 * Passerelle de paiement par carte (recharge des wallets).
 *
 * Deux implémentations derrière la même interface :
 *  - « real » : Stripe (mode test ou live selon la clé publique) ;
 *  - « sim »  : simulateur local, sans aucun argent, réservé au développement.
 *
 * Règle de sécurité centrale : la passerelle ne décide JAMAIS d'un crédit.
 * Elle ne fait que relayer l'état d'un PaymentIntent ; c'est le service
 * métier qui relit cet état auprès de Stripe (clé secrète) avant de créditer.
 */

export type StripeMode = "sim" | "test" | "live"
export type IntentStatus = "requires_payment_method" | "requires_action" | "processing" | "succeeded" | "canceled"

export type IntentSnapshot = {
  id: string
  status: IntentStatus
  amountCents: number
  amountReceivedCents: number
  currency: string
  metadata: Record<string, string>
  clientSecret: string | null
  cardBrand: string | null
  cardLast4: string | null
  failureCode: string | null
  failureMessage: string | null
}

export type CreateIntentInput = {
  amountCents: number
  currency: string
  description: string
  metadata: Record<string, string>
  idempotencyKey: string
  receiptEmail?: string | null
}

export type GatewayEvent = { type: string; intentId: string | null }

export interface StripeGateway {
  readonly mode: StripeMode
  createIntent(input: CreateIntentInput): Promise<IntentSnapshot>
  retrieveIntent(id: string): Promise<IntentSnapshot>
  cancelIntent(id: string): Promise<void>
  /** Rembourse intégralement un paiement encaissé. Doit lever une erreur si Stripe refuse. */
  refundIntent(id: string, idempotencyKey: string): Promise<void>
  parseWebhook(rawBody: string, signature: string | null): GatewayEvent
}

export type StripePublicConfig = {
  enabled: boolean
  mode: StripeMode | null
  publishableKey: string | null
  reason: string | null
  /** true = le mode réel n'est pas utilisable et le simulateur local a pris le relais (jamais en production). */
  fallback: boolean
}

function settings() {
  const requested = process.env.STRIPE_MODE?.trim().toLowerCase() || "auto"
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || null
  const allowLive = process.env.STRIPE_ALLOW_LIVE_CHARGES?.trim().toLowerCase() === "true"
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null
  return { requested, publishableKey, secretKey, allowLive, webhookSecret }
}

type RealKeys = { ok: true; mode: "test" | "live"; publishableKey: string } | { ok: false; reason: string }

/** Vérifie que la paire de clés est cohérente (sans appeler Stripe). */
function realKeys(s: ReturnType<typeof settings>): RealKeys {
  const mode: "test" | "live" | null = s.publishableKey?.startsWith("pk_live_") ? "live" : s.publishableKey?.startsWith("pk_test_") ? "test" : null
  if (!mode || !s.publishableKey) return { ok: false, reason: "Clé publique Stripe absente (attendu : pk_live_… ou pk_test_…)." }
  if (!s.secretKey || !/^(sk|rk)_(live|test)_/.test(s.secretKey)) return { ok: false, reason: "Clé secrète Stripe absente ou invalide (attendu : sk_live_… / sk_test_… ou une clé restreinte rk_…)." }
  if (!s.secretKey.includes(`_${mode}_`)) return { ok: false, reason: `Clé secrète et clé publique de modes différents (la publique est en ${mode}).` }
  return { ok: true, mode, publishableKey: s.publishableKey }
}

/** État de la configuration, sans jamais exposer la clé secrète. */
export function stripePublicConfig(): StripePublicConfig {
  const s = settings()
  const production = process.env.NODE_ENV === "production"
  if (s.requested === "sim") {
    if (production) return { enabled: false, mode: null, publishableKey: null, reason: "Le simulateur de paiement est interdit en production.", fallback: false }
    return { enabled: true, mode: "sim", publishableKey: null, reason: "Simulation locale forcée (STRIPE_MODE=sim).", fallback: false }
  }
  const keys = realKeys(s)
  if (keys.ok) {
    if (keys.mode === "live" && !s.allowLive) return { enabled: false, mode: "live", publishableKey: keys.publishableKey, reason: "Paiements réels verrouillés : STRIPE_ALLOW_LIVE_CHARGES doit valoir « true » pour accepter de vraies cartes.", fallback: false }
    return { enabled: true, mode: keys.mode, publishableKey: keys.publishableKey, reason: null, fallback: false }
  }
  // Développement : on reste utilisable avec le simulateur tant que les vraies clés ne sont pas valides.
  if (!production && s.requested !== "real") return { enabled: true, mode: "sim", publishableKey: null, reason: `Stripe réel inactif — ${keys.reason} Simulation locale en attendant.`, fallback: true }
  return { enabled: false, mode: null, publishableKey: s.publishableKey, reason: keys.reason, fallback: false }
}

/** Diagnostic pour le Dashboard : jamais de valeur secrète, seulement des indicateurs. */
export function stripeAdminStatus() {
  const s = settings()
  const config = stripePublicConfig()
  const keys = realKeys(s)
  return {
    ...config,
    requestedMode: s.requested,
    liveUnlocked: s.allowLive,
    publishableKeyHint: s.publishableKey ? `${s.publishableKey.slice(0, 8)}…${s.publishableKey.slice(-4)}` : null,
    secretKeyKind: !s.secretKey ? null : /^sk_(live|test)_/.test(s.secretKey) ? "sk" : /^rk_(live|test)_/.test(s.secretKey) ? "rk" : "invalide",
    realKeysUsable: keys.ok,
    realKeysProblem: keys.ok ? null : keys.reason,
    hasWebhookSecret: Boolean(s.webhookSecret),
    webhookPath: "/api/stripe/webhook",
    /** Plafonds appliqués par portefeuille (wallet perso / Wallet Pro), en unité mineure de chaque devise. */
    limits: {
      wallet: limitsSummary("wallet"),
      business: limitsSummary("business"),
    },
  }
}

/**
 * Plafonds de recharge (décision produit), par portefeuille :
 *  - wallet personnel : 2 000 € maximum PAR recharge ;
 *  - Wallet Pro : 5 000 € maximum PAR recharge ;
 *  - dans les deux cas, 5 000 € maximum de recharges cumulées par 24 h glissantes et par portefeuille
 *    (wallet : par utilisateur ; Wallet Pro : par entreprise, tous comptes confondus).
 * Le franc Pacifique reçoit l'équivalent exact à la parité fixe, arrondi vers le bas pour ne jamais dépasser le plafond en euros.
 * C'est ici — et seulement ici — qu'on règle ces montants.
 */
export type TopupScope = "wallet" | "business"
export const TOPUP_MAX_EUR_CENTS: Record<TopupScope, number> = { wallet: 2_000 * 100, business: 5_000 * 100 }
export const TOPUP_DAILY_MAX_EUR_CENTS = 5_000 * 100

function capIn(eurCents: number, currency: string) {
  return currency === "XPF" ? floorConvertMinor(eurCents, "EUR", "XPF") : eurCents
}

/** Plafonds exprimés en unité minimale de la devise de paiement (XPF = francs). */
export function topupLimits(currency: string, scope: TopupScope): { minCents: number; maxCents: number; dailyMaxCents: number } {
  const cur = currency.toUpperCase()
  const minCents = cur === "XPF" ? (scope === "business" ? 1200 : 600) : scope === "business" ? 1000 : 500
  return { minCents, maxCents: capIn(TOPUP_MAX_EUR_CENTS[scope], cur), dailyMaxCents: capIn(TOPUP_DAILY_MAX_EUR_CENTS, cur) }
}

/** Résumé pour le Dashboard : plafonds d'un portefeuille en euros et en francs Pacifique. */
function limitsSummary(scope: TopupScope) {
  const eur = topupLimits("EUR", scope)
  const xpf = topupLimits("XPF", scope)
  return {
    eur: { perRechargeCents: eur.maxCents, dailyCents: eur.dailyMaxCents },
    xpf: { perRechargeCents: xpf.maxCents, dailyCents: xpf.dailyMaxCents },
  }
}

/** Reste de plafond quotidien dans la devise demandée, à partir de l'utilisé exprimé en centimes d'euro. */
export function topupDailyRemaining(currency: string, usedEurCents: number): number {
  const cur = currency.toUpperCase()
  const remainingEur = Math.max(0, TOPUP_DAILY_MAX_EUR_CENTS - usedEurCents)
  return cur === "XPF" ? floorConvertMinor(remainingEur, "EUR", "XPF") : remainingEur
}

/** Tous les plafonds d'un coup (le navigateur change de devise sans nouvel aller-retour). */
export function topupLimitsByCurrency(scope: "wallet" | "business", usedEurCents: number, currencies: string[] = ["EUR", "XPF"]) {
  const out: Record<string, { minCents: number; maxCents: number; dailyMaxCents: number; dailyRemainingCents: number; effectiveMaxCents: number }> = {}
  for (const currency of currencies) {
    const limits = topupLimits(currency, scope)
    const dailyRemainingCents = topupDailyRemaining(currency, usedEurCents)
    out[currency] = { ...limits, dailyRemainingCents, effectiveMaxCents: Math.min(limits.maxCents, dailyRemainingCents) }
  }
  return out
}

/* ───────────────────────────── Stripe réel ───────────────────────────── */

function mapStatus(status: Stripe.PaymentIntent.Status): IntentStatus {
  switch (status) {
    case "succeeded": return "succeeded"
    case "processing":
    case "requires_capture": return "processing"
    case "canceled": return "canceled"
    case "requires_action":
    case "requires_confirmation": return "requires_action"
    default: return "requires_payment_method"
  }
}

function snapshotOf(pi: Stripe.PaymentIntent): IntentSnapshot {
  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
  const method = pi.payment_method && typeof pi.payment_method === "object" ? pi.payment_method : null
  const card = charge?.payment_method_details?.card ?? method?.card ?? null
  const error = pi.last_payment_error
  return {
    id: pi.id,
    status: mapStatus(pi.status),
    amountCents: pi.amount,
    amountReceivedCents: pi.amount_received,
    currency: pi.currency.toUpperCase(),
    metadata: { ...(pi.metadata ?? {}) },
    clientSecret: pi.client_secret,
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
    failureCode: error?.decline_code ?? error?.code ?? null,
    failureMessage: error?.message ?? null,
  }
}

class RealGateway implements StripeGateway {
  readonly mode: StripeMode
  private readonly stripe: Stripe
  private readonly webhookSecret: string | null

  constructor(mode: StripeMode, secretKey: string, webhookSecret: string | null) {
    this.mode = mode
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: "VTEX Wallet", version: "1.0.0" } })
    this.webhookSecret = webhookSecret
  }

  async createIntent(input: CreateIntentInput): Promise<IntentSnapshot> {
    const pi = await this.stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      payment_method_types: ["card"],
      description: input.description,
      metadata: input.metadata,
      receipt_email: input.receiptEmail ?? undefined,
    }, { idempotencyKey: input.idempotencyKey })
    return snapshotOf(pi)
  }

  async retrieveIntent(id: string): Promise<IntentSnapshot> {
    const pi = await this.stripe.paymentIntents.retrieve(id, { expand: ["latest_charge", "payment_method"] })
    return snapshotOf(pi)
  }

  async cancelIntent(id: string): Promise<void> {
    try { await this.stripe.paymentIntents.cancel(id) } catch { /* déjà terminé ou annulé : sans conséquence */ }
  }

  async refundIntent(id: string, idempotencyKey: string): Promise<void> {
    try {
      await this.stripe.refunds.create({ payment_intent: id }, { idempotencyKey })
    } catch (error) {
      throw new ValidationError(`Stripe a refusé le remboursement : ${error instanceof Error ? error.message : "erreur inconnue"}`)
    }
  }

  parseWebhook(rawBody: string, signature: string | null): GatewayEvent {
    if (!this.webhookSecret) throw new ValidationError("Le webhook Stripe n’est pas configuré (STRIPE_WEBHOOK_SECRET manquant).")
    if (!signature) throw new ValidationError("Signature Stripe absente.")
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    const object = event.data.object as { id?: unknown; object?: unknown }
    const intentId = object.object === "payment_intent" && typeof object.id === "string" ? object.id : null
    return { type: event.type, intentId }
  }
}

/* ───────────────────────────── Simulateur ───────────────────────────── */

const DECLINES: Record<string, { code: string; message: string }> = {
  "4000000000000002": { code: "card_declined", message: "Ta banque a décliné la transaction." },
  "4000000000009995": { code: "insufficient_funds", message: "Fonds insuffisants sur la carte." },
  "4000000000000069": { code: "expired_card", message: "La carte est expirée." },
}
const THREE_DS = new Set(["4000002760003184", "4000002500003155"])

function luhn(digits: string) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

function brandOfNumber(digits: string) {
  if (/^4/.test(digits)) return "visa"
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard"
  if (/^3[47]/.test(digits)) return "amex"
  return "unknown"
}

export type SimPayResult = { status: IntentStatus; failureCode: string | null; failureMessage: string | null }

export class SimGateway implements StripeGateway {
  readonly mode: StripeMode = "sim"
  private readonly store: Map<string, IntentSnapshot>
  private readonly idempotent: Map<string, string>

  constructor() {
    const g = globalThis as unknown as { __vtexSimIntents?: Map<string, IntentSnapshot>; __vtexSimKeys?: Map<string, string> }
    g.__vtexSimIntents ??= new Map()
    g.__vtexSimKeys ??= new Map()
    this.store = g.__vtexSimIntents
    this.idempotent = g.__vtexSimKeys
  }

  async createIntent(input: CreateIntentInput): Promise<IntentSnapshot> {
    const known = this.idempotent.get(input.idempotencyKey)
    if (known && this.store.has(known)) return { ...this.store.get(known)! }
    const id = `pi_sim_${randomBytes(9).toString("hex")}`
    const snapshot: IntentSnapshot = {
      id, status: "requires_payment_method", amountCents: input.amountCents, amountReceivedCents: 0,
      currency: input.currency.toUpperCase(), metadata: { ...input.metadata }, clientSecret: `${id}_secret_${randomBytes(6).toString("hex")}`,
      cardBrand: null, cardLast4: null, failureCode: null, failureMessage: null,
    }
    this.store.set(id, snapshot)
    this.idempotent.set(input.idempotencyKey, id)
    return { ...snapshot }
  }

  async retrieveIntent(id: string): Promise<IntentSnapshot> {
    const found = this.store.get(id)
    if (!found) throw new ValidationError("Intention de paiement simulée introuvable (le serveur de développement a redémarré). Recommence la recharge.")
    return { ...found }
  }

  async cancelIntent(id: string): Promise<void> {
    const found = this.store.get(id)
    if (found && found.status !== "succeeded") found.status = "canceled"
  }

  async refundIntent(): Promise<void> {
    /* Simulation : aucun argent réel à rendre. */
  }

  parseWebhook(): GatewayEvent { throw new ValidationError("Aucun webhook en mode simulation.") }

  /** Équivalent local de stripe.confirmPayment : jamais de vrai numéro, seulement des numéros de test. */
  pay(id: string, cardNumber: string): SimPayResult {
    const found = this.store.get(id)
    if (!found) throw new ValidationError("Intention de paiement simulée introuvable.")
    if (found.status === "succeeded" || found.status === "canceled") throw new ValidationError("Cette recharge est déjà terminée.")
    const digits = cardNumber.replace(/\D/g, "")
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) {
      found.status = "requires_payment_method"; found.failureCode = "incorrect_number"; found.failureMessage = "Le numéro de carte est invalide."
      return { status: found.status, failureCode: found.failureCode, failureMessage: found.failureMessage }
    }
    found.cardBrand = brandOfNumber(digits)
    found.cardLast4 = digits.slice(-4)
    const decline = DECLINES[digits]
    if (decline) {
      found.status = "requires_payment_method"; found.failureCode = decline.code; found.failureMessage = decline.message
    } else if (THREE_DS.has(digits)) {
      found.status = "requires_action"; found.failureCode = null; found.failureMessage = null
    } else {
      found.status = "succeeded"; found.amountReceivedCents = found.amountCents; found.failureCode = null; found.failureMessage = null
    }
    return { status: found.status, failureCode: found.failureCode, failureMessage: found.failureMessage }
  }

  /** Équivalent local de la fenêtre 3D Secure de la banque. */
  authenticate(id: string): SimPayResult {
    const found = this.store.get(id)
    if (!found) throw new ValidationError("Intention de paiement simulée introuvable.")
    if (found.status !== "requires_action") throw new ValidationError("Aucune validation bancaire n’est attendue pour cette recharge.")
    found.status = "succeeded"; found.amountReceivedCents = found.amountCents
    return { status: found.status, failureCode: null, failureMessage: null }
  }
}

/* ───────────────────────────── Fabrique ───────────────────────────── */

let cached: { key: string; gateway: StripeGateway } | null = null

export function getStripeGateway(): StripeGateway {
  const config = stripePublicConfig()
  if (!config.enabled || !config.mode) throw new ValidationError(config.reason ?? "Les recharges par carte ne sont pas disponibles.")
  const s = settings()
  const key = `${config.mode}:${s.secretKey?.slice(-6) ?? ""}:${s.webhookSecret ? "w" : "-"}`
  if (cached && cached.key === key) return cached.gateway
  const gateway: StripeGateway = config.mode === "sim" ? new SimGateway() : new RealGateway(config.mode, s.secretKey!, s.webhookSecret)
  cached = { key, gateway }
  return gateway
}

export function getSimGateway(): SimGateway {
  const gateway = getStripeGateway()
  if (!(gateway instanceof SimGateway)) throw new ValidationError("Le simulateur de paiement n’est disponible qu’en mode STRIPE_MODE=sim.")
  return gateway
}
