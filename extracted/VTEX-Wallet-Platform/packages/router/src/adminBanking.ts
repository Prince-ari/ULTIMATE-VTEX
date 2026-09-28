import {
  NotFoundError,
  ValidationError,
  VaultIntegrityError,
  VaultUnavailableError,
  attachBankAccount,
  bankAccountView,
  bankAccounts,
  can,
  checkRateLimit,
  db,
  generatedIban,
  generatedVirtualIban,
  getBankAccount,
  ibanFingerprint,
  insertBankAccount,
  logAction,
  logs,
  normalizeAndValidateIban,
  protectedProcedure,
  requirePermission,
  revealBankAccountIban,
  router,
  setBankAccountStatus,
  updateBankAccount,
  users,
  type Actor,
  type BankAccountRow,
  type BankAccountView,
  type Db,
  type WalletType,
} from "@vtex/core"
import { businessWalletAccounts, businesses } from "@vtex/business"
import { walletAccounts, walletBankDetails } from "@vtex/wallet"
import { CURRENCY_CODES } from "@vtex/money"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { z } from "zod"

import { likeContains } from "./sqlLike"

/**
 * Banque (Dashboard) — RIB principaux et sous-RIB (IBAN virtuels), source de vérité `bank_accounts`.
 *
 *  - les listes et les fiches ne renvoient jamais un IBAN complet : masqué (`FR•• •••• •••• 1234`) ; le clair passe par `reveal`
 *    (permission `banking.reveal`, journalisé) ;
 *  - créer / modifier / désactiver / attribuer / retirer exigent `banking.manage` ; chaque changement est journalisé
 *    (`bank.account.*`, avec l'ancien et le nouveau titulaire, le motif, les quatre derniers caractères — jamais l'IBAN) ;
 *  - un RIB principal reste écrit en parallèle dans les colonnes historiques du compte (le Wallet les lit encore) : tout ou rien.
 */

const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const currencySchema = z.enum(CURRENCY_CODES)
const id = z.number().int().positive()
const reasonSchema = z.string().trim().min(8, "Le motif doit contenir au moins huit caractères.").max(250)

const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})
const revealProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `bank:reveal:${ctx.actor.id}`, 30, 60_000)
  return next()
})

/* ── Comptes crédités et titulaires ─────────────────────────────── */

interface LedgerInfo {
  walletType: WalletType
  ledgerAccountId: number
  holderId: number
  currency: string
  ledgerLabel: string
  holderName: string
  holderEmail: string | null
  legalName: string
}

