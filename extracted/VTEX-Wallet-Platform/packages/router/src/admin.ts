import {
  NotFoundError,
  TEMP_PASSWORD_DEFAULT_TTL_HOURS,
  bankAccountView,
  bankAccounts,
  assertPasswordPolicy,
  can,
  cardVaultStatuses,
  checkRateLimit,
  db,
  documents,
  generateTemporaryPassword,
  insertUserRow,
  listUsers,
  logAction,
  logs,
  protectedProcedure,
  requirePermission,
  router,
  safeUserColumns,
  sessions,
  supportTickets,
  users,
  type Actor,
  type Db,
  type WalletType,
} from "@vtex/core"
import { businessMembers, businessWalletAccounts, businesses, insertBusinessRows } from "@vtex/business"
import { cards, ensureWalletAccount, walletAccounts } from "@vtex/wallet"
import { CURRENCY_CODES } from "@vtex/money"
import { and, count, desc, eq, inArray, or } from "drizzle-orm"
import { z } from "zod"

import { adminBankingRouter } from "./adminBanking"
import { adminCardsRouter } from "./adminCards"
import { adminApiKeysRouter } from "./adminApiKeys"
import { adminDocumentsRouter } from "./adminDocuments"
import { adminManagersRouter } from "./adminManagers"
import { adminPortfolioRouter } from "./adminPortfolio"
import { adminSuggestionsRouter } from "./adminSuggestions"
import { adminPaymentLinksRouter } from "./adminPaymentLinks"

/**
 * Administration transverse (Dashboard) : orchestre le noyau, le wallet personnel et le Wallet Pro.
 * Ce package est le seul à les connaître tous ; chaque opération est vérifiée côté serveur (RBAC) et journalisée.
 */

const adminWriteProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})

const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const currencySchema = z.enum(CURRENCY_CODES)

const companySchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  brandName: z.string().trim().min(2).max(100),
  industry: z.string().trim().max(100).optional(),
  siren: z.string().trim().max(20).optional(),
  vatId: z.string().trim().max(32).optional(),
  address: z.string().trim().max(250).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().max(32).optional(),
})

const createUserInput = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(255),
    phone: z.string().trim().max(32).optional(),
    walletType: walletTypeSchema,
    currency: currencySchema,
    status: z.enum(["active", "suspended"]).default("active"),
    /** `generate` : mot de passe temporaire aléatoire renvoyé UNE fois ; `manual` : choisi par l'administrateur, jamais renvoyé. */
    passwordMode: z.enum(["generate", "manual"]).default("generate"),
    initialPassword: z.string().max(128).optional(),
    company: companySchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.walletType === "PROFESSIONAL" && !input.company) ctx.addIssue({ code: "custom", path: ["company"], message: "Les informations de la société sont requises pour un wallet professionnel." })
    if (input.walletType === "PERSONAL" && input.company) ctx.addIssue({ code: "custom", path: ["company"], message: "Une société ne se renseigne que pour un wallet professionnel." })
    if (input.passwordMode === "manual" && !input.initialPassword) ctx.addIssue({ code: "custom", path: ["initialPassword"], message: "Saisissez le mot de passe initial." })
  })

export type CreateManagedUserInput = z.infer<typeof createUserInput>

/** Masque un IBAN : pays + clé et quatre derniers caractères visibles, le reste masqué. */
export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null
  const compact = iban.replace(/\s+/g, "")
  if (compact.length < 9) return "••••"
  return `${compact.slice(0, 4)} •••• •••• ${compact.slice(-4)}`
}

/**
 * Création atomique d'un titulaire de wallet : utilisateur + wallet (+ société et compte principal pour PROFESSIONAL).
 * Le mot de passe est haché avant écriture, marqué temporaire (changement obligatoire, échéance 72 h) ; en mode `generate` il n'est
 * connu que de la réponse de cet appel. Toute erreur annule l'ensemble : aucune donnée orpheline.
 */
export async function createManagedUser(actor: Actor, input: CreateManagedUserInput) {
  requirePermission(actor, "users.create")
  requirePermission(actor, input.walletType === "PERSONAL" ? "wallets.create" : "companies.create")

  let temporaryPassword: string
  if (input.passwordMode === "generate") temporaryPassword = generateTemporaryPassword()
  else {
    temporaryPassword = input.initialPassword!
    assertPasswordPolicy(temporaryPassword, input.email)
  }

  const created = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const userId = await insertUserRow(executor, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      temporaryPassword,
      role: "user",
      status: input.status,
      mustChangePassword: true,
    })
    await logAction(executor, actor.id, "user.create", "user", userId, { walletType: input.walletType, currency: input.currency, passwordMode: input.passwordMode }, { walletType: "PERSONAL", holderId: userId })

    if (input.walletType === "PERSONAL") {
      const account = await ensureWalletAccount({ id: userId, role: "user" }, input.currency, executor, { auditActorId: actor.id })
      return { userId, walletType: "PERSONAL" as const, walletAccountId: account.id, businessId: null, businessAccountId: null }
    }

    const company = await insertBusinessRows(executor, { ...input.company!, ownerUserId: userId, currency: input.currency })
    await logAction(executor, actor.id, "admin.business.create", "business", company.businessId, { legalName: input.company!.legalName, ownerUserId: userId }, { walletType: "PROFESSIONAL", holderId: company.businessId })
    return { userId, walletType: "PROFESSIONAL" as const, walletAccountId: null, businessId: company.businessId, businessAccountId: company.walletAccountId }
  })

  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DEFAULT_TTL_HOURS * 3600 * 1000)
  return { ...created, expiresAt, temporaryPassword: input.passwordMode === "generate" ? temporaryPassword : null }
}

