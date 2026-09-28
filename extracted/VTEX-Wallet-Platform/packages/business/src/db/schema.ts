import {
  bigint,
  boolean,
  char,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"
import { users } from "@vtex/core"

/**
 * Domaine Business (Wallet Pro). Miroir architectural de @vtex/wallet :
 * mêmes conventions (bigint autoincrement, centimes en BIGINT, enums,
 * horodatage created/updated). Une entreprise (`businesses`) est le
 * tenant racine ; tout le reste y est rattaché directement ou via
 * `businessId`. L'appartenance utilisateur passe par `businessMembers`
 * (un utilisateur peut appartenir à plusieurs entreprises avec des rôles
 * différents), jamais par une colonne `userId` sur les tables métier.
 */

/* ────────────────  Entreprise & équipe  ──────────────── */

export const businesses = mysqlTable("businesses", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  ownerUserId: bigint("owner_user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  legalName: varchar("legal_name", { length: 160 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }).notNull(),
  industry: varchar("industry", { length: 100 }),
  siren: varchar("siren", { length: 20 }),
  vatId: varchar("vat_id", { length: 32 }),
  address: varchar("address", { length: 250 }),
  email: varchar("email", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  logoUrl: varchar("logo_url", { length: 300 }),
  status: mysqlEnum("status", ["active", "suspended", "closed"]).notNull().default("active"),
  verifiedAt: datetime("verified_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  ownerIdx: index("businesses_owner_idx").on(t.ownerUserId),
  statusIdx: index("businesses_status_idx").on(t.status),
}))

export const businessMembers = mysqlTable("business_members", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  role: mysqlEnum("role", ["owner", "admin", "finance", "support", "viewer"]).notNull().default("viewer"),
  status: mysqlEnum("status", ["active", "invited", "suspended"]).notNull().default("invited"),
  invitedBy: bigint("invited_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  lastActiveAt: datetime("last_active_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessUserUnique: uniqueIndex("business_members_business_user_unique").on(t.businessId, t.userId),
  businessRoleIdx: index("business_members_business_role_idx").on(t.businessId, t.role),
}))

export const approvals = mysqlTable("approvals", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["payout", "payout_batch", "refund", "team_invite", "api_key"]).notNull(),
  targetId: bigint("target_id", { mode: "number" }).notNull(),
  requestedBy: bigint("requested_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  reason: varchar("reason", { length: 250 }),
  approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  approvedAt: datetime("approved_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessStatusIdx: index("approvals_business_status_idx").on(t.businessId, t.status),
  targetIdx: index("approvals_target_idx").on(t.kind, t.targetId),
}))

/* ────────────────  Wallet Pro : comptes, cartes, mouvements  ──────────────── */

export const businessWalletAccounts = mysqlTable("business_wallet_accounts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }).notNull().default("Compte principal"),
  iban: char("iban", { length: 34 }),
  bic: char("bic", { length: 11 }),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  availableBalanceCents: bigint("available_balance_cents", { mode: "number" }).notNull().default(0),
  reservedBalanceCents: bigint("reserved_balance_cents", { mode: "number" }).notNull().default(0),
  status: mysqlEnum("status", ["active", "frozen", "closed"]).notNull().default("active"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("business_wallet_accounts_business_idx").on(t.businessId),
  ibanUnique: uniqueIndex("business_wallet_accounts_iban_unique").on(t.iban),
}))