async function loadLedger(executor: Db, walletType: WalletType, ledgerAccountId: number): Promise<LedgerInfo> {
  if (walletType === "PERSONAL") {
    const [row] = await executor
      .select({ id: walletAccounts.id, userId: walletAccounts.userId, currency: walletAccounts.currency, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(walletAccounts)
      .innerJoin(users, eq(users.id, walletAccounts.userId))
      .where(eq(walletAccounts.id, ledgerAccountId))
      .limit(1)
    if (!row) throw new NotFoundError(`Compte Wallet #${ledgerAccountId} introuvable.`)
    const name = `${row.firstName} ${row.lastName}`.trim()
    return { walletType, ledgerAccountId: row.id, holderId: row.userId, currency: row.currency, ledgerLabel: `Compte ${row.currency}`, holderName: name, holderEmail: row.email, legalName: name }
  }
  const [row] = await executor
    .select({ id: businessWalletAccounts.id, businessId: businessWalletAccounts.businessId, currency: businessWalletAccounts.currency, label: businessWalletAccounts.label, brandName: businesses.brandName, legalName: businesses.legalName, email: businesses.email })
    .from(businessWalletAccounts)
    .innerJoin(businesses, eq(businesses.id, businessWalletAccounts.businessId))
    .where(eq(businessWalletAccounts.id, ledgerAccountId))
    .limit(1)
  if (!row) throw new NotFoundError(`Compte Wallet Pro #${ledgerAccountId} introuvable.`)
  return { walletType, ledgerAccountId: row.id, holderId: row.businessId, currency: row.currency, ledgerLabel: `${row.label} · ${row.currency}`, holderName: row.brandName, holderEmail: row.email, legalName: row.legalName }
}

/** Le compte doit appartenir au titulaire annoncé : jamais de RIB rattaché au compte d'un autre (IDOR côté serveur). */
async function assertLedgerOf(executor: Db, walletType: WalletType, holderId: number, ledgerAccountId: number): Promise<LedgerInfo> {
  const ledger = await loadLedger(executor, walletType, ledgerAccountId)
  if (ledger.holderId !== holderId) throw new ValidationError("Ce compte n'appartient pas à ce titulaire.")
  return ledger
}

export interface BankHolder { kind: "user" | "business"; id: number; name: string; subtitle: string | null }
export interface BankLedger { id: number; label: string; currency: string }

async function describeRows(executor: Db, rows: BankAccountRow[]) {
  const userIds = [...new Set(rows.filter((row) => row.walletType === "PERSONAL" && row.holderId !== null).map((row) => row.holderId!))]
  const businessIds = [...new Set(rows.filter((row) => row.walletType === "PROFESSIONAL" && row.holderId !== null).map((row) => row.holderId!))]
  const personalLedgerIds = [...new Set(rows.filter((row) => row.walletType === "PERSONAL" && row.ledgerAccountId !== null).map((row) => row.ledgerAccountId!))]
  const businessLedgerIds = [...new Set(rows.filter((row) => row.walletType === "PROFESSIONAL" && row.ledgerAccountId !== null).map((row) => row.ledgerAccountId!))]
  const [userRows, businessRows, personalLedgers, businessLedgers] = await Promise.all([
    userIds.length ? executor.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    businessIds.length ? executor.select({ id: businesses.id, brandName: businesses.brandName, legalName: businesses.legalName }).from(businesses).where(inArray(businesses.id, businessIds)) : Promise.resolve([]),
    personalLedgerIds.length ? executor.select({ id: walletAccounts.id, currency: walletAccounts.currency }).from(walletAccounts).where(inArray(walletAccounts.id, personalLedgerIds)) : Promise.resolve([]),
    businessLedgerIds.length ? executor.select({ id: businessWalletAccounts.id, currency: businessWalletAccounts.currency, label: businessWalletAccounts.label }).from(businessWalletAccounts).where(inArray(businessWalletAccounts.id, businessLedgerIds)) : Promise.resolve([]),
  ])
  const userMap = new Map(userRows.map((row) => [row.id, row]))
  const businessMap = new Map(businessRows.map((row) => [row.id, row]))
  const personalLedgerMap = new Map(personalLedgers.map((row) => [row.id, row]))
  const businessLedgerMap = new Map(businessLedgers.map((row) => [row.id, row]))
  return (row: BankAccountRow): { holder: BankHolder | null; ledger: BankLedger | null } => {
    let holder: BankHolder | null = null
    if (row.holderId !== null) {
      if (row.walletType === "PERSONAL") {
        const user = userMap.get(row.holderId)
        holder = { kind: "user", id: row.holderId, name: user ? `${user.firstName} ${user.lastName}`.trim() : `Utilisateur #${row.holderId}`, subtitle: user?.email ?? null }
      } else {
        const company = businessMap.get(row.holderId)
        holder = { kind: "business", id: row.holderId, name: company?.brandName ?? `Société #${row.holderId}`, subtitle: company?.legalName ?? null }
      }
    }
    let ledger: BankLedger | null = null
    if (row.ledgerAccountId !== null) {
      if (row.walletType === "PERSONAL") {
        const account = personalLedgerMap.get(row.ledgerAccountId)
        ledger = { id: row.ledgerAccountId, label: `Compte ${account?.currency ?? row.currency}`, currency: account?.currency ?? row.currency }
      } else {
        const account = businessLedgerMap.get(row.ledgerAccountId)
        ledger = { id: row.ledgerAccountId, label: account ? `${account.label} · ${account.currency}` : `Compte Pro #${row.ledgerAccountId}`, currency: account?.currency ?? row.currency }
      }
    }
    return { holder, ledger }
  }
}

function withRelations(row: BankAccountRow, describe: Awaited<ReturnType<typeof describeRows>>): BankAccountView & { holder: BankHolder | null; ledger: BankLedger | null } {
  return { ...bankAccountView(row), ...describe(row) }
}

const scopeOf = (row: Pick<BankAccountRow, "walletType" | "holderId">) => (row.holderId !== null ? { walletType: row.walletType, holderId: row.holderId } : undefined)

function audit(executor: Db, actor: Actor, action: string, row: BankAccountRow, extra: Record<string, unknown> = {}) {
  // Le journal reçoit le libellé, la devise, les quatre derniers caractères, l'ancien / le nouveau rattachement, le motif — jamais l'IBAN.
  return logAction(executor, actor.id, action, "bank_account", row.id, { kind: row.kind, label: row.label, currency: row.currency, ibanLast4: row.ibanLast4, ...extra }, scopeOf(row))
}

function wrapVaultError(error: unknown): never {
  if (error instanceof VaultUnavailableError) throw new ValidationError("Le coffre de données sensibles n'est pas configuré sur ce serveur (VTEX_VAULT_KEYS).")
  if (error instanceof VaultIntegrityError) throw new ValidationError("Cet IBAN est illisible : clé de coffre absente ou contenu altéré.")
  throw error
}

/* ── Écriture jumelée dans les colonnes historiques du compte (RIB principal) ── */

function isLegacyDuplicate(error: unknown) {
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } } | null
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062 || candidate?.cause?.code === "ER_DUP_ENTRY" || candidate?.cause?.errno === 1062
}