const listInput = z
  .object({
    search: z.string().max(100).optional(),
    status: z.enum(["active", "suspended", "deleted"]).optional(),
    role: z.enum(["super_admin", "admin", "account_manager", "agent", "user"]).optional(),
    walletType: walletTypeSchema.optional(),
    currency: currencySchema.optional(),
  })
  .optional()

/** Liste des utilisateurs enrichie du type de wallet et des devises (une requête par domaine, pas de N+1). */
export async function listManagedUsers(actor: Actor, filters: z.infer<typeof listInput> = {}) {
  requirePermission(actor, "users.read")
  const base = await listUsers(db, actor, { search: filters?.search, status: filters?.status, role: filters?.role })
  if (base.length === 0) return []
  const ids = base.map((user) => user.id)

  const [personal, memberships] = await Promise.all([
    db.select({ userId: walletAccounts.userId, currency: walletAccounts.currency }).from(walletAccounts).where(inArray(walletAccounts.userId, ids)),
    db
      .select({ userId: businessMembers.userId, businessId: businesses.id, brandName: businesses.brandName, role: businessMembers.role, currency: businesses.currency })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(and(inArray(businessMembers.userId, ids), eq(businessMembers.status, "active"))),
  ])

  const enriched = base.map((user) => {
    const accounts = personal.filter((row) => row.userId === user.id)
    const companies = memberships.filter((row) => row.userId === user.id)
    const walletTypes: WalletType[] = []
    if (accounts.length > 0) walletTypes.push("PERSONAL")
    if (companies.length > 0) walletTypes.push("PROFESSIONAL")
    const currencies = [...new Set([...accounts.map((row) => row.currency), ...companies.map((row) => row.currency)])]
    return { ...user, walletTypes, currencies, companies: companies.map((row) => ({ id: row.businessId, brandName: row.brandName, role: row.role })) }
  })

  return enriched.filter((user) => (!filters?.walletType || user.walletTypes.includes(filters.walletType)) && (!filters?.currency || user.currencies.includes(filters.currency)))
}

/**
 * Fiche centrale d'un utilisateur : profil, sécurité, wallet personnel, sociétés et activité.
 * Un administrateur l'ouvre par identifiant (décision produit) ; la lecture est vérifiée côté serveur et journalisée.
 */