export const businessCards = mysqlTable("business_cards", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessWalletAccountId: bigint("business_wallet_account_id", { mode: "number" }).notNull(),
  assignedToUserId: bigint("assigned_to_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  cardholderName: varchar("cardholder_name", { length: 140 }).notNull(),
  lastFour: char("last_four", { length: 4 }).notNull(),
  network: mysqlEnum("network", ["visa", "mastercard", "cb"]).notNull().default("visa"),
  label: varchar("label", { length: 80 }).notNull().default("Carte VTEX Business"),
  theme: mysqlEnum("theme", ["navy", "teal", "brick"]).notNull().default("navy"),
  tokenReference: varchar("token_reference", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["active", "frozen", "expired", "cancelled"]).notNull().default("active"),
  dailyLimitCents: bigint("daily_limit_cents", { mode: "number" }).notNull().default(200000),
  monthlyLimitCents: bigint("monthly_limit_cents", { mode: "number" }).notNull().default(1000000),
  perTransactionLimitCents: bigint("per_transaction_limit_cents", { mode: "number" }).notNull().default(100000),
  onlinePaymentsEnabled: boolean("online_payments_enabled").notNull().default(true),
  contactlessEnabled: boolean("contactless_enabled").notNull().default(true),
  cashWithdrawalEnabled: boolean("cash_withdrawal_enabled").notNull().default(false),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  accountIdx: index("business_cards_account_idx").on(t.businessWalletAccountId),
  tokenUnique: uniqueIndex("business_cards_token_reference_unique").on(t.tokenReference),
  walletAccountFk: foreignKey({
    columns: [t.businessWalletAccountId],
    foreignColumns: [businessWalletAccounts.id],
    name: "business_cards_wallet_account_fk",
  }).onDelete("restrict"),
}))

export const businessTransactions = mysqlTable("business_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  businessWalletAccountId: bigint("business_wallet_account_id", { mode: "number" }).notNull(),
  cardId: bigint("card_id", { mode: "number" }).references(() => businessCards.id, { onDelete: "restrict" }),
  initiatedByUserId: bigint("initiated_by_user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  type: mysqlEnum("type", ["payout", "transfer", "card_payment", "invoice_payment", "payment_link", "checkout", "fee", "adjustment", "refund", "topup"]).notNull(),
  direction: mysqlEnum("direction", ["debit", "credit"]).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "rejected", "cancelled"]).notNull().default("pending"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  feeCents: bigint("fee_cents", { mode: "number" }).notNull().default(0),
  currency: char("currency", { length: 3 }).notNull(),
  description: varchar("description", { length: 250 }),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  completedAt: datetime("completed_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  referenceUnique: uniqueIndex("business_transactions_reference_unique").on(t.reference),
  businessCreatedIdx: index("business_transactions_business_created_idx").on(t.businessId, t.createdAt),
  accountCreatedIdx: index("business_transactions_account_created_idx").on(t.businessWalletAccountId, t.createdAt),
  statusIdx: index("business_transactions_status_idx").on(t.status),
  walletAccountFk: foreignKey({
    columns: [t.businessWalletAccountId],
    foreignColumns: [businessWalletAccounts.id],
    name: "business_transactions_wallet_account_fk",
  }).onDelete("restrict"),
}))

export const businessLedgerEntries = mysqlTable("business_ledger_entries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessWalletAccountId: bigint("business_wallet_account_id", { mode: "number" }).notNull(),
  transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
  entryKind: mysqlEnum("entry_kind", ["available", "reserved"]).notNull().default("available"),
  deltaCents: bigint("delta_cents", { mode: "number" }).notNull(),
  balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  accountCreatedIdx: index("business_ledger_entries_account_created_idx").on(t.businessWalletAccountId, t.createdAt),
  walletAccountFk: foreignKey({
    columns: [t.businessWalletAccountId],
    foreignColumns: [businessWalletAccounts.id],
    name: "business_ledger_entries_wallet_account_fk",
  }).onDelete("restrict"),
  transactionFk: foreignKey({
    columns: [t.transactionId],
    foreignColumns: [businessTransactions.id],
    name: "business_ledger_entries_transaction_fk",
  }).onDelete("restrict"),
}))

/**
 * Recharge d'un compte Wallet Pro par carte bancaire (Stripe). Une ligne = une
 * intention de paiement ; le crédit n'est fait qu'une fois, après relecture du
 * PaymentIntent auprès de Stripe.
 */
