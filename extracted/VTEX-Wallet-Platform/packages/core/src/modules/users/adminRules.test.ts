import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { db } from "../../db/client"
import { logs, users } from "../../db/schema"
import { ForbiddenError } from "../../auth/permissions"
import { createSession, listActiveSessions } from "../../auth/session"
import { makeUser } from "../../test/fixtures"
import { createUser, deleteUser, getUserById, listUsers, suspendUser, updateUser } from "./service"

async function roleOf(userId: number) {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
  return row!.role
}

describe("attribution des rôles depuis le service (anti-escalade)", () => {
  it("un ADMIN promeut un utilisateur en SUPPORT ; ses sessions sont coupées et l'événement est journalisé", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await createSession(db, target.userId)
    await updateUser(db, admin.actor, target.userId, { role: "agent" })
    expect(await roleOf(target.userId)).toBe("agent")
    expect(await listActiveSessions(db, target.userId)).toHaveLength(0)
    const entries = await db.select().from(logs).where(eq(logs.targetId, target.userId))
    const detail = entries.find((entry) => entry.action === "user.role.assign")?.detail
    // MariaDB renvoie une colonne JSON sous forme de texte, MySQL 8 sous forme d'objet : les deux sont valides.
    expect(typeof detail === "string" ? JSON.parse(detail) : detail).toEqual({ from: "user", to: "agent" })
  })

  it("un ADMIN ne peut ni créer un autre admin, ni rétrograder un admin, ni changer son propre rôle", async () => {
    const admin = await makeUser({ role: "admin" })
    const other = await makeUser({ role: "admin" })
    const plain = await makeUser()
    await expect(updateUser(db, admin.actor, plain.userId, { role: "admin" })).rejects.toThrow(ForbiddenError)
    await expect(updateUser(db, admin.actor, other.userId, { role: "user" })).rejects.toThrow(ForbiddenError)
    await expect(updateUser(db, admin.actor, admin.userId, { role: "super_admin" })).rejects.toThrow(/propre rôle/)
    expect(await roleOf(plain.userId)).toBe("user")
    expect(await roleOf(other.userId)).toBe("admin")
  })

  it("un ADMIN ne peut pas modifier le profil (ex. e-mail) d'un autre administrateur : sinon prise de contrôle du compte", async () => {
    const admin = await makeUser({ role: "admin" })
    const other = await makeUser({ role: "admin" })
    await expect(updateUser(db, admin.actor, other.userId, { email: `hijack-${other.userId}@test.local` })).rejects.toThrow(ForbiddenError)
  })

  it("un SUPER_ADMIN attribue le rôle admin", async () => {
    const superAdmin = await makeUser({ role: "super_admin" })
    const target = await makeUser()
    await updateUser(db, superAdmin.actor, target.userId, { role: "admin" })
    expect(await roleOf(target.userId)).toBe("admin")
  })

  it("SUPPORT, ACCOUNT_MANAGER et user ne peuvent rien modifier", async () => {
    const target = await makeUser()
    for (const role of ["agent", "account_manager", "user"] as const) {
      const actor = await makeUser({ role })
      await expect(updateUser(db, actor.actor, target.userId, { firstName: "X" })).rejects.toThrow(ForbiddenError)
    }
  })
})

