import { beforeEach, describe, expect, it, vi } from "vitest"

const send = vi.fn()

vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
  },
}))

import { sendOtpEmail } from "./service"

describe("sendOtpEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.EMAIL_FROM = "VTEX <connexion@vtex.kolaci.org>"
    send.mockReset()
    send.mockResolvedValue({ data: { id: "email_test" }, error: null })
  })

  it("sends the visual OTP and the copy-friendly text for the generated code", async () => {
    await sendOtpEmail("client@example.com", "482731", "Aline")

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "VTEX <connexion@vtex.kolaci.org>",
      to: "client@example.com",
      subject: "Votre code de connexion VTEX",
      html: expect.stringContaining("482731</span>"),
      text: expect.stringContaining("482731"),
    }))
  })

  it("keeps each email bound to its own OTP", async () => {
    await sendOtpEmail("first@example.com", "111111", "Aline")
    await sendOtpEmail("second@example.com", "999999", "Benoît")

    const first = send.mock.calls[0]?.[0] as { html: string; text: string }
    const second = send.mock.calls[1]?.[0] as { html: string; text: string }
    expect(first.html).toContain("111111</span>")
    expect(first.text).toContain("111111")
    expect(second.html).toContain("999999</span>")
    expect(second.text).toContain("999999")
    expect(first.html).not.toContain("999999</span>")
  })
})