async function mirrorLegacyMain(executor: Db, walletType: WalletType, ledgerAccountId: number, values: { iban: string; bic: string | null } | null, actorId: number, reason: string) {
  try {
    if (walletType === "PERSONAL") {
      await executor.update(walletAccounts).set({ iban: values?.iban ?? null, bic: values?.bic ?? null, updatedAt: new Date() }).where(eq(walletAccounts.id, ledgerAccountId))
      await executor.update(walletBankDetails).set({ status: "revoked", revokedAt: new Date(), reason }).where(and(eq(walletBankDetails.walletAccountId, ledgerAccountId), eq(walletBankDetails.status, "active")))
      if (values) await executor.insert(walletBankDetails).values({ walletAccountId: ledgerAccountId, iban: values.iban, bic: values.bic ?? "VTEXFRPPXXX", createdBy: actorId, reason })
    } else {
      await executor.update(businessWalletAccounts).set({ iban: values?.iban ?? null, bic: values?.bic ?? null, updatedAt: new Date() }).where(eq(businessWalletAccounts.id, ledgerAccountId))
    }
  } catch (error) {
    if (isLegacyDuplicate(error)) throw new ValidationError("Cet IBAN est déjà attribué à un autre compte.")
    throw error
  }
}

/* ── Lectures ───────────────────────────────────────────────────── */

const listInput = z
  .object({
    search: z.string().trim().max(120).optional(),
    walletType: walletTypeSchema.optional(),
    kind: z.enum(["MAIN", "SUB"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    assignment: z.enum(["assigned", "unassigned"]).optional(),
  })
  .optional()

export async function listBankAccounts(actor: Actor, filters: z.infer<typeof listInput> = {}) {
  requirePermission(actor, "banking.read")
  const conditions = []
  if (filters?.walletType) conditions.push(eq(bankAccounts.walletType, filters.walletType))
  if (filters?.kind) conditions.push(eq(bankAccounts.kind, filters.kind))
  if (filters?.status) conditions.push(eq(bankAccounts.status, filters.status))
  const rows = await db.select().from(bankAccounts).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(bankAccounts.updatedAt)).limit(500)
  const describe = await describeRows(db, rows)
  const all = rows.map((row) => withRelations(row, describe))
  const needle = filters?.search?.toLowerCase()
  let fingerprint: string | null = null
  if (needle && /^[a-z]{2}\d{2}[a-z0-9 ]{9,}$/i.test(needle)) {
    try { fingerprint = ibanFingerprint(normalizeAndValidateIban(needle)) } catch { fingerprint = null }
  }
  const byFingerprint = new Set(fingerprint ? rows.filter((row) => row.ibanFingerprint === fingerprint).map((row) => row.id) : [])
  return all
    .filter((row) => !filters?.assignment || (filters.assignment === "assigned" ? row.holderId !== null : row.holderId === null))
    .filter((row) => !needle || byFingerprint.has(row.id) || [row.label, row.accountHolderName, row.bankName, row.ibanLast4, row.holder?.name ?? "", row.holder?.subtitle ?? "", row.ledger?.label ?? ""].some((value) => value.toLowerCase().includes(needle)))
}

const HISTORY_LIMIT = 60

export async function getBankAccountDetail(actor: Actor, bankId: number) {
  requirePermission(actor, "banking.read")
  const row = await getBankAccount(db, bankId)
  const siblings = row.ledgerAccountId !== null
    ? await db.select().from(bankAccounts).where(and(eq(bankAccounts.walletType, row.walletType), eq(bankAccounts.ledgerAccountId, row.ledgerAccountId))).orderBy(bankAccounts.kind, desc(bankAccounts.createdAt))
    : [row]
  const describe = await describeRows(db, [row, ...siblings])
  let history: { id: number; action: string; actorId: number | null; actorName: string | null; actorRole: string | null; detail: Record<string, unknown> | null; ip: string | null; createdAt: Date }[] | null = null
  if (can(actor, "audit.read")) {
    const entries = await db.select().from(logs).where(and(eq(logs.targetType, "bank_account"), eq(logs.targetId, bankId))).orderBy(desc(logs.createdAt), desc(logs.id)).limit(HISTORY_LIMIT)
    const actorIds = [...new Set(entries.map((entry) => entry.actorId).filter((value): value is number => value !== null))]
    const names = actorIds.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, actorIds)) : []
    const nameOf = new Map(names.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]))
    history = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorId: entry.actorId,
      actorName: entry.actorId !== null ? nameOf.get(entry.actorId) ?? null : null,
      actorRole: entry.actorRole,
      detail: typeof entry.detail === "string" ? (JSON.parse(entry.detail) as Record<string, unknown>) : entry.detail,
      ip: entry.ip,
      createdAt: entry.createdAt,
    }))
  }
  return { account: withRelations(row, describe), relations: siblings.map((sibling) => withRelations(sibling, describe)), history }
}