describe("création de compte avec rôle et mot de passe temporaire", () => {
  const base = { firstName: "Nou", lastName: "Veau", temporaryPassword: "Temporaire-Solide-42" }

  it("un ADMIN crée un compte SUPPORT mais pas un administrateur ; un SUPER_ADMIN le peut", async () => {
    const admin = await makeUser({ role: "admin" })
    const superAdmin = await makeUser({ role: "super_admin" })
    const stamp = Date.now()
    const agentId = await createUser(db, admin.actor, { ...base, email: `agent-${stamp}@test.local`, role: "agent" })
    expect(await roleOf(agentId)).toBe("agent")
    await expect(createUser(db, admin.actor, { ...base, email: `adm-${stamp}@test.local`, role: "admin" })).rejects.toThrow(ForbiddenError)
    const adminId = await createUser(db, superAdmin.actor, { ...base, email: `adm2-${stamp}@test.local`, role: "admin" })
    expect(await roleOf(adminId)).toBe("admin")
  })

  it("mustChangePassword fixe une échéance de 72 h ; la création historique n'impose rien", async () => {
    const admin = await makeUser({ role: "admin" })
    const stamp = Date.now()
    const forcedId = await createUser(db, admin.actor, { ...base, email: `forced-${stamp}@test.local`, mustChangePassword: true })
    const legacyId = await createUser(db, admin.actor, { ...base, email: `legacy-${stamp}@test.local` })
    const [forced] = await db.select().from(users).where(eq(users.id, forcedId)).limit(1)
    const [legacy] = await db.select().from(users).where(eq(users.id, legacyId)).limit(1)
    expect(forced!.mustChangePassword).toBe(true)
    expect(forced!.tempPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000)
    expect(forced!.passwordHash).not.toContain(base.temporaryPassword)
    expect(legacy!.mustChangePassword).toBe(false)
    expect(legacy!.tempPasswordExpiresAt).toBeNull()
  })

  it("l'événement de création porte le titulaire (fiche) et jamais le mot de passe", async () => {
    const admin = await makeUser({ role: "admin" })
    const id = await createUser(db, admin.actor, { ...base, email: `audit-${Date.now()}@test.local` })
    const entries = await db.select().from(logs).where(eq(logs.targetId, id))
    const created = entries.find((entry) => entry.action === "user.create")!
    expect(created).toMatchObject({ walletType: "PERSONAL", holderId: id })
    expect(JSON.stringify(created)).not.toContain(base.temporaryPassword)
  })
})

describe("suspension et suppression", () => {
  it("coupent immédiatement les sessions ; on ne peut pas se suspendre soi-même ni suspendre un administrateur en étant ADMIN", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await createSession(db, target.userId)
    await suspendUser(db, admin.actor, target.userId)
    expect(await listActiveSessions(db, target.userId)).toHaveLength(0)

    await expect(suspendUser(db, admin.actor, admin.userId)).rejects.toThrow(/propre compte/)
    const otherAdmin = await makeUser({ role: "admin" })
    await expect(suspendUser(db, admin.actor, otherAdmin.userId)).rejects.toThrow(ForbiddenError)
    await expect(deleteUser(db, admin.actor, otherAdmin.userId)).rejects.toThrow(ForbiddenError)
    const superAdmin = await makeUser({ role: "super_admin" })
    await expect(suspendUser(db, superAdmin.actor, otherAdmin.userId)).resolves.toBeUndefined()
  })
})

describe("lecture — permission users.read", () => {
  it("SUPPORT lit, ACCOUNT_MANAGER et user sont refusés (fermé par défaut)", async () => {
    const agent = await makeUser({ role: "agent" })
    const target = await makeUser()
    await expect(getUserById(db, agent.actor, target.userId)).resolves.toMatchObject({ id: target.userId })
    const manager = await makeUser({ role: "account_manager" })
    await expect(listUsers(db, manager.actor, {})).rejects.toThrow(ForbiddenError)
    await expect(getUserById(db, manager.actor, target.userId)).rejects.toThrow(ForbiddenError)
  })

  it("le filtre de rôle fonctionne et la projection expose les nouveaux champs sans le hash", async () => {
    const admin = await makeUser({ role: "admin" })
    const agent = await makeUser({ role: "agent" })
    const rows = await listUsers(db, admin.actor, { role: "agent" })
    expect(rows.every((row) => row.role === "agent")).toBe(true)
    const found = rows.find((row) => row.id === agent.userId)!
    expect(found).toHaveProperty("lastActiveAt")
    expect(found).toHaveProperty("mustChangePassword")
    expect(found).not.toHaveProperty("passwordHash")
  })
})
