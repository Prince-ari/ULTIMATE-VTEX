import { describe, expect, it } from "vitest"

import { detectNetwork, digitsOnly, formatExpiry, groupPan, isExpired, luhnValid, maskExpiryInput, maskedPan, parseExpiry, relativeTime, themeFor } from "./cardFormat"

describe("cardFormat", () => {
  it("groupe le numéro par 4 (4-6-5 pour American Express) et ignore tout sauf les chiffres", () => {
    expect(groupPan("4111111111111111")).toBe("4111 1111 1111 1111")
    expect(groupPan("4111-1111 1111.1111")).toBe("4111 1111 1111 1111")
    expect(groupPan("378282246310005")).toBe("3782 822463 10005")
    expect(groupPan("41111")).toBe("4111 1")
    expect(digitsOnly("a1b2 3-4")).toBe("1234")
  })

  it("masque le numéro sans jamais laisser plus que les quatre derniers chiffres", () => {
    expect(maskedPan("4242")).toBe("•••• •••• •••• 4242")
    expect(maskedPan("4242", 15)).toBe("•••• •••• •••• 4242")
    expect(maskedPan("0005", 12)).toBe("•••• •••• 0005")
    expect(maskedPan("4242")).not.toMatch(/\d{5}/)
  })

  it("formate et lit l'expiration MM/AA", () => {
    expect(formatExpiry(7, 2029)).toBe("07/29")
    expect(formatExpiry(12, 2030)).toBe("12/30")
    expect(parseExpiry("0729")).toEqual({ month: 7, year: 2029 })
    expect(parseExpiry("07/29")).toEqual({ month: 7, year: 2029 })
    expect(parseExpiry("07/2031")).toEqual({ month: 7, year: 2031 })
    expect(parseExpiry("13/29")).toBeNull()
    expect(parseExpiry("00/29")).toBeNull()
    expect(parseExpiry("07/2")).toBeNull()
  })

  it("masque de saisie : barre automatique après le mois, quatre chiffres au plus", () => {
    expect(maskExpiryInput("0")).toBe("0")
    expect(maskExpiryInput("07")).toBe("07")
    expect(maskExpiryInput("072")).toBe("07/2")
    expect(maskExpiryInput("07/2999")).toBe("07/29")
    expect(maskExpiryInput("ab")).toBe("")
  })

  it("détecte une expiration dépassée au mois près", () => {
    const now = new Date(Date.UTC(2026, 8, 25))
    expect(isExpired(8, 2026, now)).toBe(true)
    expect(isExpired(9, 2026, now)).toBe(false)
    expect(isExpired(1, 2027, now)).toBe(false)
    expect(isExpired(12, 2025, now)).toBe(true)
  })

  it("clé de Luhn et réseau", () => {
    expect(luhnValid("4111 1111 1111 1111")).toBe(true)
    expect(luhnValid("4111 1111 1111 1112")).toBe(false)
    expect(luhnValid("1234")).toBe(false)
    expect(detectNetwork("4111")).toBe("visa")
    expect(detectNetwork("5555 5555")).toBe("mastercard")
    expect(detectNetwork("2221 00")).toBe("mastercard")
    expect(detectNetwork("3782")).toBe("amex")
    expect(detectNetwork("6011")).toBeNull()
  })

  it("thème : une carte personnelle est navy, une carte Pro garde le sien", () => {
    expect(themeFor({ theme: null })).toBe("navy")
    expect(themeFor({ theme: "brick" })).toBe("brick")
  })

  it("temps relatif", () => {
    const now = new Date("2026-09-25T12:00:00Z")
    expect(relativeTime("2026-09-25T11:59:50Z", now)).toBe("à l'instant")
    expect(relativeTime("2026-09-25T11:55:00Z", now)).toBe("il y a 5 min")
    expect(relativeTime("2026-09-25T09:00:00Z", now)).toBe("il y a 3 h")
    expect(relativeTime("2026-09-23T12:00:00Z", now)).toBe("il y a 2 j")
    expect(relativeTime("2026-06-01T12:00:00Z", now)).toMatch(/2026/)
  })
})
