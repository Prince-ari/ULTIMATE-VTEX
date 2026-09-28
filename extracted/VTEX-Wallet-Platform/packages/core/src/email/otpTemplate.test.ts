import { describe, expect, it } from "vitest"

import { otpEmailHtml, otpEmailText } from "./otpTemplate"

describe("otpEmailHtml", () => {
  it("renders each generated digit in a visual box and in a copy-friendly fallback", () => {
    const html = otpEmailHtml("482731", "Aline")

    for (const digit of "482731") expect(html).toContain(`>${digit}</td>`)
    expect(html).toContain("482731</span>")
    expect(html).toContain("Pour copier facilement le code")
    expect(html).toContain("Ce code expire dans <strong>5 minutes</strong>")
  })

  it("changes the rendered value for each OTP and escapes the recipient name", () => {
    const first = otpEmailHtml("111111", "Aline & Bob")
    const second = otpEmailHtml("999999", "Aline & Bob")

    expect(first).toContain("Aline &amp; Bob")
    expect(first).toContain("111111</span>")
    expect(first).not.toContain("999999</span>")
    expect(second).toContain("999999</span>")
  })

  it("rejects malformed codes before they reach the email provider", () => {
    expect(() => otpEmailHtml("12345", "Aline")).toThrow(/six chiffres/)
    expect(() => otpEmailHtml("12abcd", "Aline")).toThrow(/six chiffres/)
  })

  it("provides a plain-text copy and paste fallback", () => {
    const text = otpEmailText("482731", "Aline")

    expect(text).toContain("482731")
    expect(text).toContain("copier et coller")
  })
})