export const businessTopups = mysqlTable("business_topups", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "restrict" }),
  businessWalletAccountId: bigint("business_wallet_account_id", { mode: "number" }).notNull(),
  initiatedByUserId: bigint("initiated_by_user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "requires_action", "processing", "succeeded", "failed", "canceled", "refunded"]).notNull().default("pending"),
  stripeMode: mysqlEnum("stripe_mode", ["sim", "test", "live"]).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 80 }),
  cardBrand: varchar("card_brand", { length: 24 }),
  cardLast4: char("card_last4", { length: 4 }),
  billingName: varchar("billing_name", { length: 160 }),
  failureCode: varchar("failure_code", { length: 64 }),
  failureMessage: varchar("failure_message", { length: 250 }),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => businessTransactions.id, { onDelete: "set null" }),
  creditedAt: datetime("credited_at"),
  refundedAt: datetime("refunded_at"),
  refundReason: varchar("refund_reason", { length: 250 }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  referenceUnique: uniqueIndex("business_topups_reference_unique").on(t.reference),
  idempotencyUnique: uniqueIndex("business_topups_idempotency_key_unique").on(t.idempotencyKey),
  intentUnique: uniqueIndex("business_topups_intent_unique").on(t.stripePaymentIntentId),
  businessCreatedIdx: index("business_topups_business_created_idx").on(t.businessId, t.createdAt),
  statusIdx: index("business_topups_status_idx").on(t.status),
  walletAccountFk: foreignKey({
    columns: [t.businessWalletAccountId],
    foreignColumns: [businessWalletAccounts.id],
    name: "business_topups_wallet_account_fk",
  }).onDelete("restrict"),
}))

export const payoutBatches = mysqlTable("payout_batches", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
  itemsCount: int("items_count").notNull().default(0),
  status: mysqlEnum("status", ["draft", "pending_approval", "processing", "completed", "failed"]).notNull().default("draft"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("payout_batches_business_idx").on(t.businessId),
}))

export const payouts = mysqlTable("payouts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  batchId: bigint("batch_id", { mode: "number" }).references(() => payoutBatches.id, { onDelete: "set null" }),
  beneficiaryName: varchar("beneficiary_name", { length: 160 }).notNull(),
  iban: char("iban", { length: 34 }).notNull(),
  bic: char("bic", { length: 11 }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  reference: varchar("reference", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending_approval", "approved", "rejected", "processing", "completed", "failed"]).notNull().default("pending_approval"),
  requestedBy: bigint("requested_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  approvedAt: datetime("approved_at"),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => businessTransactions.id, { onDelete: "set null" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessStatusIdx: index("payouts_business_status_idx").on(t.businessId, t.status),
  batchIdx: index("payouts_batch_idx").on(t.batchId),
  referenceUnique: uniqueIndex("payouts_reference_unique").on(t.reference),
}))

/* ────────────────  CRM clients  ──────────────── */

export const customers = mysqlTable("customers", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  company: varchar("company", { length: 160 }),
  address: varchar("address", { length: 250 }),
  status: mysqlEnum("status", ["active", "blocked"]).notNull().default("active"),
  totalSpentCents: bigint("total_spent_cents", { mode: "number" }).notNull().default(0),
  ordersCount: int("orders_count").notNull().default(0),
  notes: text("notes"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("customers_business_idx").on(t.businessId),
  businessEmailIdx: index("customers_business_email_idx").on(t.businessId, t.email),
}))

/* ────────────────  Payment Links  ──────────────── */

export const paymentLinks = mysqlTable("payment_links", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 24 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  mode: mysqlEnum("mode", ["unique", "recurring"]).notNull().default("unique"),
  status: mysqlEnum("status", ["active", "expired", "draft", "disabled"]).notNull().default("draft"),
  /** Compte Wallet Pro crédité par les paiements (NULL = ancien lien : premier compte de l'entreprise). */
  targetAccountId: bigint("target_account_id", { mode: "number" }),
  description: varchar("description", { length: 250 }),
  expiresAt: datetime("expires_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  /** Clé d'API qui a créé le lien (NULL = créé depuis l'espace Pro) et clé d'idempotence fournie par l'appelant (`Idempotency-Key`). */
  createdViaKeyId: bigint("created_via_key_id", { mode: "number" }),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  slugUnique: uniqueIndex("payment_links_slug_unique").on(t.slug),
  businessIdx: index("payment_links_business_idx").on(t.businessId),
  targetIdx: index("payment_links_target_idx").on(t.targetAccountId),
  idempotencyUnique: uniqueIndex("payment_links_business_idempotency_unique").on(t.businessId, t.idempotencyKey),
}))

