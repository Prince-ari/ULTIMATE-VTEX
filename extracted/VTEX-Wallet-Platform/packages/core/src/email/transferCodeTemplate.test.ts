import { describe, expect, it } from "vitest"

import { transferCodeEmailHtml, transferCodeEmailText } from "./transferCodeTemplate"

describe("transferCodeEmailHtml", () => {
  it("renders each generated digit in a visual box and in a copy-friendly fallback", () => {
    const html = transferCodeEmailHtml("482731", "Aline", "transfer")

    for (const digit of "482731") expect(html).toContain(`>${digit}</td>`)
    expect(html).toContain("482731</span>")
    expect(html).toContain("Pour copier facilement le code")
    expect(html).toContain("Ce code expire dans <strong>10 minutes</strong>")
  })

  it("adapts the copy to the purpose (unlock vs. per-transfer validation)", () => {
    const unlock = transferCodeEmailHtml("111111", "Aline", "unlock")
    const transfer = transferCodeEmailHtml("222222", "Aline", "transfer")

    expect(unlock).toContain("Débloquez vos virements")
    expect(transfer).toContain("Confirmez votre virement")
    expect(transfer).toContain("contactez le support")
  })

  it("escapes the recipient name", () => {
    const html = transferCodeEmailHtml("111111", "Aline & Bob", "unlock")
    expect(html).toContain("Aline &amp; Bob")
  })

  it("rejects malformed codes before they reach the email provider", () => {
    expect(() => transferCodeEmailHtml("12345", "Aline", "unlock")).toThrow(/six chiffres/)
    expect(() => transferCodeEmailHtml("12abcd", "Aline", "transfer")).toThrow(/six chiffres/)
  })

  it("provides a plain-text copy and paste fallback", () => {
    const text = transferCodeEmailText("482731", "Aline", "unlock")
    expect(text).toContain("482731")
    expect(text).toContain("Débloquez vos virements")
  })
})