export async function getManagedUserFile(actor: Actor, userId: number) {
  requirePermission(actor, "users.read")
  requirePermission(actor, "wallets.read")
  const [user] = await db.select({ ...safeUserColumns, passwordChangedAt: users.passwordChangedAt, tempPasswordExpiresAt: users.tempPasswordExpiresAt, failedLoginCount: users.failedLoginCount }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw new NotFoundError(`Utilisateur #${userId} introuvable.`)

  const [accounts, memberships, sessionRows, docCount, ticketCount] = await Promise.all([
    db.select().from(walletAccounts).where(eq(walletAccounts.userId, userId)),
    db
      .select({ businessId: businesses.id, brandName: businesses.brandName, legalName: businesses.legalName, status: businesses.status, currency: businesses.currency, role: businessMembers.role, memberStatus: businessMembers.status })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(eq(businessMembers.userId, userId)),
    db.select({ createdAt: sessions.createdAt, revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(50),
    db.select({ n: count() }).from(documents).where(eq(documents.userId, userId)),
    db.select({ n: count() }).from(supportTickets).where(and(eq(supportTickets.userId, userId), inArray(supportTickets.status, ["open", "in_progress"]))),
  ])

  const accountIds = accounts.map((account) => account.id)
  const businessIds = memberships.map((membership) => membership.businessId)
  const [cardRows, businessAccounts] = await Promise.all([
    accountIds.length ? db.select({ id: cards.id, walletAccountId: cards.walletAccountId, label: cards.label, lastFour: cards.lastFour, network: cards.network, status: cards.status, expiresAt: cards.expiresAt }).from(cards).where(inArray(cards.walletAccountId, accountIds)) : Promise.resolve([]),
    businessIds.length ? db.select().from(businessWalletAccounts).where(inArray(businessWalletAccounts.businessId, businessIds)) : Promise.resolve([]),
  ])

  const cardVault = await cardVaultStatuses(db, "PERSONAL", cardRows.map((card) => card.id))
  const bankRows = await db
    .select()
    .from(bankAccounts)
    .where(or(
      accountIds.length ? and(eq(bankAccounts.walletType, "PERSONAL"), inArray(bankAccounts.ledgerAccountId, accountIds)) : undefined,
      businessAccounts.length ? and(eq(bankAccounts.walletType, "PROFESSIONAL"), inArray(bankAccounts.ledgerAccountId, businessAccounts.map((account) => account.id))) : undefined,
    ))
    .orderBy(bankAccounts.kind, bankAccounts.createdAt)
  const banksFor = (walletType: "PERSONAL" | "PROFESSIONAL", ledgerId: number) => bankRows.filter((row) => row.walletType === walletType && row.ledgerAccountId === ledgerId).map((row) => { const view = bankAccountView(row); return { id: view.id, kind: view.kind, label: view.label, ibanMasked: view.ibanMasked, currency: view.currency, status: view.status, bankName: view.bankName } })
  const activeSessions = sessionRows.filter((row) => !row.revokedAt && row.expiresAt.getTime() > Date.now())
  const walletTypes: WalletType[] = []
  if (accounts.length > 0) walletTypes.push("PERSONAL")
  if (memberships.some((membership) => membership.memberStatus === "active")) walletTypes.push("PROFESSIONAL")

  let activity: (typeof logs.$inferSelect)[] | null = null
  if (can(actor, "audit.read")) {
    const conditions = [and(eq(logs.walletType, "PERSONAL"), eq(logs.holderId, userId)), and(eq(logs.targetType, "user"), eq(logs.targetId, userId))]
    if (businessIds.length) conditions.push(and(eq(logs.walletType, "PROFESSIONAL"), inArray(logs.holderId, businessIds)))
    activity = await db.select().from(logs).where(or(...conditions)).orderBy(desc(logs.createdAt)).limit(30)
  }

  await logAction(db, actor.id, "user.file.view", "user", userId, undefined, { walletType: "PERSONAL", holderId: userId })

  return {
    user,
    walletTypes,
    security: {
      activeSessions: activeSessions.length,
      lastSignInAt: sessionRows[0]?.createdAt ?? null,
      lastActiveAt: user.lastActiveAt,
      mustChangePassword: user.mustChangePassword,
      tempPasswordExpiresAt: user.tempPasswordExpiresAt,
      passwordChangedAt: user.passwordChangedAt,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
    },
    personal: {
      accounts: accounts.map((account) => ({
        id: account.id,
        currency: account.currency,
        status: account.status,
        availableBalanceCents: account.availableBalanceCents,
        reservedBalanceCents: account.reservedBalanceCents,
        ibanMasked: maskIban(account.iban),
        bic: account.bic,
        createdAt: account.createdAt,
        banking: banksFor("PERSONAL", account.id),
        cards: cardRows.filter((card) => card.walletAccountId === account.id).map((card) => ({ ...card, vault: { hasPan: cardVault.get(card.id)?.hasPan ?? false, hasCvv: cardVault.get(card.id)?.hasCvv ?? false, hasPin: cardVault.get(card.id)?.hasPin ?? false } })),
      })),
    },
    companies: memberships.map((membership) => ({
      businessId: membership.businessId,
      brandName: membership.brandName,
      legalName: membership.legalName,
      status: membership.status,
      currency: membership.currency,
      myRole: membership.role,
      memberStatus: membership.memberStatus,
      accounts: businessAccounts
        .filter((account) => account.businessId === membership.businessId)
        .map((account) => ({ id: account.id, label: account.label, currency: account.currency, status: account.status, availableBalanceCents: account.availableBalanceCents, ibanMasked: maskIban(account.iban), banking: banksFor("PROFESSIONAL", account.id) })),
    })),
    counts: { documents: Number(docCount[0]?.n ?? 0), openTickets: Number(ticketCount[0]?.n ?? 0) },
    activity,
  }
}

export const adminRouter = router({
  admin: router({
    users: router({
      create: adminWriteProcedure.input(createUserInput).mutation(({ ctx, input }) => createManagedUser(ctx.actor, input)),
      list: protectedProcedure.input(listInput).query(({ ctx, input }) => listManagedUsers(ctx.actor, input)),
      file: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => getManagedUserFile(ctx.actor, input.userId)),
    }),
    cards: adminCardsRouter,
    banking: adminBankingRouter,
    paymentLinks: adminPaymentLinksRouter,
    apiKeys: adminApiKeysRouter,
    managers: adminManagersRouter,
    suggestions: adminSuggestionsRouter,
    portfolio: adminPortfolioRouter,
    documents: adminDocumentsRouter,
  }),
})
