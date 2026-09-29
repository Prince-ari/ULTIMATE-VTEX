import { checkRateLimit, db, protectedProcedure, router } from "@vtex/core"
import { CURRENCY_CODES } from "@vtex/money"
import { z } from "zod"
import {
  adjustWalletBalance,
  adminSendUnlockCode,
  authorizeCardPayment,
  closeSavingsGoal,
  cancelCard,
  confirmTransferUnlock,
  createAdminBeneficiary,
  createAdminWallet,
  createBeneficiary,
  createCard,
  provisionBankDetails,
  updateBankDetails,
  revokeBankDetails,
  listBankDetailsHistory,
  renewCard,
  replaceCard,
  requestTransferCode,
  requestTransferUnlock,
  setCardPin,
  emergencyWalletLockdown,
  createSavingsGoal,
  deleteBeneficiary,
  ensureWalletAccount,
  financialKpis,
  fundSavingsGoal,
  getMyWallet,
  getAdminWalletDetail,
  reconciliationSummary,
  listAdminTransactions,
  listAdminCards,
  listAdminWallets,
  listMyBeneficiaries,
  listMyCards,
  listMyTransactions,
  listSavingsGoals,
  resolvePendingTransaction,
  shareFunds,
  setCardFrozen,
  transferExternal,
  transferInternal,
  updateBeneficiary,
  updateCardControls,
  listWalletPermissions,
  updateWalletPermission,
  walletPermissionNames,
  updateAdminWalletStatus,
  updateSavingsGoal,
} from "./service"
import { listMyBankAccounts, myBankAccountReceiveQr } from "./bankAccounts"
import { adminGetWalletSettings, adminUpdateWalletSettings, getMyWalletSettings, updateMyWalletSettings } from "./settings"
import { cancelWalletTopup, confirmWalletTopup, createWalletTopup, listAdminWalletTopups, listMyTopups, reconcileWalletTopup, refundWalletTopup, simAuthenticateWalletTopup, simPayWalletTopup, stripeStatusForAdmin, walletTopupConfig } from "./topups"

