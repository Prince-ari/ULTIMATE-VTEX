import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"
import { users } from "@vtex/core"

/**
 * Domaine financier VTEX. Tous les montants sont exprimés dans l’unité
 * minimale de leur devise et stockés en BIGINT de centimes ; le navigateur
 * ne calcule jamais un solde de référence ni une mutation financière.
 */
export const walletAccounts = mysqlTable("wallet_accounts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  iban: char("iban", { length: 34 }),
  bic: char("bic", { length: 11 }),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  availableBalanceCents: bigint("available_balance_cents", { mode: "number" }).notNull().default(0),
  reservedBalanceCents: bigint("reserved_balance_cents", { mode: "number" }).notNull().default(0),
  status: mysqlEnum("status", ["active", "frozen", "closed"]).notNull().default("active"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  ibanUnique: uniqueIndex("wallet_accounts_iban_unique").on(t.iban),
  userCurrencyUnique: uniqueIndex("wallet_accounts_user_currency_unique").on(t.userId, t.currency),
  statusIdx: index("wallet_accounts_status_idx").on(t.status),
}))

export const walletBankDetails = mysqlTable("wallet_bank_details", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  iban: char("iban", { length: 34 }).notNull(),
  bic: char("bic", { length: 11 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).notNull().default("active"),
  reason: varchar("reason", { length: 250 }),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  revokedAt: datetime("revoked_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  accountIdx: index("wallet_bank_details_account_idx").on(t.walletAccountId, t.createdAt),
  ibanIdx: index("wallet_bank_details_iban_idx").on(t.iban),
}))

export const cards = mysqlTable("cards", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  cardholderName: varchar("cardholder_name", { length: 140 }).notNull(),
  lastFour: char("last_four", { length: 4 }).notNull(),
  network: mysqlEnum("network", ["visa", "mastercard", "cb"]).notNull().default("visa"),
  label: varchar("label", { length: 80 }).notNull().default("Carte VTEX"),
  tokenReference: varchar("token_reference", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["active", "frozen", "expired", "cancelled"]).notNull().default("active"),
  dailyLimitCents: bigint("daily_limit_cents", { mode: "number" }).notNull().default(100000),
  monthlyLimitCents: bigint("monthly_limit_cents", { mode: "number" }).notNull().default(300000),
  perTransactionLimitCents: bigint("per_transaction_limit_cents", { mode: "number" }).notNull().default(50000),
  onlinePaymentsEnabled: boolean("online_payments_enabled").notNull().default(true),
  contactlessEnabled: boolean("contactless_enabled").notNull().default(true),
  cashWithdrawalEnabled: boolean("cash_withdrawal_enabled").notNull().default(true),
  pinHash: varchar("pin_hash", { length: 128 }),
  pinUpdatedAt: datetime("pin_updated_at"),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  accountIdx: index("cards_account_idx").on(t.walletAccountId),
  tokenUnique: uniqueIndex("cards_token_reference_unique").on(t.tokenReference),
  statusIdx: index("cards_status_idx").on(t.status),
}))

export const beneficiaries = mysqlTable("beneficiaries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  internalWalletAccountId: bigint("internal_wallet_account_id", { mode: "number" }).references(() => walletAccounts.id, { onDelete: "set null" }),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  nickname: varchar("nickname", { length: 80 }),
  iban: char("iban", { length: 34 }).notNull(),
  bic: char("bic", { length: 11 }),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  verifiedAt: datetime("verified_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userIbanUnique: uniqueIndex("beneficiaries_user_iban_unique").on(t.userId, t.iban),
  internalWalletIdx: index("beneficiaries_internal_wallet_idx").on(t.internalWalletAccountId),
  userStatusIdx: index("beneficiaries_user_status_idx").on(t.userId, t.status),
}))

export const savingsGoals = mysqlTable("savings_goals", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  targetCents: bigint("target_cents", { mode: "number" }).notNull(),
  currentCents: bigint("current_cents", { mode: "number" }).notNull().default(0),
  dueAt: datetime("due_at"),
  status: mysqlEnum("status", ["active", "completed", "archived"]).notNull().default("active"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userStatusIdx: index("savings_goals_user_status_idx").on(t.userId, t.status),
  accountIdx: index("savings_goals_account_idx").on(t.walletAccountId),
}))

export const transactions = mysqlTable("transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  cardId: bigint("card_id", { mode: "number" }).references(() => cards.id, { onDelete: "restrict" }),
  counterpartyWalletAccountId: bigint("counterparty_wallet_account_id", { mode: "number" }).references(() => walletAccounts.id, { onDelete: "restrict" }),
  beneficiaryId: bigint("beneficiary_id", { mode: "number" }).references(() => beneficiaries.id, { onDelete: "restrict" }),
  initiatedByUserId: bigint("initiated_by_user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  type: mysqlEnum("type", ["transfer_internal", "transfer_external", "split_debit", "split_credit", "savings_deposit", "savings_withdrawal", "card_payment", "fee", "adjustment", "topup"]).notNull(),
  direction: mysqlEnum("direction", ["debit", "credit"]).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "rejected", "cancelled"]).notNull().default("pending"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  feeCents: bigint("fee_cents", { mode: "number" }).notNull().default(0),
  currency: char("currency", { length: 3 }).notNull(),
  description: varchar("description", { length: 250 }),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  scheduledAt: datetime("scheduled_at"),
  completedAt: datetime("completed_at"),
  /** Date de valeur affichée au titulaire (jamais dans le futur) ; NULL = on affiche createdAt. N'affecte ni le grand livre ni l'ordre chronologique réel des écritures. */
  valueDate: datetime("value_date"),
  rejectedReason: varchar("rejected_reason", { length: 250 }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  referenceUnique: uniqueIndex("transactions_reference_unique").on(t.reference),
  idempotencyUnique: uniqueIndex("transactions_idempotency_key_unique").on(t.idempotencyKey),
  accountCreatedIdx: index("transactions_account_created_idx").on(t.walletAccountId, t.createdAt),
  cardCreatedIdx: index("transactions_card_created_idx").on(t.cardId, t.createdAt),
  statusCreatedIdx: index("transactions_status_created_idx").on(t.status, t.createdAt),
  beneficiaryIdx: index("transactions_beneficiary_idx").on(t.beneficiaryId),
}))