/** Titulaires proposés aux sélecteurs (création / attribution) : personnes et sociétés, avec leurs comptes crédités. */
export async function searchBankHolders(actor: Actor, query: string) {
  requirePermission(actor, "banking.manage")
  const term = likeContains(query)
  const [people, companies] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(query ? or(like(users.email, term), like(users.firstName, term), like(users.lastName, term)) : undefined).orderBy(desc(users.id)).limit(40),
    db.select({ id: businesses.id, brandName: businesses.brandName, legalName: businesses.legalName }).from(businesses).where(query ? or(like(businesses.brandName, term), like(businesses.legalName, term)) : undefined).orderBy(desc(businesses.id)).limit(40),
  ])
  const [personalAccounts, businessAccounts] = await Promise.all([
    people.length ? db.select({ id: walletAccounts.id, userId: walletAccounts.userId, currency: walletAccounts.currency }).from(walletAccounts).where(inArray(walletAccounts.userId, people.map((person) => person.id))) : Promise.resolve([]),
    companies.length ? db.select({ id: businessWalletAccounts.id, businessId: businessWalletAccounts.businessId, currency: businessWalletAccounts.currency, label: businessWalletAccounts.label }).from(businessWalletAccounts).where(inArray(businessWalletAccounts.businessId, companies.map((company) => company.id))) : Promise.resolve([]),
  ])
  const mains = await db.select({ walletType: bankAccounts.walletType, ledgerAccountId: bankAccounts.ledgerAccountId }).from(bankAccounts).where(and(eq(bankAccounts.kind, "MAIN"), eq(bankAccounts.status, "active")))
  const hasMain = (walletType: WalletType, ledgerId: number) => mains.some((main) => main.walletType === walletType && main.ledgerAccountId === ledgerId)
  return [
    ...people.filter((person) => personalAccounts.some((account) => account.userId === person.id)).map((person) => ({
      walletType: "PERSONAL" as const,
      holderId: person.id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      subtitle: person.email,
      accounts: personalAccounts.filter((account) => account.userId === person.id).map((account) => ({ id: account.id, label: `Compte ${account.currency}`, currency: account.currency, hasMain: hasMain("PERSONAL", account.id) })),
    })),
    ...companies.filter((company) => businessAccounts.some((account) => account.businessId === company.id)).map((company) => ({
      walletType: "PROFESSIONAL" as const,
      holderId: company.id,
      name: company.brandName,
      subtitle: company.legalName,
      accounts: businessAccounts.filter((account) => account.businessId === company.id).map((account) => ({ id: account.id, label: `${account.label} · ${account.currency}`, currency: account.currency, hasMain: hasMain("PROFESSIONAL", account.id) })),
    })),
  ].slice(0, 30)
}

/* ── Écritures ──────────────────────────────────────────────────── */