const cents = z.number().int().safe()
const currency = z.enum(CURRENCY_CODES)
const idempotencyKey = z.string().min(16).max(100)
const walletWriteProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `wallet:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})
const walletMoneyProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `wallet:money:${ctx.actor.id}:${ctx.ip}`, 10, 60_000)
  return next()
})
/** Envoi de code (e-mail) : borné plus sévèrement que les autres écritures pour ne jamais servir de canal de spam. */
const walletCodeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `wallet:code:${ctx.actor.id}:${ctx.ip}`, 5, 5 * 60_000)
  return next()
})

export const walletRouter = router({
  wallets: router({
    mine: protectedProcedure.input(z.object({ currency: currency.optional() }).optional()).query(({ ctx, input }) => getMyWallet(ctx.actor, input?.currency)),
    ensure: walletWriteProcedure.input(z.object({ currency: currency.default("EUR") })).mutation(({ ctx, input }) => ensureWalletAccount(ctx.actor, input.currency)),
    bootstrap: walletWriteProcedure.mutation(({ ctx }) => import("./service").then(({ bootstrapWallet }) => bootstrapWallet(ctx.actor))),
    provisionBankDetails: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive().optional() }).optional()).mutation(({ ctx, input }) => provisionBankDetails(ctx.actor, input?.walletAccountId)),
  }),
  bankAccounts: router({
    mine: protectedProcedure.query(({ ctx }) => listMyBankAccounts(ctx.actor)),
    receiveQr: protectedProcedure.input(z.object({ bankAccountId: z.number().int().positive(), amountCents: cents.positive().optional() })).query(({ ctx, input }) => myBankAccountReceiveQr(ctx.actor, input.bankAccountId, input.amountCents)),
  }),
  cards: router({
    listMine: protectedProcedure.query(({ ctx }) => listMyCards(ctx.actor)),
    setFrozen: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), frozen: z.boolean() })).mutation(({ ctx, input }) => setCardFrozen(ctx.actor, input.cardId, input.frozen)),
    updateControls: walletWriteProcedure.input(z.object({
      cardId: z.number().int().positive(),
      onlinePaymentsEnabled: z.boolean().optional(),
      contactlessEnabled: z.boolean().optional(),
      cashWithdrawalEnabled: z.boolean().optional(),
      dailyLimitCents: cents.positive().optional(),
      monthlyLimitCents: cents.positive().optional(),
      perTransactionLimitCents: cents.positive().optional(),
    })).mutation(({ ctx, input }) => updateCardControls(ctx.actor, input.cardId, {
      onlinePaymentsEnabled: input.onlinePaymentsEnabled,
      contactlessEnabled: input.contactlessEnabled,
      cashWithdrawalEnabled: input.cashWithdrawalEnabled,
    }, {
      dailyLimitCents: input.dailyLimitCents,
      monthlyLimitCents: input.monthlyLimitCents,
      perTransactionLimitCents: input.perTransactionLimitCents,
    })),
    create: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), label: z.string().min(1).max(80), lastFour: z.string().regex(/^\d{4}$/), network: z.enum(["visa", "mastercard", "cb"]), expiresAt: z.date() })).mutation(({ ctx, input }) => createCard(ctx.actor, input)),
    authorizePayment: walletMoneyProcedure.input(z.object({ cardId: z.number().int().positive(), amountCents: cents.positive(), merchantName: z.string().min(2).max(140), channel: z.enum(["online", "contactless", "cash_withdrawal"]), idempotencyKey })).mutation(({ ctx, input }) => authorizeCardPayment(ctx.actor, input)),
    setPin: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), pin: z.string().regex(/^\d{4}$/, "Le PIN doit contenir quatre chiffres.") })).mutation(({ ctx, input }) => setCardPin(ctx.actor, input.cardId, input.pin)),
    renew: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), idempotencyKey })).mutation(({ ctx, input }) => renewCard(ctx.actor, input.cardId, input.idempotencyKey)),
    replace: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), reason: z.string().min(5).max(250), idempotencyKey })).mutation(({ ctx, input }) => replaceCard(ctx.actor, input.cardId, input.reason, input.idempotencyKey)),
  }),
  beneficiaries: router({
    listMine: protectedProcedure.query(({ ctx }) => listMyBeneficiaries(ctx.actor)),
    create: walletWriteProcedure.input(z.object({ fullName: z.string().min(2).max(160), nickname: z.string().max(80).optional(), iban: z.string().min(15).max(64), bic: z.string().max(16).optional(), internalWalletAccountId: z.number().int().positive().nullable().optional() })).mutation(({ ctx, input }) => createBeneficiary(ctx.actor, input)),
    update: walletWriteProcedure.input(z.object({ id: z.number().int().positive(), fullName: z.string().min(2).max(160).optional(), nickname: z.string().max(80).optional(), iban: z.string().min(15).max(64).optional(), bic: z.string().max(16).optional(), status: z.enum(["active", "disabled"]).optional(), internalWalletAccountId: z.number().int().positive().nullable().optional() })).mutation(({ ctx, input }) => updateBeneficiary(ctx.actor, input.id, input)),
    delete: walletWriteProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteBeneficiary(ctx.actor, input.id)),
  }),
  transactions: router({
    listMine: protectedProcedure.input(z.object({ offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(({ ctx, input }) => listMyTransactions(ctx.actor, input ?? {})),
    transferInternal: walletMoneyProcedure.input(z.object({ fromWalletAccountId: z.number().int().positive(), toWalletAccountId: z.number().int().positive(), amountCents: cents.positive(), description: z.string().max(250).optional(), idempotencyKey, code: z.string().max(6).optional() })).mutation(({ ctx, input }) => transferInternal(ctx.actor, input)),
    transferExternal: walletMoneyProcedure.input(z.object({ walletAccountId: z.number().int().positive(), beneficiaryId: z.number().int().positive(), amountCents: cents.positive(), description: z.string().max(250).optional(), idempotencyKey, code: z.string().max(6).optional() })).mutation(({ ctx, input }) => transferExternal(ctx.actor, input)),
    shareFunds: walletMoneyProcedure.input(z.object({ fromWalletAccountId: z.number().int().positive(), recipients: z.array(z.object({ walletAccountId: z.number().int().positive(), amountCents: cents.positive() })).min(1).max(20), description: z.string().max(250).optional(), idempotencyKey, code: z.string().max(6).optional() })).mutation(({ ctx, input }) => shareFunds(ctx.actor, input)),
    resolvePending: walletMoneyProcedure.input(z.object({ transactionId: z.number().int().positive(), approved: z.boolean(), reason: z.string().max(250).optional() })).mutation(({ ctx, input }) => resolvePendingTransaction(ctx.actor, input.transactionId, input.approved, input.reason)),
    requestUnlock: walletWriteProcedure.mutation(({ ctx }) => requestTransferUnlock(ctx.actor)),
    confirmUnlock: walletCodeProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/, "Le code doit contenir six chiffres.") })).mutation(({ ctx, input }) => confirmTransferUnlock(ctx.actor, input.code)),
    requestCode: walletCodeProcedure.input(z.object({ walletAccountId: z.number().int().positive() })).mutation(({ ctx, input }) => requestTransferCode(ctx.actor, input.walletAccountId)),
  }),
  savingsGoals: router({
    listMine: protectedProcedure.query(({ ctx }) => listSavingsGoals(ctx.actor)),
    create: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), name: z.string().min(2).max(100), targetCents: cents.positive(), dueAt: z.coerce.date().optional() })).mutation(({ ctx, input }) => createSavingsGoal(ctx.actor, input)),
    fund: walletMoneyProcedure.input(z.object({ goalId: z.number().int().positive(), amountCents: cents.positive(), idempotencyKey })).mutation(({ ctx, input }) => fundSavingsGoal(ctx.actor, input)),
    update: walletWriteProcedure.input(z.object({ goalId: z.number().int().positive(), name: z.string().min(2).max(100).optional(), targetCents: cents.positive().optional(), dueAt: z.coerce.date().nullable().optional() }).refine((input) => input.name !== undefined || input.targetCents !== undefined || input.dueAt !== undefined, "Au moins un champ doit être modifié.")).mutation(({ ctx, input }) => updateSavingsGoal(ctx.actor, input.goalId, input)),
    close: walletMoneyProcedure.input(z.object({ goalId: z.number().int().positive(), idempotencyKey })).mutation(({ ctx, input }) => closeSavingsGoal(ctx.actor, input)),
  }),
  walletAdmin: router({
    bankDetailsHistory: protectedProcedure.input(z.object({ walletAccountId: z.number().int().positive() })).query(({ ctx, input }) => listBankDetailsHistory(ctx.actor, input.walletAccountId)),
    updateBankDetails: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), iban: z.string().min(15).max(34), bic: z.string().min(8).max(11), reason: z.string().min(8).max(250) })).mutation(({ ctx, input }) => updateBankDetails(ctx.actor, input)),
    revokeBankDetails: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), reason: z.string().min(8).max(250) })).mutation(({ ctx, input }) => revokeBankDetails(ctx.actor, input)),
    permissions: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => listWalletPermissions(ctx.actor, input.userId)),
    updatePermission: walletWriteProcedure.input(z.object({ userId: z.number().int().positive(), permission: z.enum(walletPermissionNames), allowed: z.boolean() })).mutation(({ ctx, input }) => updateWalletPermission(ctx.actor, input)),
    wallets: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ ctx, input }) => listAdminWallets(ctx.actor, input)),
    cards: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ ctx, input }) => listAdminCards(ctx.actor, input)),
    transactions: protectedProcedure.input(z.object({ status: z.enum(["pending", "completed", "rejected", "cancelled"]).optional(), limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ ctx, input }) => listAdminTransactions(ctx.actor, input)),
    kpis: protectedProcedure.query(({ ctx }) => financialKpis(ctx.actor)),
    reconciliation: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ ctx, input }) => reconciliationSummary(ctx.actor, input)),
    detail: protectedProcedure.input(z.object({ walletAccountId: z.number().int().positive() })).query(({ ctx, input }) => getAdminWalletDetail(ctx.actor, input.walletAccountId)),
    createWallet: walletWriteProcedure.input(z.object({ userId: z.number().int().positive(), currency })).mutation(({ ctx, input }) => createAdminWallet(ctx.actor, input)),
    provisionBankDetails: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive() })).mutation(({ ctx, input }) => provisionBankDetails(ctx.actor, input.walletAccountId)),
    updateWalletStatus: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), status: z.enum(["active", "frozen", "closed"]) })).mutation(({ ctx, input }) => updateAdminWalletStatus(ctx.actor, input.walletAccountId, input.status)),
    cancelCard: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive() })).mutation(({ ctx, input }) => cancelCard(ctx.actor, input.cardId)),
    renewCard: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), idempotencyKey })).mutation(({ ctx, input }) => renewCard(ctx.actor, input.cardId, input.idempotencyKey)),
    replaceCard: walletWriteProcedure.input(z.object({ cardId: z.number().int().positive(), reason: z.string().min(5).max(250), idempotencyKey })).mutation(({ ctx, input }) => replaceCard(ctx.actor, input.cardId, input.reason, input.idempotencyKey)),
    createBeneficiary: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), fullName: z.string().min(2).max(160), nickname: z.string().max(80).optional(), iban: z.string().min(15).max(64), bic: z.string().max(16).optional(), internalWalletAccountId: z.number().int().positive().nullable().optional() })).mutation(({ ctx, input }) => createAdminBeneficiary(ctx.actor, input)),
    adjustBalance: walletMoneyProcedure.input(z.object({ walletAccountId: z.number().int().positive(), deltaCents: cents.refine((value) => value !== 0), reason: z.string().min(8).max(250), idempotencyKey, valueDate: z.coerce.date().optional(), counterpartyLabel: z.string().trim().max(120).optional() })).mutation(({ ctx, input }) => adjustWalletBalance(ctx.actor, input)),
    emergencyLockdown: walletWriteProcedure.input(z.object({ walletAccountId: z.number().int().positive(), reason: z.string().min(8).max(250), idempotencyKey })).mutation(({ ctx, input }) => emergencyWalletLockdown(ctx.actor, input)),
    sendUnlockCode: walletCodeProcedure.input(z.object({ walletAccountId: z.number().int().positive() })).mutation(({ ctx, input }) => adminSendUnlockCode(ctx.actor, input.walletAccountId)),
    stripeStatus: protectedProcedure.query(({ ctx }) => stripeStatusForAdmin(ctx.actor)),
    topups: protectedProcedure.input(z.object({ status: z.enum(["pending", "requires_action", "processing", "succeeded", "failed", "canceled", "refunded"]).optional(), limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ ctx, input }) => listAdminWalletTopups(ctx.actor, input)),
    reconcileTopup: walletWriteProcedure.input(z.object({ reference: z.string().min(8).max(64) })).mutation(({ ctx, input }) => reconcileWalletTopup(ctx.actor, input.reference)),
    cancelTopup: walletWriteProcedure.input(z.object({ reference: z.string().min(8).max(64) })).mutation(({ ctx, input }) => cancelWalletTopup(ctx.actor, input.reference)),
    refundTopup: walletMoneyProcedure.input(z.object({ reference: z.string().min(8).max(64), reason: z.string().min(8).max(250) })).mutation(({ ctx, input }) => refundWalletTopup(ctx.actor, input)),
  }),
  walletSettings: router({
    mine: protectedProcedure.query(({ ctx }) => getMyWalletSettings(ctx.actor)),
    updateMine: walletWriteProcedure.input(z.object({ displayCurrency: currency.optional(), displayName: z.string().trim().max(60).nullable().optional() })).mutation(({ ctx, input }) => updateMyWalletSettings(ctx.actor, input)),
    adminGet: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => adminGetWalletSettings(ctx.actor, input.userId)),
    adminUpdate: walletWriteProcedure.input(z.object({ userId: z.number().int().positive(), displayCurrency: currency })).mutation(({ ctx, input }) => adminUpdateWalletSettings(ctx.actor, input.userId, { displayCurrency: input.displayCurrency })),
  }),
  topups: router({
    config: protectedProcedure.input(z.object({ currency: currency.default("EUR") }).optional()).query(({ ctx, input }) => walletTopupConfig(ctx.actor, input?.currency ?? "EUR")),
    create: walletMoneyProcedure.input(z.object({ currency: currency.default("EUR"), amountCents: cents.positive(), idempotencyKey })).mutation(({ ctx, input }) => createWalletTopup(ctx.actor, input)),
    confirm: walletWriteProcedure.input(z.object({ reference: z.string().min(8).max(64) })).mutation(({ ctx, input }) => confirmWalletTopup(ctx.actor, input.reference)),
    listMine: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional()).query(({ ctx, input }) => listMyTopups(ctx.actor, input?.limit)),
    simPay: walletMoneyProcedure.input(z.object({ reference: z.string().min(8).max(64), cardNumber: z.string().min(12).max(23) })).mutation(({ ctx, input }) => simPayWalletTopup(ctx.actor, input)),
    simAuthenticate: walletWriteProcedure.input(z.object({ reference: z.string().min(8).max(64) })).mutation(({ ctx, input }) => simAuthenticateWalletTopup(ctx.actor, input.reference)),
  }),
})