/**
 * Paiements effectués par un tiers via un lien de paiement public (`/pay/[slug]`). Même cycle que les recharges : intention chez le
 * prestataire, règlement vérifié (montant, devise, référence), puis crédit du compte cible en une transaction. Le numéro de carte ne
 * transite jamais par VTEX (Payment Element du prestataire ; simulateur uniquement en développement).
 */
export const paymentLinkPayments = mysqlTable("payment_link_payments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  paymentLinkId: bigint("payment_link_id", { mode: "number" }).notNull().references(() => paymentLinks.id, { onDelete: "restrict" }),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  businessWalletAccountId: bigint("business_wallet_account_id", { mode: "number" }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "requires_action", "processing", "succeeded", "failed", "canceled", "refunded"]).notNull().default("pending"),
  payerName: varchar("payer_name", { length: 160 }),
  payerEmail: varchar("payer_email", { length: 160 }),
  payerIp: varchar("payer_ip", { length: 45 }),
  stripeMode: mysqlEnum("stripe_mode", ["sim", "test", "live"]).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 80 }),
  cardBrand: varchar("card_brand", { length: 32 }),
  cardLast4: char("card_last4", { length: 4 }),
  failureCode: varchar("failure_code", { length: 64 }),
  failureMessage: varchar("failure_message", { length: 250 }),
  transactionId: bigint("transaction_id", { mode: "number" }),
  creditedAt: datetime("credited_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  referenceUnique: uniqueIndex("payment_link_payments_reference_unique").on(t.reference),
  idempotencyUnique: uniqueIndex("payment_link_payments_idempotency_unique").on(t.idempotencyKey),
  intentUnique: uniqueIndex("payment_link_payments_intent_unique").on(t.stripePaymentIntentId),
  linkStatusIdx: index("payment_link_payments_link_status_idx").on(t.paymentLinkId, t.status),
  businessCreatedIdx: index("payment_link_payments_business_created_idx").on(t.businessId, t.createdAt),
}))

export const paymentLinkEvents = mysqlTable("payment_link_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  paymentLinkId: bigint("payment_link_id", { mode: "number" }).notNull().references(() => paymentLinks.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["visit", "payment"]).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }),
  customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, { onDelete: "set null" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  linkKindIdx: index("payment_link_events_link_kind_idx").on(t.paymentLinkId, t.kind),
}))

/* ────────────────  Facturation : factures, devis, abonnements  ──────────────── */

export const invoices = mysqlTable("invoices", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 32 }).notNull(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id, { onDelete: "restrict" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  status: mysqlEnum("status", ["draft", "sent", "viewed", "partial", "paid", "overdue", "cancelled"]).notNull().default("draft"),
  issuedAt: datetime("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  dueAt: datetime("due_at").notNull(),
  description: varchar("description", { length: 250 }),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessNumberUnique: uniqueIndex("invoices_business_number_unique").on(t.businessId, t.number),
  businessStatusIdx: index("invoices_business_status_idx").on(t.businessId, t.status),
  customerIdx: index("invoices_customer_idx").on(t.customerId),
}))

export const invoiceItems = mysqlTable("invoice_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "number" }).notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 250 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
}, (t) => ({
  invoiceIdx: index("invoice_items_invoice_idx").on(t.invoiceId),
}))

export const invoicePayments = mysqlTable("invoice_payments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "number" }).notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  method: mysqlEnum("method", ["card", "transfer", "payment_link", "manual"]).notNull().default("manual"),
  reference: varchar("reference", { length: 64 }),
  paidAt: datetime("paid_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  invoiceIdx: index("invoice_payments_invoice_idx").on(t.invoiceId),
}))

export const estimates = mysqlTable("estimates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 32 }).notNull(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id, { onDelete: "restrict" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined", "expired"]).notNull().default("draft"),
  validUntil: datetime("valid_until"),
  convertedInvoiceId: bigint("converted_invoice_id", { mode: "number" }).references(() => invoices.id, { onDelete: "set null" }),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessNumberUnique: uniqueIndex("estimates_business_number_unique").on(t.businessId, t.number),
  businessStatusIdx: index("estimates_business_status_idx").on(t.businessId, t.status),
}))

