import { afterEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { db } from "../../db/client"
import { otpCodes, sessions, users } from "../../db/schema"
import { hashPassword, verifyPassword } from "../../auth/password"
import { createSession, listActiveSessions, verifySessionToken } from "../../auth/session"
import { ForbiddenError, ValidationError } from "../../auth/permissions"
import { makeUser } from "../../test/fixtures"
import { adminResetPassword, adminUnlockUser } from "../users/service"
import { LOGIN_MAX_FAILURES, OTP_MAX_ATTEMPTS, changePassword, login, requestOtp, verifyOtp, devPeekOtp } from "./service"

vi.mock("../../email/service", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  EmailError: class EmailError extends Error {},
}))

const PASSWORD = "correcthorse-battery-9"

async function makeAuthUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const email = `hard-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "Hard",
    lastName: "Test",
    email,
    passwordHash: hashPassword(PASSWORD),
    role: "user",
    status: "active",
    kycVerified: true,
    ...overrides,
  })
  return { userId: inserted.insertId, email }
}

async function row(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user!
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("OTP — jamais lisible, essais bornés", () => {
  it("stocke une empreinte HMAC ; en production le code en clair n'est jamais écrit", async () => {
    const u = await makeAuthUser()
    vi.stubEnv("NODE_ENV", "production")
    await requestOtp(db, u.userId)
    const [entry] = await db.select().from(otpCodes).where(eq(otpCodes.userId, u.userId)).limit(1)
    expect(entry!.code).toBe("------")
    expect(entry!.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await devPeekOtp(db, u.userId)).toBeNull()
  })

  it("hors production, devPeekOtp reste utilisable et le code se vérifie via l'empreinte", async () => {
    const u = await makeAuthUser()
    await requestOtp(db, u.userId)
    const [entry] = await db.select().from(otpCodes).where(eq(otpCodes.userId, u.userId)).limit(1)
    expect(entry!.codeHash).toMatch(/^[0-9a-f]{64}$/)
    const { code } = (await devPeekOtp(db, u.userId))!
    expect(entry!.codeHash).not.toContain(code)
    await expect(verifyOtp(db, u.userId, code)).resolves.toBeTruthy()
  })

  it("un ancien code sans empreinte (émis avant la migration) est refusé", async () => {
    const u = await makeAuthUser()
    await db.insert(otpCodes).values({ userId: u.userId, code: "123456", codeHash: null, expiresAt: new Date(Date.now() + 60_000) })
    await expect(verifyOtp(db, u.userId, "123456")).rejects.toThrow(/expiré/)
  })

  it(`après ${OTP_MAX_ATTEMPTS} essais faux, même le BON code est refusé et le code est détruit`, async () => {
    const u = await makeAuthUser()
    await requestOtp(db, u.userId)
    const { code } = (await devPeekOtp(db, u.userId))!
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) await expect(verifyOtp(db, u.userId, wrong)).rejects.toThrow("Code incorrect.")
    await expect(verifyOtp(db, u.userId, code)).rejects.toThrow(/Trop d'essais/)
    const remaining = await db.select().from(otpCodes).where(eq(otpCodes.userId, u.userId))
    expect(remaining).toHaveLength(0)
    // Le code détruit ne peut plus jamais être rejoué.
    await expect(verifyOtp(db, u.userId, code)).rejects.toThrow(/expiré/)
  })

  it("un code réussi remet le compteur d'échecs à zéro et renseigne la dernière activité", async () => {
    const u = await makeAuthUser({ failedLoginCount: 4 })
    await requestOtp(db, u.userId)
    const { code } = (await devPeekOtp(db, u.userId))!
    await verifyOtp(db, u.userId, code)
    const after = await row(u.userId)
    expect(after.failedLoginCount).toBe(0)
    expect(after.lastActiveAt).not.toBeNull()
  })
})

describe("verrouillage du compte", () => {
  it(`${LOGIN_MAX_FAILURES} échecs verrouillent le compte : même le bon mot de passe est refusé, un administrateur peut le déverrouiller`, async () => {
    const u = await makeAuthUser()
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) await expect(login(db, u.email, "mauvais")).rejects.toThrow(ValidationError)
    const locked = await row(u.userId)
    expect(locked.lockedUntil).not.toBeNull()
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    await expect(login(db, u.email, PASSWORD)).rejects.toThrow(/verrouillé/)

    const admin = await makeUser({ role: "admin" })
    await adminUnlockUser(db, admin.actor, u.userId)
    await expect(login(db, u.email, PASSWORD)).resolves.toMatchObject({ userId: u.userId })
  })

  it("un support (agent) ne peut pas déverrouiller", async () => {
    const u = await makeAuthUser()
    const agent = await makeUser({ role: "agent" })
    await expect(adminUnlockUser(db, agent.actor, u.userId)).rejects.toThrow(ForbiddenError)
  })

  it("le message d'erreur est identique pour un compte verrouillé et des identifiants faux (pas d'énumération)", async () => {
    const u = await makeAuthUser({ lockedUntil: new Date(Date.now() + 60_000) })
    const locked = await login(db, u.email, PASSWORD).catch((error: Error) => error.message)
    const wrong = await login(db, `absent-${u.email}`, PASSWORD).catch((error: Error) => error.message)
    expect(locked).toBe(wrong)
  })
})

describe("mot de passe temporaire", () => {
  it("un mot de passe temporaire expiré empêche la connexion", async () => {
    const u = await makeAuthUser({ mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 1000) })
    await expect(login(db, u.email, PASSWORD)).rejects.toThrow(/expiré/)
  })

  it("le changement de mot de passe exige l'actuel, applique la politique, coupe les AUTRES sessions et lève l'obligation", async () => {
    const u = await makeAuthUser({ mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 3600_000) })
    const actor = { id: u.userId, role: "user" as const, mustChangePassword: true }
    const keep = await createSession(db, u.userId, { device: "courante" })
    await createSession(db, u.userId, { device: "autre" })
    const keepJti = (await verifySessionToken(db, keep))!.jti

    await expect(changePassword(db, actor, keepJti, { currentPassword: "faux", newPassword: "Nouveau-Secret-77" })).rejects.toThrow(/actuel incorrect/)
    await expect(changePassword(db, actor, keepJti, { currentPassword: PASSWORD, newPassword: "court1" })).rejects.toThrow(/10 caractères/)
    await expect(changePassword(db, actor, keepJti, { currentPassword: PASSWORD, newPassword: PASSWORD })).rejects.toThrow(/différent/)

    await changePassword(db, actor, keepJti, { currentPassword: PASSWORD, newPassword: "Nouveau-Secret-77" })
    const after = await row(u.userId)
    expect(after.mustChangePassword).toBe(false)
    expect(after.tempPasswordExpiresAt).toBeNull()
    expect(after.passwordChangedAt).not.toBeNull()
    expect(verifyPassword("Nouveau-Secret-77", after.passwordHash)).toBe(true)
    const active = await listActiveSessions(db, u.userId)
    expect(active.map((session) => session.jti)).toEqual([keepJti])
  })
})

describe("réinitialisation par un administrateur", () => {
  it("génère un mot de passe temporaire aléatoire, l'impose, coupe les sessions et lève le verrou — sans jamais lire l'ancien", async () => {
    const u = await makeAuthUser({ failedLoginCount: 7, lockedUntil: new Date(Date.now() + 600_000) })
    const token = await createSession(db, u.userId)
    const admin = await makeUser({ role: "admin" })

    const reset = await adminResetPassword(db, admin.actor, u.userId)
    expect(reset.temporaryPassword).toHaveLength(16)
    expect(reset.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 3600 * 1000)

    const after = await row(u.userId)
    expect(after.mustChangePassword).toBe(true)
    expect(after.failedLoginCount).toBe(0)
    expect(after.lockedUntil).toBeNull()
    expect(after.passwordHash).not.toContain(reset.temporaryPassword)
    expect(verifyPassword(reset.temporaryPassword, after.passwordHash)).toBe(true)
    expect(verifyPassword(PASSWORD, after.passwordHash)).toBe(false)
    expect(await verifySessionToken(db, token)).toBeNull()
    await expect(login(db, u.email, reset.temporaryPassword)).resolves.toMatchObject({ userId: u.userId })
  })

  it("le journal ne contient jamais le mot de passe temporaire", async () => {
    const u = await makeAuthUser()
    const admin = await makeUser({ role: "admin" })
    const reset = await adminResetPassword(db, admin.actor, u.userId)
    const { logs } = await import("../../db/schema")
    const entries = await db.select().from(logs).where(eq(logs.targetId, u.userId))
    expect(JSON.stringify(entries)).not.toContain(reset.temporaryPassword)
    expect(entries.some((entry) => entry.action === "user.password.reset")).toBe(true)
  })

  it("refuse : support, soi-même, et un administrateur ciblé par un simple ADMIN (seul SUPER_ADMIN gère les comptes privilégiés)", async () => {
    const target = await makeAuthUser()
    const agent = await makeUser({ role: "agent" })
    await expect(adminResetPassword(db, agent.actor, target.userId)).rejects.toThrow(ForbiddenError)

    const admin = await makeUser({ role: "admin" })
    await expect(adminResetPassword(db, admin.actor, admin.userId)).rejects.toThrow(/propre compte/)

    const otherAdmin = await makeUser({ role: "admin" })
    await expect(adminResetPassword(db, admin.actor, otherAdmin.userId)).rejects.toThrow(ForbiddenError)
    const superAdmin = await makeUser({ role: "super_admin" })
    await expect(adminResetPassword(db, superAdmin.actor, otherAdmin.userId)).resolves.toMatchObject({ userId: otherAdmin.userId })
  })
})

describe("sessions", () => {
  it("la révocation en masse ne laisse aucune session active", async () => {
    const u = await makeAuthUser()
    await createSession(db, u.userId)
    await createSession(db, u.userId)
    const admin = await makeUser({ role: "admin" })
    await adminResetPassword(db, admin.actor, u.userId)
    expect(await listActiveSessions(db, u.userId)).toHaveLength(0)
    const all = await db.select().from(sessions).where(eq(sessions.userId, u.userId))
    expect(all.every((session) => session.revokedAt !== null)).toBe(true)
  })
})
