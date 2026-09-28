import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { ForbiddenError, ValidationError, db, hashPassword, logs, users, type Actor, type Role } from "@vtex/core"

import { walletSettings } from "./db/schema"
import { bootstrapWallet } from "./service"
import { adminGetWalletSettings, adminUpdateWalletSettings, getMyWalletSettings, updateMyWalletSettings } from "./settings"

async function makeActor(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Set", lastName: suffix, email: `settings-${suffix}@test.local`, passwordHash: hashPassword("settings-pass-123"), role, status: "active" })
  return { id: inserted.insertId, role }
}

describe("wallet_settings — devise d'affichage côté serveur", () => {
  it("par défaut aucune préférence ; le titulaire choisit ₣ et la retrouve à l'ouverture du wallet (bootstrap)", async () => {
    const owner = await makeActor("user")
    expect(await getMyWalletSettings(owner)).toEqual({ displayCurrency: null })
    expect(await updateMyWalletSettings(owner, { displayCurrency: "XPF" })).toEqual({ displayCurrency: "XPF" })
    expect(await getMyWalletSettings(owner)).toEqual({ displayCurrency: "XPF" })
    const boot = await bootstrapWallet(owner)
    expect(boot.settings).toEqual({ displayCurrency: "XPF" })
    // Le compte, lui, reste dans sa devise : la préférence ne change que l'affichage.
    expect(boot.account.currency).toBe("EUR")
    // Un second choix remplace le premier (une seule ligne par titulaire).
    await updateMyWalletSettings(owner, { displayCurrency: "EUR" })
    const rows = await db.select().from(walletSettings).where(eq(walletSettings.userId, owner.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ displayCurrency: "EUR", updatedBy: owner.id })
  })

  it("refuse une devise sans parité fixe (USD) et toute devise inconnue", async () => {
    const owner = await makeActor("user")
    await expect(updateMyWalletSettings(owner, { displayCurrency: "USD" })).rejects.toThrow(ValidationError)
    await expect(updateMyWalletSettings(owner, { displayCurrency: "GBP" })).rejects.toThrow(ValidationError)
    await expect(updateMyWalletSettings(owner, { displayCurrency: "xpf" })).rejects.toThrow(ValidationError)
    expect(await getMyWalletSettings(owner)).toEqual({ displayCurrency: null })
  })

  it("un administrateur règle la devise d'un titulaire ; le wallet de ce titulaire la relit ; l'action est journalisée", async () => {
    const admin = await makeActor("admin")
    const owner = await makeActor("user")
    await adminUpdateWalletSettings(admin, owner.id, { displayCurrency: "XPF" })
    expect(await getMyWalletSettings(owner)).toEqual({ displayCurrency: "XPF" })
    const [row] = await db.select().from(walletSettings).where(eq(walletSettings.userId, owner.id))
    expect(row).toMatchObject({ updatedBy: admin.id })
    const entries = await db.select().from(logs).where(and(eq(logs.action, "wallet.settings.admin_update"), eq(logs.holderId, owner.id)))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: admin.id, walletType: "PERSONAL" })
  })

  it("permissions : SUPPORT lit mais ne modifie pas ; ACCOUNT_MANAGER et un autre titulaire n'ont aucun accès ; titulaire inconnu → 404", async () => {
    const admin = await makeActor("admin")
    const agent = await makeActor("agent")
    const manager = await makeActor("account_manager")
    const stranger = await makeActor("user")
    const owner = await makeActor("user")
    await adminUpdateWalletSettings(admin, owner.id, { displayCurrency: "XPF" })

    await expect(adminGetWalletSettings(agent, owner.id)).resolves.toEqual({ displayCurrency: "XPF" })
    await expect(adminUpdateWalletSettings(agent, owner.id, { displayCurrency: "EUR" })).rejects.toThrow(ForbiddenError)
    await expect(adminGetWalletSettings(manager, owner.id)).rejects.toThrow(ForbiddenError)
    await expect(adminGetWalletSettings(stranger, owner.id)).rejects.toThrow(ForbiddenError)
    await expect(adminUpdateWalletSettings(admin, 2_000_000_000, { displayCurrency: "EUR" })).rejects.toThrow(/introuvable/)
  })
})
