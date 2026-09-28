import {
  EMPTY_CARD_VAULT_STATUS,
  NotFoundError,
  ValidationError,
  VaultIntegrityError,
  VaultUnavailableError,
  cardVaultStatus,
  cardVaultStatuses,
  checkRateLimit,
  clearCardSecrets,
  db,
  detectNetwork,
  logAction,
  normalizeCvv,
  normalizePan,
  normalizePin,
  protectedProcedure,
  requirePermission,
  revealCardSecrets,
  router,
  storeCardSecrets,
  users,
  type Actor,
  type CardRef,
  type CardVaultStatus,
  type Db,
  type RevealedCardSecrets,
  type WalletType,
} from "@vtex/core"
import { businessCards, businessTransactions, businessWalletAccounts, businesses, setBusinessCardFrozen, updateBusinessCardControls } from "@vtex/business"
import { cancelCard, cards, hashCardPin, renewCard, replaceCard, setCardFrozen, transactions, updateCardControls, walletAccounts } from "@vtex/wallet"
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

/**
 * Cartes (Dashboard) — vue unifiée des cartes personnelles et Wallet Pro, et coffre des données saisies par l'administrateur.
 *
 * Règles :
 *  - lister / ouvrir une carte ne renvoie JAMAIS le numéro, le CVV ni le PIN (seulement leur présence) ;
 *  - saisir ou révéler ces valeurs exige `cards.vault.write` / `cards.reveal` (SUPER_ADMIN), vérifié ici, côté serveur ;
 *  - chaque saisie, révélation, effacement (et chaque échec) est journalisé — sans jamais écrire une valeur dans le journal ;
 *  - une révélation est une MUTATION (POST, jamais mise en cache) limitée en débit, et l'interface remasque seule.
 */

/** Durée après laquelle l'interface remasque une carte révélée (indication renvoyée au client ; le serveur ne garde aucun état). */
export const REVEAL_MASK_AFTER_SECONDS = 30

const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const cardRefSchema = z.object({ walletType: walletTypeSchema, cardId: z.number().int().positive() })

const adminWriteProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})

const revealProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `cards:reveal:${ctx.actor.id}`, 30, 60_000)
  return next()
})

export interface CardRecord {
  walletType: WalletType
  id: number
  label: string
  network: "visa" | "mastercard" | "cb"
  lastFour: string
  cardholderName: string
  status: "active" | "frozen" | "expired" | "cancelled"
  expiresAt: Date
  createdAt: Date
  currency: string
  accountId: number
  theme: "navy" | "teal" | "brick" | null
  holder: { kind: "user" | "business"; id: number; name: string; email: string | null }
  assignee: { id: number; name: string } | null
  controls: { online: boolean; contactless: boolean; cash: boolean }
  limits: { perTransactionCents: number; dailyCents: number; monthlyCents: number }
  /** Dernier paiement carte terminé (null : jamais utilisée). */
  lastUsedAt: Date | null
  /** Fin de la référence de jeton du prestataire : identifie la carte côté prestataire sans exposer le jeton. */
  tokenTail: string
  /** Interne : jamais renvoyé au client. */
  tokenReference: string
}

const tokenTailOf = (reference: string) => reference.slice(-8)

const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim()

async function personalCards(executor: Db, where?: SQL): Promise<CardRecord[]> {
  const rows = await executor
    .select({ card: cards, account: walletAccounts, owner: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email } })
    .from(cards)
    .innerJoin(walletAccounts, eq(cards.walletAccountId, walletAccounts.id))
    .innerJoin(users, eq(users.id, walletAccounts.userId))
    .where(where)
    .orderBy(desc(cards.createdAt))
    .limit(500)
  return rows.map(({ card, account, owner }) => ({
    walletType: "PERSONAL" as const,
    id: card.id,
    label: card.label,
    network: card.network,
    lastFour: card.lastFour,
    cardholderName: card.cardholderName,
    status: card.status,
    expiresAt: card.expiresAt,
    createdAt: card.createdAt,
    currency: account.currency,
    accountId: account.id,
    theme: null,
    holder: { kind: "user" as const, id: owner.id, name: fullName(owner), email: owner.email },
    assignee: null,
    controls: { online: card.onlinePaymentsEnabled, contactless: card.contactlessEnabled, cash: card.cashWithdrawalEnabled },
    limits: { perTransactionCents: card.perTransactionLimitCents, dailyCents: card.dailyLimitCents, monthlyCents: card.monthlyLimitCents },
    lastUsedAt: null,
    tokenTail: tokenTailOf(card.tokenReference),
    tokenReference: card.tokenReference,
  }))
}

