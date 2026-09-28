import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { users, webauthnChallenges, webauthnCredentials } from "../../db/schema"
import { hashPassword } from "../../auth/password"
import { ValidationError, NotFoundError } from "../../auth/permissions"
import { eq } from "drizzle-orm"
import {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  listCredentials,
  deleteCredential,
} from "./webauthn"

async function makeAuthUser() {
  const email = `webauthn-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "WebAuthn",
    lastName: "Test",
    email,
    passwordHash: hashPassword("correcthorsebattery"),
    role: "user",
    status: "active",
    kycVerified: true,
  })
  return { userId: inserted.insertId, email }
}

describe("webauthn.registerOptions", () => {
  it("génère des options avec le bon nom d'utilisateur et stocke un challenge", async () => {
    const { userId, email } = await makeAuthUser()
    const options = await registerOptions(db, userId)

    expect(options.user.name).toBe(email)
    expect(options.challenge).toBeTruthy()

    const [stored] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.userId, userId)).limit(1)
    expect(stored?.purpose).toBe("register")
    expect(stored?.challenge).toBe(options.challenge)
  })

  it("exclut les appareils déjà enregistrés (excludeCredentials)", async () => {
    const { userId } = await makeAuthUser()
    const credentialId = `existing-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await db.insert(webauthnCredentials).values({
      userId,
      credentialId,
      publicKey: Buffer.from("fake-key").toString("base64"),
      deviceName: "iPhone de test",
    })

    const options = await registerOptions(db, userId)
    expect(options.excludeCredentials?.map((c) => c.id)).toContain(credentialId)
  })

  it("un second appel remplace le challenge précédent (pas d'accumulation)", async () => {
    const { userId } = await makeAuthUser()
    await registerOptions(db, userId)
    await registerOptions(db, userId)

    const rows = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.userId, userId))
    expect(rows).toHaveLength(1)
  })
})

describe("webauthn.registerVerify — rejette sans cérémonie valide", () => {
  it("rejette s'il n'y a aucun challenge en attente", async () => {
    const { userId } = await makeAuthUser()
    await expect(
      registerVerify(db, userId, {} as never, "Mon appareil"),
    ).rejects.toThrow(ValidationError)
  })

  it("rejette un challenge expiré", async () => {
    const { userId } = await makeAuthUser()
    await db.insert(webauthnChallenges).values({
      userId,
      challenge: "un-challenge",
      purpose: "register",
      expiresAt: new Date(Date.now() - 1000), // déjà expiré
    })
    await expect(
      registerVerify(db, userId, {} as never, "Mon appareil"),
    ).rejects.toThrow(ValidationError)
  })

  it("rejette une réponse structurellement invalide (pas une vraie cérémonie WebAuthn)", async () => {
    const { userId } = await makeAuthUser()
    await registerOptions(db, userId) // stocke un challenge valide
    await expect(
      registerVerify(db, userId, { garbage: true } as never, "Mon appareil"),
    ).rejects.toThrow(ValidationError)
  })
})

describe("webauthn.loginOptions — ne révèle jamais si l'email existe", () => {
  it("renvoie des options valides pour un email inconnu (pas d'énumération de comptes)", async () => {
    const options = await loginOptions(db, `inconnu-${Date.now()}@test.local`)
    expect(options.challenge).toBeTruthy()
  })

  it("renvoie les identifiants autorisés pour un utilisateur ayant des Passkeys", async () => {
    const { userId, email } = await makeAuthUser()
    const credentialId = `cred-abc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await db.insert(webauthnCredentials).values({
      userId,
      credentialId,
      publicKey: Buffer.from("fake-key").toString("base64"),
      deviceName: "iPhone de test",
    })

    const options = await loginOptions(db, email)
    expect(options.allowCredentials?.map((c) => c.id)).toContain(credentialId)
  })
})

describe("webauthn.loginVerify — rejette sans cérémonie valide", () => {
  it("rejette un email inconnu", async () => {
    await expect(
      loginVerify(db, `inconnu-${Date.now()}@test.local`, {} as never),
    ).rejects.toThrow(ValidationError)
  })

  it("rejette un compte suspendu", async () => {
    const { userId, email } = await makeAuthUser()
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, userId))
    await expect(loginVerify(db, email, {} as never)).rejects.toThrow(ValidationError)
  })

  it("rejette si le credentialId de la réponse n'appartient à personne", async () => {
    const { userId, email } = await makeAuthUser()
    await db.insert(webauthnChallenges).values({
      userId,
      challenge: "un-challenge",
      purpose: "login",
      expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(
      loginVerify(db, email, { id: "credential-jamais-enregistre" } as never),
    ).rejects.toThrow(ValidationError)
  })
})

describe("webauthn.listCredentials / deleteCredential — propriété stricte", () => {
  it("liste uniquement les identifiants de l'utilisateur demandé, jamais la clé publique", async () => {
    const { userId } = await makeAuthUser()
    await db.insert(webauthnCredentials).values({
      userId,
      credentialId: `cred-xyz-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      publicKey: Buffer.from("secret-key-material").toString("base64"),
      deviceName: "MacBook de test",
    })

    const list = await listCredentials(db, userId)
    expect(list).toHaveLength(1)
    expect(list[0]!.deviceName).toBe("MacBook de test")
    expect(list[0]).not.toHaveProperty("publicKey")
    expect(list[0]).not.toHaveProperty("credentialId")
  })

  it("refuse de supprimer la Passkey d'un autre utilisateur", async () => {
    const owner = await makeAuthUser()
    const attacker = await makeAuthUser()
    const [inserted] = await db.insert(webauthnCredentials).values({
      userId: owner.userId,
      credentialId: `cred-owner-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      publicKey: Buffer.from("fake-key").toString("base64"),
      deviceName: "Appareil du propriétaire",
    })

    await expect(deleteCredential(db, attacker.userId, inserted.insertId)).rejects.toThrow(NotFoundError)

    const stillThere = await listCredentials(db, owner.userId)
    expect(stillThere).toHaveLength(1)
  })

  it("le propriétaire peut bien supprimer sa propre Passkey", async () => {
    const { userId } = await makeAuthUser()
    const [inserted] = await db.insert(webauthnCredentials).values({
      userId,
      credentialId: `cred-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      publicKey: Buffer.from("fake-key").toString("base64"),
      deviceName: "Appareil à supprimer",
    })

    await deleteCredential(db, userId, inserted.insertId)
    const list = await listCredentials(db, userId)
    expect(list).toHaveLength(0)
  })
})
