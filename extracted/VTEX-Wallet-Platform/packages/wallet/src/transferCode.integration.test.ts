import { db } from "@vtex/core"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { transferCodes, walletAccounts } from "./db/schema"
import { TRANSFER_CODE_MAX_ATTEMPTS, adminSendUnlockCode, confirmTransferUnlock, ensureWalletAccount, requestTransferUnlock } from "./service"

const describeIntegration = process.env.VTEX_INTEGRATION_TESTS === "1" ? describe : describe.skip
const admin = { id: 1, role: "admin" as const }
const user = { id: 1, role: "user" as const }

async function plainCodeFor(walletAccountId: number): Promise<string> {
  const [row] = await db.select().from(transferCodes).where(eq(transferCodes.walletAccountId, walletAccountId)).limit(1)
  if (!row) throw new Error("Code de virement introuvable pour ce test.")
  return row.code
}

describeIntegration("verrouillage des virements et codes de sécurité sur MariaDB", () => {
  it("un compte neuf démarre verrouillé ; la demande de déblocage puis le code de l’administrateur le débloquent", async () => {
    const account = await ensureWalletAccount(user, "USD")
    expect(account.transfersLocked).toBe(true)
    expect(account.unlockRequestedAt).toBeNull()

    await requestTransferUnlock(user)
    const [afterRequest] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, account.id)).limit(1)
    expect(afterRequest?.unlockRequestedAt).not.toBeNull()

    await adminSendUnlockCode(admin, account.id)
    const code = await plainCodeFor(account.id)
    expect(code).toMatch(/^\d{6}$/)

    const wrongCode = code === "000000" ? "111111" : "000000"
    await expect(confirmTransferUnlock(user, wrongCode)).rejects.toThrow(/incorrect/)
    await confirmTransferUnlock(user, code)

    const [unlocked] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, account.id)).limit(1)
    expect(unlocked?.transfersLocked).toBe(false)
    expect(unlocked?.unlockRequestedAt).toBeNull()

    // Le compte est déjà débloqué : rejouer même le bon code (déjà consommé) est rejeté d'entrée.
    await expect(confirmTransferUnlock(user, code)).rejects.toThrow(/déjà débloqué/)
  })

  it("un code épuise ses essais et s’annule plutôt que de rester devinable indéfiniment — le compte reste verrouillé", async () => {
    const account = await ensureWalletAccount(user, "XPF")
    expect(account.transfersLocked).toBe(true)

    await requestTransferUnlock(user)
    await adminSendUnlockCode(admin, account.id)
    const code = await plainCodeFor(account.id)
    const wrongCode = code === "000000" ? "111111" : "000000"

    for (let attempt = 0; attempt <= TRANSFER_CODE_MAX_ATTEMPTS; attempt += 1) {
      const stillPresent = (await db.select().from(transferCodes).where(eq(transferCodes.walletAccountId, account.id)).limit(1)).length > 0
      if (!stillPresent) break
      // eslint-disable-next-line no-await-in-loop
      await expect(confirmTransferUnlock(user, wrongCode)).rejects.toThrow()
    }

    const remaining = await db.select().from(transferCodes).where(eq(transferCodes.walletAccountId, account.id)).limit(1)
    expect(remaining).toHaveLength(0)

    const [stillLocked] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, account.id)).limit(1)
    expect(stillLocked?.transfersLocked).toBe(true)

    // Une nouvelle demande obtient un nouveau code (la ligne épuisée n'empêche pas un renouvellement).
    await adminSendUnlockCode(admin, account.id)
    const freshCode = await plainCodeFor(account.id)
    await confirmTransferUnlock(user, freshCode)
    const [nowUnlocked] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, account.id)).limit(1)
    expect(nowUnlocked?.transfersLocked).toBe(false)
  })
})