export const estimateItems = mysqlTable("estimate_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  estimateId: bigint("estimate_id", { mode: "number" }).notNull().references(() => estimates.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 250 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
}, (t) => ({
  estimateIdx: index("estimate_items_estimate_idx").on(t.estimateId),
}))

export const subscriptions = mysqlTable("subscriptions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id, { onDelete: "restrict" }),
  planName: varchar("plan_name", { length: 120 }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  interval: mysqlEnum("interval", ["monthly", "yearly"]).notNull().default("monthly"),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "past_due"]).notNull().default("active"),
  currentPeriodStart: datetime("current_period_start").notNull().default(sql`CURRENT_TIMESTAMP`),
  currentPeriodEnd: datetime("current_period_end").notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessStatusIdx: index("subscriptions_business_status_idx").on(t.businessId, t.status),
  customerIdx: index("subscriptions_customer_idx").on(t.customerId),
}))

/* ────────────────  Catalogue & commandes  ──────────────── */

export const products = mysqlTable("products", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  sku: varchar("sku", { length: 64 }),
  priceCents: bigint("price_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  stock: int("stock").notNull().default(0),
  category: varchar("category", { length: 100 }),
  description: varchar("description", { length: 500 }),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("products_business_idx").on(t.businessId),
  businessSkuUnique: uniqueIndex("products_business_sku_unique").on(t.businessId, t.sku),
}))

export const orders = mysqlTable("orders", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 32 }).notNull(),
  customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, { onDelete: "set null" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  channel: mysqlEnum("channel", ["pos", "online", "manual"]).notNull().default("online"),
  status: mysqlEnum("status", ["pending", "paid", "fulfilled", "refunded", "cancelled"]).notNull().default("pending"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessNumberUnique: uniqueIndex("orders_business_number_unique").on(t.businessId, t.number),
  businessStatusIdx: index("orders_business_status_idx").on(t.businessId, t.status),
}))

export const orderItems = mysqlTable("order_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: bigint("product_id", { mode: "number" }).references(() => products.id, { onDelete: "set null" }),
  description: varchar("description", { length: 250 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
}, (t) => ({
  orderIdx: index("order_items_order_idx").on(t.orderId),
}))

/* ────────────────  Résolution : litiges, chargebacks, risque  ──────────────── */

export const disputes = mysqlTable("disputes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => businessTransactions.id, { onDelete: "set null" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  reason: varchar("reason", { length: 250 }).notNull(),
  status: mysqlEnum("status", ["open", "under_review", "won", "lost"]).notNull().default("open"),
  evidenceDueAt: datetime("evidence_due_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessStatusIdx: index("disputes_business_status_idx").on(t.businessId, t.status),
}))

export const chargebacks = mysqlTable("chargebacks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  disputeId: bigint("dispute_id", { mode: "number" }).references(() => disputes.id, { onDelete: "set null" }),
  network: mysqlEnum("network", ["visa", "mastercard", "cb"]).notNull().default("visa"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  reference: varchar("reference", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["open", "accepted", "represented", "won", "lost"]).notNull().default("open"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessStatusIdx: index("chargebacks_business_status_idx").on(t.businessId, t.status),
  referenceUnique: uniqueIndex("chargebacks_reference_unique").on(t.reference),
}))

export const riskFlags = mysqlTable("risk_flags", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => businessTransactions.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["velocity", "geo", "amount", "device"]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high"]).notNull().default("low"),
  status: mysqlEnum("status", ["open", "dismissed", "confirmed"]).notNull().default("open"),
  description: varchar("description", { length: 250 }).notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: datetime("resolved_at"),
}, (t) => ({
  businessStatusIdx: index("risk_flags_business_status_idx").on(t.businessId, t.status),
}))

/* ────────────────  Developers  ──────────────── */

