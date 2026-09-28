import { afterEach, describe, expect, it, vi } from "vitest"

import { db } from "../../db/client"
import { users } from "../../db/schema"
import { hashPassword } from "../../auth/password"
import { verifySessionToken } from "../../auth/session"
import { login, logout, requestOtp, devPeekOtp, verifyOtp } from "./service"
import { ValidationError } from "../../auth/permissions"

vi.mock("../../email/service", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  EmailError: class EmailError extends Error {},
}))

async function makeAuthUser() {
  const email = `auth-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "Auth",
    lastName: "Test",
    email,
    passwordHash: hashPassword("correcthorsebattery"),
    role: "user",
    status: "active",
    kycVerified: true,
  })
  return { userId: inserted.insertId, email }
}

afterEach(() => {
  delete process.env.RESEND_API_KEY
  vi.clearAllMocks()
})

describe("auth — flux complet login -> OTP -> session -> révocation", () => {
  it("refuse un mauvais mot de passe sans révéler si l'email existe", async () => {
    const u = await makeAuthUser()
    await expect(login(db, u.email, "mauvais-mdp")).rejects.toThrow(ValidationError)
  })

  it("login réussi ne crée PAS encore de session (OTP requis)", async () => {
    const u = await makeAuthUser()
    const result = await login(db, u.email, "correcthorsebattery")
    expect(result.requiresOtp).toBe(true)
    expect(result.userId).toBe(u.userId)
  })

  it("un mauvais code OTP est rejeté", async () => {
    const u = await makeAuthUser()
    await requestOtp(db, u.userId)
    await expect(verifyOtp(db, u.userId, "000000")).rejects.toThrow()
  })

  it("le bon code crée une session valide, et la révocation invalide immédiatement le token", async () => {
    const u = await makeAuthUser()
    await requestOtp(db, u.userId)
    const { code } = (await devPeekOtp(db, u.userId))!
    const token = await verifyOtp(db, u.userId, code, { device: "Test Suite" })

    const verified = await verifySessionToken(db, token)
    expect(verified).not.toBeNull()
    expect(verified!.userId).toBe(u.userId)

    // Révocation à distance (Wallet Paramètres, Sprint 3) : le token,
    // bien que non expiré, doit devenir invalide immédiatement.
    await logout(db, verified!.jti)
    const afterRevoke = await verifySessionToken(db, token)
    expect(afterRevoke).toBeNull()
  })

  it("une nouvelle demande de code écrase la précédente (un seul code actif à la fois)", async () => {
    const u = await makeAuthUser()
    await requestOtp(db, u.userId)
    const first = (await devPeekOtp(db, u.userId))!.code
    await requestOtp(db, u.userId)
    const second = (await devPeekOtp(db, u.userId))!.code
    // L'ancien code ne doit plus être valide.
    await expect(verifyOtp(db, u.userId, first)).rejects.toThrow(ValidationError)
    await expect(verifyOtp(db, u.userId, second)).resolves.toBeDefined()
  })
})

describe("auth.devPeekOtp", () => {
  it("renvoie null si aucun code actif", async () => {
    const u = await makeAuthUser()
    expect(await devPeekOtp(db, u.userId)).toBeNull()
  })
})

describe("auth.requestOtp — envoi email réel", () => {
  it("sans RESEND_API_KEY configuré (dev), n'essaie pas d'envoyer d'email", async () => {
    const u = await makeAuthUser()
    const { sendOtpEmail } = await import("../../email/service")
    await requestOtp(db, u.userId)
    expect(sendOtpEmail).not.toHaveBeenCalled()
  })

  it("avec RESEND_API_KEY configuré, déclenche réellement l'envoi avec les bons paramètres", async () => {
    process.env.RESEND_API_KEY = "re_test_fake_key"
    const u = await makeAuthUser()
    const { sendOtpEmail } = await import("../../email/service")
    await requestOtp(db, u.userId)
    const { code } = (await devPeekOtp(db, u.userId))!

    expect(sendOtpEmail).toHaveBeenCalledTimes(1)
    expect(sendOtpEmail).toHaveBeenCalledWith(u.email, code, "Auth")
  })

  it("en développement, une erreur Resend ne bloque pas le code OTP de recette", async () => {
    process.env.RESEND_API_KEY = "re_test_fake_key"
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "development"
    const u = await makeAuthUser()
    const { sendOtpEmail } = await import("../../email/service")
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("Fournisseur indisponible"))

    await expect(requestOtp(db, u.userId)).resolves.toEqual({ expiresInSeconds: 300 })
    expect(await devPeekOtp(db, u.userId)).not.toBeNull()
    process.env.NODE_ENV = previousNodeEnv
  })

  it("en production, une erreur Resend reste bloquante", async () => {
    process.env.RESEND_API_KEY = "re_test_fake_key"
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const u = await makeAuthUser()
    const { sendOtpEmail } = await import("../../email/service")
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("Fournisseur indisponible"))

    await expect(requestOtp(db, u.userId)).rejects.toThrow("Fournisseur indisponible")
    process.env.NODE_ENV = previousNodeEnv
  })
})
