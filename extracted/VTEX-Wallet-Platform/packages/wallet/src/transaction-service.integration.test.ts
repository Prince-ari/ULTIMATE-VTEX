import { db } from "@vtex/core"
import { eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"

import { transactions, walletAccounts, walletLedgerEntries } from "./db/schema"
import { adjustWalletBalance, ensureWalletAccount } from "./service"

const describeIntegration = process.env.VTEX_INTEGRATION_TESTS === "1" ? describe : describe.skip
const admin = { id: 1, role: "admin" as const }
const user = { id: 1, role: "user" as const }
const key = `vitest-adjustment-${Date.now()}-${Math.random().toString(16).slice(2)}`

describeIntegration("services transactionnels Wallet sur MariaDB", () => {
  let accountId: number
  let transactionId: number

  it("écrit un ajustement monétaire une fois et rejoue la même réponse", async () => {
    const account = await ensureWalletAccount(admin)
    accountId = account.id
    const [before] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, accountId)).limit(1)
    const first = await adjustWalletBalance(admin, {
      walletAccountId: accountId,
      deltaCents: 111,
      reason: "Ajustement Vitest contrôlé",
      idempotencyKey: key,
    })
    const replay = await adjustWalletBalance(admin, {
      walletAccountId: accountId,
      deltaCents: 111,
      reason: "Ajustement Vitest contrôlé",
      idempotencyKey: key,
    })
    transactionId = first.transactionId
    const [after] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, accountId)).limit(1)
    const rows = await db.select().from(transactions).where(eq(transactions.idempotencyKey, key))
    const ledger = await db.select().from(walletLedgerEntries).where(eq(walletLedgerEntries.transactionId, transactionId))

    expect(first.replayed).toBe(false)
    expect(replay).toMatchObject({ transactionId: first.transactionId, replayed: true })
    expect(after?.availableBalanceCents).toBe((before?.availableBalanceCents ?? 0) + 111)
    expect(rows).toHaveLength(1)
    expect(ledger).toHaveLength(1)
  })

  it("refuse un ajustement monétaire à un rôle non administrateur", async () => {
    await expect(adjustWalletBalance(user, {
      walletAccountId: accountId,
      deltaCents: 111,
      reason: "Ajustement interdit",
      idempotencyKey: `${key}-forbidden`,
    })).rejects.toThrow("non autorisé")
  })

  afterAll(async () => {
    if (!transactionId) return
    await adjustWalletBalance(admin, {
      walletAccountId: accountId,
      deltaCents: -111,
      reason: "Annulation Vitest contrôlée",
      idempotencyKey: `${key}-revert`,
    })
  })
})