const createInput = z
  .object({
    kind: z.enum(["MAIN", "SUB"]),
    walletType: walletTypeSchema.optional(),
    holderId: id.optional(),
    ledgerAccountId: id.optional(),
    /** Devise d'un sous-RIB non attribué (un sous-RIB attribué prend celle de son compte). */
    currency: currencySchema.optional(),
    label: z.string().trim().min(2).max(100),
    bankName: z.string().trim().max(120).optional(),
    accountHolderName: z.string().trim().max(160).optional(),
    iban: z.string().max(64).optional(),
    generate: z.boolean().default(false),
    bic: z.string().trim().max(11).optional(),
    reason: reasonSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (Boolean(input.iban) === input.generate) ctx.addIssue({ code: "custom", path: ["iban"], message: "Saisissez un IBAN ou demandez sa génération (l'un ou l'autre)." })
    const assigned = [input.walletType, input.holderId, input.ledgerAccountId]
    if (assigned.some((value) => value !== undefined) && assigned.some((value) => value === undefined)) ctx.addIssue({ code: "custom", path: ["ledgerAccountId"], message: "Le type de wallet, le titulaire et le compte crédité vont ensemble." })
    if (input.kind === "MAIN" && input.ledgerAccountId === undefined) ctx.addIssue({ code: "custom", path: ["ledgerAccountId"], message: "Un RIB principal est toujours rattaché à un compte." })
    if (input.kind === "SUB" && input.ledgerAccountId === undefined && input.currency === undefined) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choisissez la devise d'un sous-RIB non attribué." })
  })

export type CreateBankAccountInput = z.infer<typeof createInput>

const MAX_GENERATION_TRIES = 6

export async function createBankAccountAdmin(actor: Actor, input: CreateBankAccountInput) {
  requirePermission(actor, "banking.manage")
  const ledger = input.ledgerAccountId !== undefined ? await assertLedgerOf(db, input.walletType!, input.holderId!, input.ledgerAccountId) : null
  const currency = ledger?.currency ?? input.currency!
  const accountHolderName = input.accountHolderName?.trim() || ledger?.legalName || "VTEX"
  const tries = input.generate && input.kind === "SUB" ? MAX_GENERATION_TRIES : 1

  let created: BankAccountRow
  try {
    created = await db.transaction(async (tx) => {
      const executor = tx as unknown as Db
      let inserted: BankAccountRow | null = null
      for (let attempt = 0; attempt < tries && !inserted; attempt += 1) {
        const iban = input.generate
          ? input.kind === "MAIN" ? generatedIban(ledger!.ledgerAccountId, ledger!.walletType === "PROFESSIONAL" ? "business" : "wallet") : generatedVirtualIban()
          : normalizeAndValidateIban(input.iban!)
        try {
          inserted = await insertBankAccount(executor, {
            walletType: ledger?.walletType ?? input.walletType ?? "PROFESSIONAL",
            holderId: ledger?.holderId ?? null,
            ledgerAccountId: ledger?.ledgerAccountId ?? null,
            kind: input.kind,
            label: input.label,
            accountHolderName,
            bankName: input.bankName,
            currency,
            iban,
            bic: input.bic || (input.kind === "MAIN" ? "VTEXFRPPXXX" : null),
            actorId: actor.id,
          })
        } catch (error) {
          // Un IBAN virtuel généré qui entre en collision est simplement retiré au sort ; toute autre erreur remonte.
          const collision = error instanceof ValidationError && /déjà enregistré/.test(error.message)
          if (!(collision && input.generate && input.kind === "SUB")) throw error
        }
      }
      if (!inserted) throw new ValidationError("Impossible de générer un IBAN virtuel unique : réessayez.")
      if (inserted.kind === "MAIN") await mirrorLegacyMain(executor, inserted.walletType, inserted.ledgerAccountId!, { iban: openIbanFor(inserted), bic: inserted.bic }, actor.id, input.reason ?? "Création du RIB principal")
      await audit(executor, actor, "bank.account.create", inserted, { generated: input.generate, assignedTo: inserted.holderId, ledgerAccountId: inserted.ledgerAccountId, reason: input.reason ?? null })
      return inserted
    })
  } catch (error) {
    return wrapVaultError(error)
  }
  return getBankAccountDetail(actor, created.id)
}
function openIbanFor(row: BankAccountRow): string {
  return revealBankAccountIban(row).iban
}