export const apiKeys = mysqlTable("api_keys", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull(),
  mode: mysqlEnum("mode", ["live", "sandbox"]).notNull().default("sandbox"),
  scopes: json("scopes").$type<string[]>().notNull(),
  lastUsedAt: datetime("last_used_at"),
  /** Dernière adresse ayant utilisé la clé (traçabilité d'usage ; jamais renvoyée au titulaire de l'espace Pro). */
  lastUsedIp: varchar("last_used_ip", { length: 45 }),
  status: mysqlEnum("status", ["active", "revoked"]).notNull().default("active"),
  /** Expiration planifiée (NULL = n'expire pas). Une clé expirée est refusée comme une clé révoquée. */
  expiresAt: datetime("expires_at"),
  revokedAt: datetime("revoked_at"),
  revokedBy: bigint("revoked_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  revokeReason: varchar("revoke_reason", { length: 250 }),
  /** Clé remplacée par cette rotation (traçabilité de la chaîne de rotation). */
  rotatedFromId: bigint("rotated_from_id", { mode: "number" }),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("api_keys_business_idx").on(t.businessId),
  keyHashUnique: uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
}))

export const applications = mysqlTable("applications", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  clientId: varchar("client_id", { length: 64 }).notNull(),
  clientSecretHash: varchar("client_secret_hash", { length: 128 }).notNull(),
  redirectUris: json("redirect_uris").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("applications_business_idx").on(t.businessId),
  clientIdUnique: uniqueIndex("applications_client_id_unique").on(t.clientId),
}))

export const webhooks = mysqlTable("webhooks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  businessId: bigint("business_id", { mode: "number" }).notNull().references(() => businesses.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 300 }).notNull(),
  events: json("events").$type<string[]>().notNull(),
  secret: varchar("secret", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  lastDeliveryAt: datetime("last_delivery_at"),
  lastStatusCode: int("last_status_code"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  businessIdx: index("webhooks_business_idx").on(t.businessId),
}))

export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  webhookId: bigint("webhook_id", { mode: "number" }).notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 80 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  statusCode: int("status_code"),
  success: boolean("success").notNull().default(false),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  webhookIdx: index("webhook_deliveries_webhook_idx").on(t.webhookId, t.createdAt),
}))

/* ────────────────  Paramètres Business  ──────────────── */

export const businessSettings = mysqlTable("business_settings", {
  businessId: bigint("business_id", { mode: "number" }).primaryKey().references(() => businesses.id, { onDelete: "cascade" }),
  checkoutBrandColor: char("checkout_brand_color", { length: 7 }).notNull().default("#8EA9FF"),
  invoicePrefix: varchar("invoice_prefix", { length: 12 }).notNull().default("INV"),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("EUR"),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifySms: boolean("notify_sms").notNull().default(false),
  notifyPush: boolean("notify_push").notNull().default(true),
  require2fa: boolean("require_2fa").notNull().default(false),
  ipAllowlist: json("ip_allowlist").$type<string[]>().default([]),
  sessionTimeoutMinutes: int("session_timeout_minutes").notNull().default(60),
  integrations: json("integrations").$type<Record<string, boolean>>().default({}),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export type Business = typeof businesses.$inferSelect
export type BusinessMember = typeof businessMembers.$inferSelect
export type Approval = typeof approvals.$inferSelect
export type BusinessWalletAccount = typeof businessWalletAccounts.$inferSelect
export type BusinessCard = typeof businessCards.$inferSelect
export type BusinessTransaction = typeof businessTransactions.$inferSelect
export type BusinessTopup = typeof businessTopups.$inferSelect
export type PayoutBatch = typeof payoutBatches.$inferSelect
export type Payout = typeof payouts.$inferSelect
export type Customer = typeof customers.$inferSelect
export type PaymentLink = typeof paymentLinks.$inferSelect
export type PaymentLinkPayment = typeof paymentLinkPayments.$inferSelect
export type Invoice = typeof invoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type Estimate = typeof estimates.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
export type Dispute = typeof disputes.$inferSelect
export type Chargeback = typeof chargebacks.$inferSelect
export type RiskFlag = typeof riskFlags.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Application = typeof applications.$inferSelect
export type Webhook = typeof webhooks.$inferSelect
export type BusinessSettings = typeof businessSettings.$inferSelect