export const walletLedgerEntries = mysqlTable("wallet_ledger_entries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  transactionId: bigint("transaction_id", { mode: "number" }).notNull().references(() => transactions.id, { onDelete: "restrict" }),
  entryKind: mysqlEnum("entry_kind", ["available", "reserved"]).notNull().default("available"),
  deltaCents: bigint("delta_cents", { mode: "number" }).notNull(),
  balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  accountCreatedIdx: index("wallet_ledger_entries_account_created_idx").on(t.walletAccountId, t.createdAt),
  transactionKindIdx: index("wallet_ledger_entries_transaction_kind_idx").on(t.transactionId, t.entryKind),
}))

export const walletIdempotencyKeys = mysqlTable("wallet_idempotency_keys", {
  idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  operation: varchar("operation", { length: 80 }).notNull(),
  requestHash: char("request_hash", { length: 64 }).notNull(),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => transactions.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).notNull().default("processing"),
  response: json("response").$type<Record<string, unknown> | null>(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: datetime("expires_at").notNull(),
}, (t) => ({
  userOperationIdx: index("wallet_idempotency_keys_user_operation_idx").on(t.userId, t.operation),
  expiresIdx: index("wallet_idempotency_keys_expires_idx").on(t.expiresAt),
}))

export const walletPermissions = mysqlTable("wallet_permissions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: mysqlEnum("permission", [
    "wallet.read",
    "wallet.accounts.manage",
    "wallet.cards.manage",
    "wallet.cards.pin",
    "wallet.transactions.review",
    "wallet.transactions.adjust",
    "wallet.beneficiaries.manage",
    "wallet.savings.manage",
    "wallet.emergency",
  ]).notNull(),
  allowed: boolean("allowed").notNull().default(false),
  updatedBy: bigint("updated_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userPermissionUnique: uniqueIndex("wallet_permissions_user_permission_unique").on(t.userId, t.permission),
  userIdx: index("wallet_permissions_user_idx").on(t.userId),
}))

/**
 * Recharge d'un wallet par carte bancaire (Stripe). Une ligne = une intention
 * de paiement. Le crédit du wallet n'est fait qu'une fois, dans une transaction
 * SQL verrouillée, après relecture du PaymentIntent auprès de Stripe.
 */
export const walletTopups = mysqlTable("wallet_topups", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
  walletAccountId: bigint("wallet_account_id", { mode: "number" }).notNull().references(() => walletAccounts.id, { onDelete: "restrict" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "requires_action", "processing", "succeeded", "failed", "canceled", "refunded"]).notNull().default("pending"),
  stripeMode: mysqlEnum("stripe_mode", ["sim", "test", "live"]).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 80 }),
  cardBrand: varchar("card_brand", { length: 24 }),
  cardLast4: char("card_last4", { length: 4 }),
  failureCode: varchar("failure_code", { length: 64 }),
  failureMessage: varchar("failure_message", { length: 250 }),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => transactions.id, { onDelete: "set null" }),
  creditedAt: datetime("credited_at"),
  refundedAt: datetime("refunded_at"),
  refundReason: varchar("refund_reason", { length: 250 }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  referenceUnique: uniqueIndex("wallet_topups_reference_unique").on(t.reference),
  idempotencyUnique: uniqueIndex("wallet_topups_idempotency_key_unique").on(t.idempotencyKey),
  intentUnique: uniqueIndex("wallet_topups_intent_unique").on(t.stripePaymentIntentId),
  userCreatedIdx: index("wallet_topups_user_created_idx").on(t.userId, t.createdAt),
  statusIdx: index("wallet_topups_status_idx").on(t.status),
}))

/**
 * Préférences du wallet PERSONNEL d'un titulaire, côté serveur : le wallet les relit à chaque ouverture, un administrateur peut les
 * régler depuis la fiche utilisateur. `display_currency` n'est qu'une devise d'AFFICHAGE (parité fixe avec l'euro, cf. @vtex/money) :
 * la devise d'un compte reste celle de `wallet_accounts.currency`.
 */
export const walletSettings = mysqlTable("wallet_settings", {
  userId: bigint("user_id", { mode: "number" }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayCurrency: char("display_currency", { length: 3 }),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export type WalletSettings = typeof walletSettings.$inferSelect
export type WalletTopup = typeof walletTopups.$inferSelect
export type WalletAccount = typeof walletAccounts.$inferSelect
export type WalletBankDetails = typeof walletBankDetails.$inferSelect
export type Card = typeof cards.$inferSelect
export type Beneficiary = typeof beneficiaries.$inferSelect
export type WalletTransaction = typeof transactions.$inferSelect
export type SavingsGoal = typeof savingsGoals.$inferSelect
export type WalletPermission = typeof walletPermissions.$inferSelect