async function professionalCards(executor: Db, where?: SQL): Promise<CardRecord[]> {
  const rows = await executor
    .select({
      card: businessCards,
      account: businessWalletAccounts,
      business: { id: businesses.id, brandName: businesses.brandName, email: businesses.email },
      assignee: { id: users.id, firstName: users.firstName, lastName: users.lastName },
    })
    .from(businessCards)
    .innerJoin(businessWalletAccounts, eq(businessCards.businessWalletAccountId, businessWalletAccounts.id))
    .innerJoin(businesses, eq(businesses.id, businessWalletAccounts.businessId))
    .leftJoin(users, eq(users.id, businessCards.assignedToUserId))
    .where(where)
    .orderBy(desc(businessCards.createdAt))
    .limit(500)
  return rows.map(({ card, account, business, assignee }) => ({
    walletType: "PROFESSIONAL" as const,
    id: card.id,
    label: card.label,
    network: card.network,
    lastFour: card.lastFour,
    cardholderName: card.cardholderName,
    status: card.status,
    expiresAt: card.expiresAt,
    createdAt: card.createdAt,
    currency: account.currency,
    accountId: account.id,
    theme: card.theme,
    holder: { kind: "business" as const, id: business.id, name: business.brandName, email: business.email },
    assignee: assignee && assignee.id !== null ? { id: assignee.id, name: fullName(assignee) } : null,
    controls: { online: card.onlinePaymentsEnabled, contactless: card.contactlessEnabled, cash: card.cashWithdrawalEnabled },
    limits: { perTransactionCents: card.perTransactionLimitCents, dailyCents: card.dailyLimitCents, monthlyCents: card.monthlyLimitCents },
    lastUsedAt: null,
    tokenTail: tokenTailOf(card.tokenReference),
    tokenReference: card.tokenReference,
  }))
}

async function loadCard(executor: Db, ref: CardRef): Promise<CardRecord> {
  const [record] = ref.walletType === "PERSONAL" ? await personalCards(executor, eq(cards.id, ref.cardId)) : await professionalCards(executor, eq(businessCards.id, ref.cardId))
  if (!record) throw new NotFoundError(`Carte #${ref.cardId} introuvable.`)
  return record
}