const updateInput = z.object({
  id,
  label: z.string().trim().min(2).max(100).optional(),
  bankName: z.string().trim().max(120).optional(),
  accountHolderName: z.string().trim().min(2).max(160).optional(),
  bic: z.string().trim().max(11).nullable().optional(),
  iban: z.string().max(64).optional(),
  reason: reasonSchema,
})

export async function updateBankAccountAdmin(actor: Actor, input: z.infer<typeof updateInput>) {
  requirePermission(actor, "banking.manage")
  const before = await getBankAccount(db, input.id)
  const changed: string[] = []
  if (input.label !== undefined && input.label !== before.label) changed.push("label")
  if (input.bankName !== undefined && input.bankName !== before.bankName) changed.push("bankName")
  if (input.accountHolderName !== undefined && input.accountHolderName !== before.accountHolderName) changed.push("accountHolderName")
  if (input.bic !== undefined && (input.bic ?? null) !== before.bic) changed.push("bic")
  const nextIban = input.iban !== undefined ? normalizeAndValidateIban(input.iban) : undefined
  if (nextIban !== undefined && ibanFingerprint(nextIban) !== before.ibanFingerprint) changed.push("iban")
  if (changed.length === 0) throw new ValidationError("Aucune modification à enregistrer.")
  try {
    await db.transaction(async (tx) => {
      const executor = tx as unknown as Db
      const after = await updateBankAccount(executor, input.id, { label: input.label, bankName: input.bankName, accountHolderName: input.accountHolderName, bic: input.bic, iban: changed.includes("iban") ? nextIban : undefined }, actor.id)
      if (after.kind === "MAIN" && after.status === "active" && after.ledgerAccountId !== null && (changed.includes("iban") || changed.includes("bic"))) {
        await mirrorLegacyMain(executor, after.walletType, after.ledgerAccountId, { iban: openIbanFor(after), bic: after.bic }, actor.id, input.reason)
      }
      await audit(executor, actor, "bank.account.update", after, { fields: changed, previousIbanLast4: changed.includes("iban") ? before.ibanLast4 : undefined, reason: input.reason })
    })
  } catch (error) {
    wrapVaultError(error)
  }
  return getBankAccountDetail(actor, input.id)
}

const statusInput = z.object({ id, status: z.enum(["active", "disabled"]), reason: reasonSchema })

export async function setBankAccountStatusAdmin(actor: Actor, input: z.infer<typeof statusInput>) {
  requirePermission(actor, "banking.manage")
  const before = await getBankAccount(db, input.id)
  if (before.status === input.status) throw new ValidationError(input.status === "disabled" ? "Ce RIB est déjà désactivé." : "Ce RIB est déjà actif.")
  try {
    await db.transaction(async (tx) => {
      const executor = tx as unknown as Db
      const after = await setBankAccountStatus(executor, input.id, input.status, actor.id)
      if (after.kind === "MAIN" && after.ledgerAccountId !== null) {
        await mirrorLegacyMain(executor, after.walletType, after.ledgerAccountId, input.status === "active" ? { iban: openIbanFor(after), bic: after.bic } : null, actor.id, input.reason)
      }
      await audit(executor, actor, input.status === "disabled" ? "bank.account.disable" : "bank.account.enable", after, { reason: input.reason })
    })
  } catch (error) {
    wrapVaultError(error)
  }
  return getBankAccountDetail(actor, input.id)
}

const assignInput = z.object({ id, walletType: walletTypeSchema, holderId: id, ledgerAccountId: id, reason: reasonSchema })

