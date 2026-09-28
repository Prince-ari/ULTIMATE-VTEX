import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../email/service", () => ({ sendOtpEmail: vi.fn(), EmailError: class EmailError extends Error {} }))

import { sendOtpEmail } from "../../email/service"
import { requestOtp } from "./service"

function makeDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined) })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ email: "demo@example.test", firstName: "Demo" }]) })) })),
    })),
  }
}

const initialNodeEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = initialNodeEnv
  delete process.env.RESEND_API_KEY
  vi.clearAllMocks()
})

describe("auth.requestOtp — résilience fournisseur", () => {
  it("conserve le code de recette quand Resend échoue hors production", async () => {
    process.env.NODE_ENV = "development"
    process.env.RESEND_API_KEY = "re_test_key"
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("fournisseur indisponible"))

    await expect(requestOtp(makeDb() as never, 42)).resolves.toEqual({ expiresInSeconds: 300 })
  })

  it("propage l’échec de Resend en production", async () => {
    process.env.NODE_ENV = "production"
    process.env.RESEND_API_KEY = "re_test_key"
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("fournisseur indisponible"))

    await expect(requestOtp(makeDb() as never, 42)).rejects.toThrow("fournisseur indisponible")
  })
})