/** Dernière utilisation connue : dernier paiement par carte terminé, en une requête par type de wallet. */
async function withLastUsed(executor: Db, records: CardRecord[]): Promise<CardRecord[]> {
  const personalIds = records.filter((record) => record.walletType === "PERSONAL").map((record) => record.id)
  const professionalIds = records.filter((record) => record.walletType === "PROFESSIONAL").map((record) => record.id)
  const [personalRows, professionalRows] = await Promise.all([
    personalIds.length ? executor.select({ cardId: transactions.cardId, last: sql<string | Date>`MAX(${transactions.createdAt})` }).from(transactions).where(and(inArray(transactions.cardId, personalIds), eq(transactions.type, "card_payment"), eq(transactions.status, "completed"))).groupBy(transactions.cardId) : Promise.resolve([]),
    professionalIds.length ? executor.select({ cardId: businessTransactions.cardId, last: sql<string | Date>`MAX(${businessTransactions.createdAt})` }).from(businessTransactions).where(and(inArray(businessTransactions.cardId, professionalIds), eq(businessTransactions.type, "card_payment"), eq(businessTransactions.status, "completed"))).groupBy(businessTransactions.cardId) : Promise.resolve([]),
  ])
  const asDate = (value: string | Date | null) => (value === null ? null : value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`))
  const personalMap = new Map(personalRows.map((row) => [row.cardId, asDate(row.last)]))
  const professionalMap = new Map(professionalRows.map((row) => [row.cardId, asDate(row.last)]))
  return records.map((record) => ({ ...record, lastUsedAt: (record.walletType === "PERSONAL" ? personalMap : professionalMap).get(record.id) ?? null }))
}

/** Représentation publique : sans jeton interne, avec l'état (masqué) du coffre. */
function publicCard(record: CardRecord, vault: CardVaultStatus) {
  const { tokenReference: _token, ...rest } = record
  return { ...rest, vault }
}

const auditScope = (record: CardRecord) => ({ walletType: record.walletType, holderId: record.holder.id })

const listInput = z
  .object({
    search: z.string().trim().max(100).optional(),
    walletType: walletTypeSchema.optional(),
    status: z.enum(["active", "frozen", "expired", "cancelled"]).optional(),
    vault: z.enum(["filled", "empty"]).optional(),
  })
  .optional()

/** Toutes les cartes (500 par type au plus, les plus récentes d'abord), filtrables, avec l'état du coffre — jamais une valeur. */
export async function listAdminCardsUnified(actor: Actor, filters: z.infer<typeof listInput> = {}) {
  requirePermission(actor, "cards.read")
  const wanted = filters?.walletType
  const [personalRaw, professionalRaw] = await Promise.all([
    wanted === "PROFESSIONAL" ? Promise.resolve([]) : personalCards(db),
    wanted === "PERSONAL" ? Promise.resolve([]) : professionalCards(db),
  ])
  const enriched = await withLastUsed(db, [...personalRaw, ...professionalRaw])
  const personal = enriched.filter((record) => record.walletType === "PERSONAL")
  const professional = enriched.filter((record) => record.walletType === "PROFESSIONAL")
  const [personalVault, professionalVault] = await Promise.all([
    cardVaultStatuses(db, "PERSONAL", personal.map((card) => card.id)),
    cardVaultStatuses(db, "PROFESSIONAL", professional.map((card) => card.id)),
  ])
  const needle = filters?.search?.toLowerCase()
  const all = [
    ...personal.map((card) => publicCard(card, personalVault.get(card.id) ?? EMPTY_CARD_VAULT_STATUS)),
    ...professional.map((card) => publicCard(card, professionalVault.get(card.id) ?? EMPTY_CARD_VAULT_STATUS)),
  ]
  return all
    .filter((card) => !filters?.status || card.status === filters.status)
    .filter((card) => !filters?.vault || (filters.vault === "filled" ? card.vault.hasPan : !card.vault.hasPan))
    .filter((card) => !needle || [card.holder.name, card.holder.email ?? "", card.label, card.lastFour, card.cardholderName, card.assignee?.name ?? ""].some((value) => value.toLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getAdminCard(actor: Actor, ref: CardRef) {
  requirePermission(actor, "cards.read")
  const record = (await withLastUsed(db, [await loadCard(db, ref)]))[0]!
  const vault = await cardVaultStatus(db, ref)
  let lastRevealedByName: string | null = null
  if (vault.lastRevealedBy) {
    const [reader] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, vault.lastRevealedBy)).limit(1)
    lastRevealedByName = reader ? fullName(reader) : null
  }
  return { ...publicCard(record, vault), lastRevealedByName }
}

/** Date d'expiration = dernier jour du mois indiqué (convention des cartes : valable jusqu'à la fin du mois). */
export function expiryFromMonthYear(month: number, year: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59))
}

export function expiryParts(date: Date): { month: number; year: number } {
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() }
}

const setDataInput = cardRefSchema
  .extend({
    pan: z.string().max(32).optional(),
    cvv: z.string().max(4).optional(),
    pin: z.string().max(4).optional(),
    expiryMonth: z.number().int().min(1).max(12).optional(),
    expiryYear: z.number().int().min(2000).max(2100).optional(),
    cardholderName: z.string().trim().min(2).max(140).optional(),
  })
  .superRefine((input, ctx) => {
    if ((input.expiryMonth === undefined) !== (input.expiryYear === undefined)) ctx.addIssue({ code: "custom", path: ["expiryMonth"], message: "Indiquez le mois et l'année d'expiration ensemble." })
    if ([input.pan, input.cvv, input.pin, input.expiryMonth, input.cardholderName].every((value) => value === undefined)) ctx.addIssue({ code: "custom", path: ["pan"], message: "Renseignez au moins une donnée de carte." })
  })

export type SetCardDataInput = z.infer<typeof setDataInput>

function wrapVaultError(error: unknown): never {
  if (error instanceof VaultUnavailableError) throw new ValidationError("Le coffre de données de carte n'est pas configuré sur ce serveur (VTEX_VAULT_KEYS).")
  if (error instanceof VaultIntegrityError) throw new ValidationError("Les données de cette carte sont illisibles : clé de coffre absente ou contenu altéré. Ressaisissez-les.")
  throw error
}

/**
 * Enregistre les données saisies par l'administrateur : chiffrées dans le coffre ; la ligne de carte reste cohérente
 * (quatre derniers chiffres, expiration, titulaire, réseau, empreinte du PIN pour une carte personnelle). Tout ou rien.
 */
export async function setCardData(actor: Actor, input: SetCardDataInput) {
  requirePermission(actor, "cards.vault.write")
  const ref: CardRef = { walletType: input.walletType, cardId: input.cardId }
  const record = await loadCard(db, ref)
  if (record.status === "cancelled") throw new ValidationError("Cette carte est annulée : ses données ne peuvent plus être saisies.")

  const pan = input.pan !== undefined ? normalizePan(input.pan) : undefined
  const cvv = input.cvv !== undefined ? normalizeCvv(input.cvv) : undefined
  const pin = input.pin !== undefined ? normalizePin(input.pin) : undefined

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  const changed: string[] = []
  if (pan !== undefined) {
    patch.lastFour = pan.slice(-4)
    const detected = detectNetwork(pan)
    if ((detected === "visa" || detected === "mastercard") && record.network !== "cb" && record.network !== detected) patch.network = detected
    changed.push("pan")
  }
  if (cvv !== undefined) changed.push("cvv")
  if (pin !== undefined) {
    changed.push("pin")
    if (record.walletType === "PERSONAL") { patch.pinHash = hashCardPin(pin, record.tokenReference); patch.pinUpdatedAt = new Date() }
  }
  if (input.expiryMonth !== undefined && input.expiryYear !== undefined) {
    const expiresAt = expiryFromMonthYear(input.expiryMonth, input.expiryYear)
    if (expiresAt.getTime() < Date.now()) throw new ValidationError("La date d'expiration est dépassée.")
    patch.expiresAt = expiresAt
    changed.push("expiry")
  }
  if (input.cardholderName !== undefined) { patch.cardholderName = input.cardholderName; changed.push("holder") }

  try {
    await db.transaction(async (tx) => {
      const executor = tx as unknown as Db
      if (pan !== undefined || cvv !== undefined || pin !== undefined) await storeCardSecrets(executor, ref, { pan, cvv, pin, setBy: actor.id })
      if (record.walletType === "PERSONAL") await executor.update(cards).set(patch).where(eq(cards.id, record.id))
      else await executor.update(businessCards).set(patch).where(eq(businessCards.id, record.id))
      // Le journal ne reçoit que les NOMS des champs et les quatre derniers chiffres (déjà visibles sur la carte).
      await logAction(executor, actor.id, "card.vault.set", record.walletType === "PERSONAL" ? "card" : "business_card", record.id, { fields: changed, lastFour: (patch.lastFour as string | undefined) ?? record.lastFour }, auditScope(record))
    })
  } catch (error) {
    wrapVaultError(error)
  }
  return getAdminCard(actor, ref)
}

/**
 * Révèle numéro, CVV et PIN d'une carte. Chaque appel est journalisé (qui, quand, quelle carte, quels champs — jamais les valeurs).
 * La réponse porte `maskAfterSeconds` : l'interface remasque seule ; le client ne doit rien conserver.
 */
export async function revealCardData(actor: Actor, ref: CardRef) {
  requirePermission(actor, "cards.reveal")
  const record = await loadCard(db, ref)
  const targetType = record.walletType === "PERSONAL" ? "card" : "business_card"
  let secrets: RevealedCardSecrets
  try {
    secrets = await revealCardSecrets(db, ref, actor.id)
  } catch (error) {
    await logAction(db, actor.id, "card.vault.reveal_failed", targetType, record.id, { reason: error instanceof VaultIntegrityError ? "integrity" : error instanceof VaultUnavailableError ? "unavailable" : "error" }, auditScope(record))
    wrapVaultError(error)
  }
  const fields = (["pan", "cvv", "pin"] as const).filter((field) => secrets[field] !== null)
  if (fields.length > 0) await logAction(db, actor.id, "card.vault.reveal", targetType, record.id, { fields, maskAfterSeconds: REVEAL_MASK_AFTER_SECONDS }, auditScope(record))
  const expiry = expiryParts(record.expiresAt)
  return {
    walletType: record.walletType,
    cardId: record.id,
    pan: secrets.pan,
    cvv: secrets.cvv,
    pin: secrets.pin,
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    cardholderName: record.cardholderName,
    network: record.network,
    lastFour: record.lastFour,
    revealedAt: new Date(),
    maskAfterSeconds: REVEAL_MASK_AFTER_SECONDS,
  }
}

export async function clearCardData(actor: Actor, ref: CardRef, fields?: ("pan" | "cvv" | "pin")[]) {
  requirePermission(actor, "cards.vault.write")
  const record = await loadCard(db, ref)
  const wanted: ("pan" | "cvv" | "pin")[] = fields && fields.length > 0 ? [...new Set(fields)] : ["pan", "cvv", "pin"]
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    await clearCardSecrets(executor, ref, wanted)
    if (record.walletType === "PERSONAL" && wanted.includes("pin")) await executor.update(cards).set({ pinHash: null, pinUpdatedAt: null, updatedAt: new Date() }).where(eq(cards.id, record.id))
    await logAction(executor, actor.id, "card.vault.clear", record.walletType === "PERSONAL" ? "card" : "business_card", record.id, { fields: wanted }, auditScope(record))
  })
  return getAdminCard(actor, ref)
}

/** Sous-routeur `admin.cards` : branché dans `admin` (admin.ts) — tRPC n'accepte pas deux routeurs de même clé à la fusion. */
const controlsInput = cardRefSchema.extend({
  onlinePaymentsEnabled: z.boolean().optional(),
  contactlessEnabled: z.boolean().optional(),
  cashWithdrawalEnabled: z.boolean().optional(),
  perTransactionLimitCents: z.number().int().positive().safe().optional(),
  dailyLimitCents: z.number().int().positive().safe().optional(),
  monthlyLimitCents: z.number().int().positive().safe().optional(),
})

/** Geler / dégeler : la source de vérité est la base ; le Wallet du titulaire relit l'état à sa prochaine requête. */
export async function setCardFrozenAdmin(actor: Actor, ref: CardRef, frozen: boolean) {
  requirePermission(actor, "cards.manage")
  const record = await loadCard(db, ref)
  if (ref.walletType === "PERSONAL") await setCardFrozen(actor, ref.cardId, frozen)
  else await setBusinessCardFrozen(actor, record.holder.id, ref.cardId, frozen)
  return getAdminCard(actor, ref)
}

/** Canaux autorisés et plafonds. Les plafonds se saisissent en montants positifs dans la devise du compte de la carte. */
export async function updateCardControlsAdmin(actor: Actor, input: z.infer<typeof controlsInput>) {
  requirePermission(actor, "cards.manage")
  const ref: CardRef = { walletType: input.walletType, cardId: input.cardId }
  const record = await loadCard(db, ref)
  if (record.status === "cancelled" || record.status === "expired") throw new ValidationError("Cette carte ne peut plus être modifiée.")
  const controls = { onlinePaymentsEnabled: input.onlinePaymentsEnabled, contactlessEnabled: input.contactlessEnabled, cashWithdrawalEnabled: input.cashWithdrawalEnabled }
  const limits = { perTransactionLimitCents: input.perTransactionLimitCents, dailyLimitCents: input.dailyLimitCents, monthlyLimitCents: input.monthlyLimitCents }
  const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> }
  const controlsPatch = clean(controls)
  const limitsPatch = clean(limits)
  if (Object.keys(controlsPatch).length + Object.keys(limitsPatch).length === 0) throw new ValidationError("Aucune modification à enregistrer.")
  const effective = { per: limitsPatch.perTransactionLimitCents ?? record.limits.perTransactionCents, day: limitsPatch.dailyLimitCents ?? record.limits.dailyCents, month: limitsPatch.monthlyLimitCents ?? record.limits.monthlyCents }
  if (effective.per > effective.day || effective.day > effective.month) throw new ValidationError("Les plafonds doivent respecter : par opération ≤ par jour ≤ par mois.")
  if (ref.walletType === "PERSONAL") await updateCardControls(actor, ref.cardId, controlsPatch, limitsPatch)
  else await updateBusinessCardControls(actor, record.holder.id, ref.cardId, { ...controlsPatch, ...limitsPatch })
  return getAdminCard(actor, ref)
}

function requirePersonal(ref: CardRef) {
  if (ref.walletType !== "PERSONAL") throw new ValidationError("Cette action n'est disponible que pour les cartes du Wallet personnel.")
}

export async function cancelCardAdmin(actor: Actor, ref: CardRef) {
  requirePermission(actor, "cards.manage")
  requirePersonal(ref)
  await loadCard(db, ref)
  await cancelCard(actor, ref.cardId)
  return getAdminCard(actor, ref)
}

/** Renouvellement / remplacement : émet une nouvelle carte et annule l'ancienne (et purge son coffre). Renvoie la nouvelle carte. */
export async function reissueCardAdmin(actor: Actor, input: { walletType: WalletType; cardId: number; action: "renew" | "replace"; reason?: string; idempotencyKey: string }) {
  requirePermission(actor, "cards.manage")
  requirePersonal(input)
  await loadCard(db, input)
  const next = input.action === "renew" ? await renewCard(actor, input.cardId, input.idempotencyKey) : await replaceCard(actor, input.cardId, input.reason ?? "", input.idempotencyKey)
  return getAdminCard(actor, { walletType: "PERSONAL", cardId: next.id })
}

export const adminCardsRouter = router({
      list: protectedProcedure.input(listInput).query(({ ctx, input }) => listAdminCardsUnified(ctx.actor, input)),
      get: protectedProcedure.input(cardRefSchema).query(({ ctx, input }) => getAdminCard(ctx.actor, input)),
      setData: adminWriteProcedure.input(setDataInput).mutation(({ ctx, input }) => setCardData(ctx.actor, input)),
      reveal: revealProcedure.input(cardRefSchema).mutation(({ ctx, input }) => revealCardData(ctx.actor, input)),
      setFrozen: adminWriteProcedure.input(cardRefSchema.extend({ frozen: z.boolean() })).mutation(({ ctx, input }) => setCardFrozenAdmin(ctx.actor, { walletType: input.walletType, cardId: input.cardId }, input.frozen)),
      updateControls: adminWriteProcedure.input(controlsInput).mutation(({ ctx, input }) => updateCardControlsAdmin(ctx.actor, input)),
      cancel: adminWriteProcedure.input(cardRefSchema).mutation(({ ctx, input }) => cancelCardAdmin(ctx.actor, input)),
      reissue: adminWriteProcedure.input(cardRefSchema.extend({ action: z.enum(["renew", "replace"]), reason: z.string().trim().min(5).max(250).optional(), idempotencyKey: z.string().min(16).max(100) }).refine((input) => input.action === "renew" || Boolean(input.reason), "Un motif est obligatoire pour un remplacement.")).mutation(({ ctx, input }) => reissueCardAdmin(ctx.actor, input)),
      clearData: adminWriteProcedure.input(cardRefSchema.extend({ fields: z.array(z.enum(["pan", "cvv", "pin"])).min(1).max(3).optional() })).mutation(({ ctx, input }) => clearCardData(ctx.actor, { walletType: input.walletType, cardId: input.cardId }, input.fields)),
})
