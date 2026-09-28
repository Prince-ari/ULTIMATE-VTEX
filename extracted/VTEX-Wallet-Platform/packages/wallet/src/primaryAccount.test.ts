import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db, hashPassword, users, type Actor } from "@vtex/core"

import { walletAccounts } from "./db/schema"
import { bootstrapWallet, ensureWalletAccount, getMyWallet, listMyCards, primaryAccount } from "./service"

async function makeOwner(): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Prin", lastName: suffix, email: `primary-${suffix}@test.local`, passwordHash: hashPassword("primary-pass-123"), role: "user", status: "active" })
  return { id: inserted.insertId, role: "user" }
}

async function accountsOf(userId: number) {
  return db.select().from(walletAccounts).where(eq(walletAccounts.userId, userId))
}

describe("compte principal = devise initiale du titulaire", () => {
  it("un titulaire créé en francs Pacifique ouvre son wallet SANS qu'un compte en euros soit créé", async () => {
    const owner = await makeOwner()
    const initial = await ensureWalletAccount(owner, "XPF")
    expect(initial.currency).toBe("XPF")

    const wallet = await getMyWallet(owner)
    expect(wallet.id).toBe(initial.id)
    const boot = await bootstrapWallet(owner)
    expect(boot.account).toMatchObject({ id: initial.id, currency: "XPF" })
    const cards = await listMyCards(owner)
    expect(cards.every((card) => card.walletAccountId === initial.id)).toBe(true)

    const accounts = await accountsOf(owner.id)
    expect(accounts.map((account) => account.currency)).toEqual(["XPF"])
  })

  it("sans compte, le premier accès en ouvre un en euros ; les comptes ouverts ensuite ne deviennent jamais le compte principal", async () => {
    const owner = await makeOwner()
    expect(await primaryAccount(db, owner.id)).toBeNull()
    const first = await getMyWallet(owner)
    expect(first.currency).toBe("EUR")
    await ensureWalletAccount(owner, "USD")
    const primary = await primaryAccount(db, owner.id)
    expect(primary).toMatchObject({ id: first.id, currency: "EUR" })
    // Une devise explicite reste possible : elle cible ce compte-là, sans changer le compte principal.
    expect((await getMyWallet(owner, "USD")).currency).toBe("USD")
    expect((await getMyWallet(owner)).id).toBe(first.id)
  })

  it("le compte principal est le PLUS ANCIEN, quelle que soit la devise", async () => {
    const owner = await makeOwner()
    const usd = await ensureWalletAccount(owner, "USD")
    await ensureWalletAccount(owner, "EUR")
    expect((await primaryAccount(db, owner.id))!.id).toBe(usd.id)
    expect((await getMyWallet(owner)).currency).toBe("USD")
  })
})
