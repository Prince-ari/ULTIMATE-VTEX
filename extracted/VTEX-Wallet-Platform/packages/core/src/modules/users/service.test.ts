import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { users } from "../../db/schema"
import { eq } from "drizzle-orm"
import { makeUser } from "../../test/fixtures"
import { createUser, deleteUser, getMe, listUsers, reactivateUser, suspendUser, adminResetPassword, updateMe, updateUser } from "./service"
import { ForbiddenError, ValidationError } from "../../auth/permissions"

describe("users — machine à états", () => {
  it("suspend puis réactive normalement", async () => {
    const admin = await makeUser({ role: "admin" })
    const u = await makeUser()

    await suspendUser(db, admin.actor, u.userId)
    let [row] = await db.select().from(users).where(eq(users.id, u.userId)).limit(1)
    expect(row!.status).toBe("suspended")

    await reactivateUser(db, admin.actor, u.userId)
    ;[row] = await db.select().from(users).where(eq(users.id, u.userId)).limit(1)
    expect(row!.status).toBe("active")
  })

  it("refuse une transition depuis 'deleted' (machine à états stricte, Sprint 5 §2)", async () => {
    const admin = await makeUser({ role: "admin" })
    const u = await makeUser()
    await deleteUser(db, admin.actor, u.userId)
    await expect(reactivateUser(db, admin.actor, u.userId)).rejects.toThrow(ValidationError)
  })

  it("suspendUser est réservé admin", async () => {
    const u = await makeUser()
    const other = await makeUser()
    await expect(suspendUser(db, u.actor, other.userId)).rejects.toThrow(ForbiddenError)
  })
})

describe("users.updateMe — jamais d'escalade de privilège", () => {
  it("ne permet de modifier que ses propres champs limités (pas role/status, par construction du type)", async () => {
    const u = await makeUser()
    await updateMe(db, u.actor, { firstName: "NouveauPrénom" })
    const [row] = await db.select().from(users).where(eq(users.id, u.userId)).limit(1)
    expect(row!.firstName).toBe("NouveauPrénom")
    expect(row!.role).toBe("user") // inchangé — updateMe n'a même pas de paramètre "role"
  })
})

describe("users — jamais de passwordHash exposé", () => {
  it("getMe ne renvoie pas passwordHash", async () => {
    const u = await makeUser()
    const me = await getMe(db, u.actor)
    expect(me).not.toHaveProperty("passwordHash")
  })

  it("listUsers ne renvoie pas passwordHash", async () => {
    const admin = await makeUser({ role: "admin" })
    await makeUser()
    const list = await listUsers(db, admin.actor, {})
    expect(list.length).toBeGreaterThan(0)
    for (const row of list) expect(row).not.toHaveProperty("passwordHash")
  })

  it("listUsers trie par date de création décroissante (le plus récent en premier) — trouvé absent lors de l'audit, une LIMIT sans ORDER BY donne un ordre indéterminé en MySQL", async () => {
    const admin = await makeUser({ role: "admin" })
    const older = await makeUser()
    await new Promise((r) => setTimeout(r, 1100)) // garantit un created_at strictement différent (précision seconde)
    const newer = await makeUser()

    const list = await listUsers(db, admin.actor, {})
    const olderIndex = list.findIndex((u) => u.id === older.userId)
    const newerIndex = list.findIndex((u) => u.id === newer.userId)
    expect(newerIndex).toBeLessThan(olderIndex)
  })
})

describe("users.adminResetPassword", () => {
  it("réservé admin, ne lève pas pour un email existant", async () => {
    const admin = await makeUser({ role: "admin" })
    const u = await makeUser()
    await expect(adminResetPassword(db, admin.actor, u.userId)).resolves.not.toThrow()
    await expect(adminResetPassword(db, u.actor, u.userId)).rejects.toThrow(ForbiddenError)
  })
})

