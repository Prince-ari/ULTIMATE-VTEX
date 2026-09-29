import { randomUUID } from "node:crypto"
import { db, hashPassword, users, ValidationError, type Actor } from "@vtex/core"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { scheduledTransfers, transferCodes, walletAccounts } from "./db/schema"
import {
  adminSendUnlockCode,
  cancelScheduledTransfer,
  confirmTransferUnlock,
  ensureWalletAccount,
  executeDueScheduledTransfers,
  requestTransferCode,
  requestTransferUnlock,
  scheduleTransferInternal,
} from "./service"

async function makeActor(role: "user" | "admin"): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Sched", lastName: suffix, email: `scheduled-transfer-${suffix}@test.local`, passwordHash: hashPassword("scheduled-pass-123"), role, status: "active" })
  return { id: inserted.insertId, role }
}

async function plainCodeFor(walletAccountId: number): Promise<string> {
  const [row] = await db.select().from(transferCodes).where(eq(transferCodes.walletAccountId, walletAccountId)).limit(1)
  if (!row) throw new Error("Code de virement introuvable pour ce test.")
  return row.code
}

/** Débloque un compte neuf (démarre verrouillé) via le parcours réel : demande, code admin, confirmation. */
async function unlockAccount(user: Actor, admin: Actor, walletAccountId: number) {
  await requestTransferUnlock(user)
  await adminSendUnlockCode(admin, walletAccountId)
  await confirmTransferUnlock(user, await plainCodeFor(walletAccountId))
}

describe("virements internes programmés (« latents »)", () => {
  it("réserve les fonds à la programmation, exécute à l'échéance, crédite le destinataire", async () => {
    const admin = await makeActor("admin")
    const sender = await makeActor("user")
    const recipient = await makeActor("user")
    const source = await ensureWalletAccount(sender, "EUR")
    const destination = await ensureWalletAccount(recipient, "EUR")
    await unlockAccount(sender, admin, source.id)
    await db.update(walletAccounts).set({ availableBalanceCents: 10_000 }).where(eq(walletAccounts.id, source.id))

    await requestTransferCode(sender, source.id)
    const code = await plainCodeFor(source.id)
    const scheduledAt = new Date(Date.now() + 10 * 60_000)
    const { scheduledTransferId } = await scheduleTransferInternal(sender, {
      fromWalletAccountId: source.id,
      toWalletAccountId: destination.id,
      amountCents: 2_500,
      description: "Test programmé",
      scheduledAt,
      code,
    })

    const [afterSchedule] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, source.id)).limit(1)
    expect(afterSchedule?.availableBalanceCents).toBe(7_500)
    expect(afterSchedule?.reservedBalanceCents).toBe(2_500)

    // Simule l'échéance (le test ne peut pas attendre dix minutes) : on avance la date en base, comme le ferait le temps réel.
    await db.update(scheduledTransfers).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(scheduledTransfers.id, scheduledTransferId))
    await executeDueScheduledTransfers()

    const [executedRow] = await db.select().from(scheduledTransfers).where(eq(scheduledTransfers.id, scheduledTransferId)).limit(1)
    expect(executedRow?.status).toBe("executed")
    expect(executedRow?.transactionId).not.toBeNull()

    const [sourceAfter] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, source.id)).limit(1)
    const [destinationAfter] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, destination.id)).limit(1)
    expect(sourceAfter?.availableBalanceCents).toBe(7_500)
    expect(sourceAfter?.reservedBalanceCents).toBe(0)
    expect(destinationAfter?.availableBalanceCents).toBe(2_500)

    // Un second passage n'exécute rien deux fois (la ligne n'est plus "pending").
    await executeDueScheduledTransfers()
    const [destinationAfterSecondPass] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, destination.id)).limit(1)
    expect(destinationAfterSecondPass?.availableBalanceCents).toBe(2_500)
  })

  it("l'annulation libère intégralement les fonds réservés", async () => {
    const admin = await makeActor("admin")
    const sender = await makeActor("user")
    const recipient = await makeActor("user")
    const source = await ensureWalletAccount(sender, "EUR")
    const destination = await ensureWalletAccount(recipient, "EUR")
    await unlockAccount(sender, admin, source.id)
    await db.update(walletAccounts).set({ availableBalanceCents: 5_000 }).where(eq(walletAccounts.id, source.id))

    await requestTransferCode(sender, source.id)
    const code = await plainCodeFor(source.id)
    const { scheduledTransferId } = await scheduleTransferInternal(sender, {
      fromWalletAccountId: source.id,
      toWalletAccountId: destination.id,
      amountCents: 1_000,
      scheduledAt: new Date(Date.now() + 10 * 60_000),
      code,
    })

    await cancelScheduledTransfer(sender, scheduledTransferId)
    const [account] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, source.id)).limit(1)
    expect(account?.availableBalanceCents).toBe(5_000)
    expect(account?.reservedBalanceCents).toBe(0)
    const [row] = await db.select().from(scheduledTransfers).where(eq(scheduledTransfers.id, scheduledTransferId)).limit(1)
    expect(row?.status).toBe("cancelled")

    // Une fois annulé, il n'est plus modifiable.
    await expect(cancelScheduledTransfer(sender, scheduledTransferId)).rejects.toThrow(ValidationError)
  })

  it("refuse une programmation trop proche, un compte source = destination, ou verrouillé", async () => {
    const admin = await makeActor("admin")
    const sender = await makeActor("user")
    const recipient = await makeActor("user")
    const source = await ensureWalletAccount(sender, "EUR")
    const destination = await ensureWalletAccount(recipient, "EUR")
    await unlockAccount(sender, admin, source.id)

    await expect(scheduleTransferInternal(sender, { fromWalletAccountId: source.id, toWalletAccountId: source.id, amountCents: 100, scheduledAt: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/différents/)
    await expect(scheduleTransferInternal(sender, { fromWalletAccountId: source.id, toWalletAccountId: destination.id, amountCents: 100, scheduledAt: new Date(Date.now() + 60_000) })).rejects.toThrow(/cinq minutes/)

    // Un compte encore verrouillé (destination neuve, jamais débloquée) refuse la programmation en tant que source.
    await expect(scheduleTransferInternal(recipient, { fromWalletAccountId: destination.id, toWalletAccountId: source.id, amountCents: 100, scheduledAt: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/verrouillé/)
  })
})
