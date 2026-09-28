import { describe, expect, it } from "vitest"

function senderDomain(value: string): string | null {
  const address = value.match(/<([^>]+)>/)?.[1] ?? value.trim()
  const at = address.lastIndexOf("@")
  return at > 0 ? address.slice(at + 1).toLowerCase() : null
}

describe("Resend OTP sender", () => {
  it("uses an EMAIL_FROM address on a verified Resend domain", async () => {
    const apiKey = process.env.RESEND_API_KEY
    const domain = senderDomain(process.env.EMAIL_FROM ?? "")

    expect(apiKey, "RESEND_API_KEY must be configured").toBeTruthy()
    expect(domain, "EMAIL_FROM must contain a valid email address").toBeTruthy()

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(response.ok).toBe(true)

    const payload = await response.json() as { data?: Array<{ name?: string; status?: string }> }
    const match = payload.data?.find((entry) => entry.name?.toLowerCase() === domain)
    expect(match?.status).toBe("verified")
  })
})