describe("users.list — recherche (FULLTEXT, Sprint 8 étape 10)", () => {
  it("trouve un utilisateur par préfixe de prénom", async () => {
    const admin = await makeUser({ role: "admin" })
    const suffix = Date.now()
    await db.insert(users).values({
      firstName: `Amara${suffix}`,
      lastName: "Diallo",
      email: `amara-${suffix}@test.local`,
      passwordHash: "x",
      role: "user",
      status: "active",
      kycVerified: true,
    })
    const results = await listUsers(db, admin.actor, { search: `Amara${suffix}` })
    expect(results.some((u) => u.firstName === `Amara${suffix}`)).toBe(true)
  })

  it("trouve par préfixe partiel (comportement recherche-au-fil-de-la-frappe)", async () => {
    const admin = await makeUser({ role: "admin" })
    const suffix = Date.now()
    await db.insert(users).values({
      firstName: `Prefixtest${suffix}`,
      lastName: "Utilisateur",
      email: `prefixtest-${suffix}@test.local`,
      passwordHash: "x",
      role: "user",
      status: "active",
      kycVerified: true,
    })
    // Préfixe court du prénom, comme un admin qui tape au fur et à mesure.
    const results = await listUsers(db, admin.actor, { search: `Prefixtest${suffix}`.slice(0, 8) })
    expect(results.some((u) => u.firstName === `Prefixtest${suffix}`)).toBe(true)
  })

  it("LIMITE ASSUMÉE : ne trouve plus une sous-chaîne au milieu d'un mot (différence avec l'ancien LIKE)", async () => {
    const admin = await makeUser({ role: "admin" })
    const suffix = Date.now()
    await db.insert(users).values({
      firstName: `Zzsubstringzz${suffix}`,
      lastName: "Test",
      email: `zzsubstring-${suffix}@test.local`,
      passwordHash: "x",
      role: "user",
      status: "active",
      kycVerified: true,
    })
    // "substring" est au MILIEU du prénom, pas un préfixe — ne matche plus
    // avec BOOLEAN MODE + wildcard préfixe. Documenté ici plutôt que
    // découvert en silence par un futur admin qui chercherait ainsi.
    const results = await listUsers(db, admin.actor, { search: "substring" })
    expect(results.some((u) => u.firstName === `Zzsubstringzz${suffix}`)).toBe(false)
  })

  it("recherche vide renvoie tout le monde (pas de clause MATCH ajoutée)", async () => {
    const admin = await makeUser({ role: "admin" })
    await makeUser()
    const results = await listUsers(db, admin.actor, { search: "" })
    expect(results.length).toBeGreaterThan(0)
  })
})

describe("users.create", () => {
  it("refuse un email déjà utilisé", async () => {
    const admin = await makeUser({ role: "admin" })
    const existing = await makeUser()
    const [existingRow] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1)

    await expect(
      createUser(db, admin.actor, {
        firstName: "Dup",
        lastName: "Licate",
        email: existingRow!.email,
        temporaryPassword: "test12345",
      }),
    ).rejects.toThrow(ValidationError)
  })

  it("réservé admin — un agent ne peut pas créer directement (seulement via conversion de lead)", async () => {
    const agent = await makeUser({ role: "agent" })
    await expect(
      createUser(db, agent.actor, {
        firstName: "X",
        lastName: "Y",
        email: `direct-${Date.now()}@test.local`,
        temporaryPassword: "test12345",
      }),
    ).rejects.toThrow(ForbiddenError)
  })
})

describe("users.update — admin uniquement, tout champ de profil désormais éditable", () => {
  it("réservé admin", async () => {
    const u = await makeUser()
    const target = await makeUser()
    await expect(updateUser(db, u.actor, target.userId, { firstName: "X" })).rejects.toThrow(ForbiddenError)
  })

  it("admin peut modifier prénom, nom, téléphone", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await updateUser(db, admin.actor, target.userId, { firstName: "Nouveau", lastName: "Nom", phone: "+33600000000" })

    const [row] = await db.select().from(users).where(eq(users.id, target.userId)).limit(1)
    expect(row!.firstName).toBe("Nouveau")
    expect(row!.lastName).toBe("Nom")
    expect(row!.phone).toBe("+33600000000")
  })

  it("admin peut modifier l'email si le nouveau n'est pas déjà pris", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    const newEmail = `nouveau-${Date.now()}@test.local`
    await updateUser(db, admin.actor, target.userId, { email: newEmail })

    const [row] = await db.select().from(users).where(eq(users.id, target.userId)).limit(1)
    expect(row!.email).toBe(newEmail)
  })

  it("refuse un email déjà utilisé par un autre compte", async () => {
    const admin = await makeUser({ role: "admin" })
    const existing = await makeUser()
    const target = await makeUser()
    const [existingRow] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1)

    await expect(updateUser(db, admin.actor, target.userId, { email: existingRow!.email })).rejects.toThrow(
      ValidationError,
    )
  })

  it("permet de resauvegarder le même email pour le même utilisateur (pas un faux conflit avec soi-même)", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    const [row] = await db.select().from(users).where(eq(users.id, target.userId)).limit(1)

    await expect(
      updateUser(db, admin.actor, target.userId, { email: row!.email, firstName: "Inchangé" }),
    ).resolves.not.toThrow()
  })

  it("rejette un email mal formé", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await expect(updateUser(db, admin.actor, target.userId, { email: "pas-un-email" })).rejects.toThrow(
      ValidationError,
    )
  })
})
