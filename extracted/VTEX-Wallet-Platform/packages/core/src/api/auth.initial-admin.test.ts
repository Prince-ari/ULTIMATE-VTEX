import { beforeEach, describe, expect, it, vi } from "vitest"
import { hashPassword } from "../auth/password"

const state = vi.hoisted(() => ({
  user: null as null | {
    id: number
    email: string
    firstName: string
    lastName: string
    passwordHash: string
    status: "active"
  },
  otpWrites: 0,
}))

vi.mock("../db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.user ? [state.user] : [],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onDuplicateKeyUpdate: async () => {
          state.otpWrites += 1
        },
      }),
    }),
  },
}))

vi.mock("./rateLimit", () => ({
  checkRateLimit: async () => undefined,
}))

import { authRouter } from "./routers/auth"

describe("auth.login — compte administrateur initial", () => {
  beforeEach(() => {
    const email = process.env.VTEX_INITIAL_ADMIN_EMAIL
    const password = process.env.VTEX_INITIAL_ADMIN_PASSWORD
    if (!email || !password) throw new Error("Les variables d’amorçage administrateur doivent être définies pour ce test.")
    state.user = {
      id: 1,
      email: email.toLowerCase(),
      firstName: "Admin",
      lastName: "Audit",
      passwordHash: hashPassword(password),
      status: "active",
    }
    state.otpWrites = 0
  })

  it("accepte les identifiants injectés et demande une seconde étape OTP", async () => {
    const caller = authRouter.createCaller({ actor: null, jti: null, ip: "127.0.0.1", requestId: "test-request" })
    const result = await caller.login({
      email: process.env.VTEX_INITIAL_ADMIN_EMAIL!,
      password: process.env.VTEX_INITIAL_ADMIN_PASSWORD!,
    })

    expect(result).toEqual({ userId: 1, requiresOtp: true })
    expect(state.otpWrites).toBe(1)
  })
})
