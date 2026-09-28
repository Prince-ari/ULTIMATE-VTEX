import { describe, expect, it } from "vitest"
import { TRPCError } from "@trpc/server"

import { coreRouter } from "./router"
import { makeUser } from "../test/fixtures"
import { db } from "../db/client"
import { users } from "../db/schema"
import { eq } from "drizzle-orm"

function callerFor(actor: { id: number; role: "admin" | "user"; mustChangePassword?: boolean }) {
  return coreRouter.createCaller({ actor, jti: "jti-test", ip: "127.0.0.1", requestId: "req-test" })
}

describe("mot de passe temporaire — refus côté serveur de toute autre action", () => {
  it("bloque une procédure d'administration tant que le mot de passe n'est pas remplacé (même pour un admin)", async () => {
    const admin = await makeUser({ role: "admin" })
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, admin.userId))
    const caller = callerFor({ ...admin.actor, role: "admin", mustChangePassword: true })
    const error = await caller.users.list().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe("FORBIDDEN")
    expect((error as TRPCError).message).toContain("PASSWORD_CHANGE_REQUIRED")
  })

  it("laisse passer uniquement getMe, logout et changePassword", async () => {
    const user = await makeUser()
    const caller = callerFor({ id: user.userId, role: "user", mustChangePassword: true })
    await expect(caller.users.getMe()).resolves.toMatchObject({ id: user.userId })
    await expect(caller.auth.logout()).resolves.toEqual({ success: true })
    // changePassword atteint le service (mauvais mot de passe actuel) : la garde ne l'a pas bloqué.
    await expect(caller.auth.changePassword({ currentPassword: "faux-faux-faux", newPassword: "Nouveau-Secret-77" })).rejects.toThrow(/actuel incorrect/)
    await expect(caller.notifications.listMine()).rejects.toThrow(/PASSWORD_CHANGE_REQUIRED/)
    await expect(caller.documents.listMine()).rejects.toThrow(/PASSWORD_CHANGE_REQUIRED/)
  })

  it("sans obligation de changement, les procédures s'exécutent normalement", async () => {
    const admin = await makeUser({ role: "admin" })
    const caller = callerFor({ ...admin.actor, role: "admin" })
    await expect(caller.users.list({ search: "zzz-introuvable" })).resolves.toEqual([])
  })
})