/** Attribue un sous-RIB à un compte, ou le réattribue à un autre : mêmes règles, l'ancien rattachement est conservé au journal. */
export async function assignBankAccountAdmin(actor: Actor, input: z.infer<typeof assignInput>) {
  requirePermission(actor, "banking.manage")
  const before = await getBankAccount(db, input.id)
  if (before.kind !== "SUB") throw new ValidationError("Seul un sous-RIB s'attribue : un RIB principal appartient à son compte (remplacez son IBAN pour le changer).")
  if (before.status !== "active") throw new ValidationError("Un sous-RIB désactivé ne peut pas être attribué : réactivez-le d'abord.")
  const ledger = await assertLedgerOf(db, input.walletType, input.holderId, input.ledgerAccountId)
  if (ledger.currency !== before.currency) throw new ValidationError(`Ce sous-RIB est en ${before.currency} : le compte choisi est en ${ledger.currency}.`)
  if (before.walletType === input.walletType && before.ledgerAccountId === input.ledgerAccountId) throw new ValidationError("Ce sous-RIB est déjà rattaché à ce compte.")
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    await executor.update(bankAccounts).set({ walletType: input.walletType }).where(eq(bankAccounts.id, input.id))
    const after = await attachBankAccount(executor, input.id, { holderId: ledger.holderId, ledgerAccountId: ledger.ledgerAccountId }, actor.id)
    await audit(executor, actor, before.holderId === null ? "bank.account.assign" : "bank.account.reassign", after, {
      from: before.holderId === null ? null : { walletType: before.walletType, holderId: before.holderId, ledgerAccountId: before.ledgerAccountId },
      to: { walletType: input.walletType, holderId: ledger.holderId, ledgerAccountId: ledger.ledgerAccountId },
      reason: input.reason,
    })
    // Le titulaire précédent voit aussi le retrait dans son propre historique.
    if (before.holderId !== null) await logAction(executor, actor.id, "bank.account.unassign", "bank_account", before.id, { kind: before.kind, label: before.label, ibanLast4: before.ibanLast4, reason: input.reason, reassignedTo: { walletType: input.walletType, holderId: ledger.holderId } }, { walletType: before.walletType, holderId: before.holderId })
  })
  return getBankAccountDetail(actor, input.id)
}

const unassignInput = z.object({ id, reason: reasonSchema })

export async function unassignBankAccountAdmin(actor: Actor, input: z.infer<typeof unassignInput>) {
  requirePermission(actor, "banking.manage")
  const before = await getBankAccount(db, input.id)
  if (before.kind !== "SUB") throw new ValidationError("Un RIB principal ne se retire pas : désactivez-le.")
  if (before.holderId === null) throw new ValidationError("Ce sous-RIB n'est attribué à personne.")
  const previousHolderId: number = before.holderId
  await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const after = await attachBankAccount(executor, input.id, null, actor.id)
    await logAction(executor, actor.id, "bank.account.unassign", "bank_account", after.id, { kind: after.kind, label: after.label, currency: after.currency, ibanLast4: after.ibanLast4, from: { walletType: before.walletType, holderId: previousHolderId, ledgerAccountId: before.ledgerAccountId }, reason: input.reason }, { walletType: before.walletType, holderId: previousHolderId })
  })
  return getBankAccountDetail(actor, input.id)
}

/** IBAN complet, sur action explicite : permission `banking.reveal`, chaque consultation journalisée (jamais la valeur). */
export async function revealBankAccountAdmin(actor: Actor, bankId: number) {
  requirePermission(actor, "banking.reveal")
  const row = await getBankAccount(db, bankId)
  let revealed
  try {
    revealed = revealBankAccountIban(row)
  } catch (error) {
    await audit(db, actor, "bank.iban.reveal_failed", row, { reason: error instanceof VaultIntegrityError ? "integrity" : "unavailable" })
    wrapVaultError(error)
  }
  await audit(db, actor, "bank.iban.reveal", row, {})
  return { id: row.id, iban: revealed.iban, ibanFormatted: revealed.ibanFormatted, bic: row.bic, bankName: row.bankName, accountHolderName: row.accountHolderName, currency: row.currency }
}

export const adminBankingRouter = router({
  list: protectedProcedure.input(listInput).query(({ ctx, input }) => listBankAccounts(ctx.actor, input)),
  get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => getBankAccountDetail(ctx.actor, input.id)),
  holders: protectedProcedure.input(z.object({ query: z.string().trim().max(80).default("") })).query(({ ctx, input }) => searchBankHolders(ctx.actor, input.query)),
  create: writeProcedure.input(createInput).mutation(({ ctx, input }) => createBankAccountAdmin(ctx.actor, input)),
  update: writeProcedure.input(updateInput).mutation(({ ctx, input }) => updateBankAccountAdmin(ctx.actor, input)),
  setStatus: writeProcedure.input(statusInput).mutation(({ ctx, input }) => setBankAccountStatusAdmin(ctx.actor, input)),
  assign: writeProcedure.input(assignInput).mutation(({ ctx, input }) => assignBankAccountAdmin(ctx.actor, input)),
  unassign: writeProcedure.input(unassignInput).mutation(({ ctx, input }) => unassignBankAccountAdmin(ctx.actor, input)),
  reveal: revealProcedure.input(z.object({ id })).mutation(({ ctx, input }) => revealBankAccountAdmin(ctx.actor, input.id)),
})
