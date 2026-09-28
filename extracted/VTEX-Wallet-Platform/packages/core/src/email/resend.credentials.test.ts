import { describe, expect, it } from "vitest"

describe("configuration Resend", () => {
  it("authentifie la clé API auprès de l’endpoint léger des domaines", async () => {
    const key = process.env.RESEND_API_KEY
    expect(key).toBeTruthy()

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    })

    expect(response.ok).toBe(true)
    const payload = (await response.json()) as { data?: unknown[] }
    expect(Array.isArray(payload.data)).toBe(true)
  }, 15_000)
})
