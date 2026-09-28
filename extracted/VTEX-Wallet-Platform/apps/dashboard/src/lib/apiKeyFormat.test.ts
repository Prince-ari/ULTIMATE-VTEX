import { describe, expect, it } from "vitest"

import { KEY_STATE_LABEL, KEY_STATE_TONE, SCOPE_LABEL, daysUntil, isWriteScope, needsRenewal, sinceLabel, usedWithin } from "./apiKeyFormat"

const NOW = Date.parse("2026-09-26T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms)

describe("apiKeyFormat", () => {
  it("durée écoulée lisible, date au-delà de 30 jours, « Jamais » sans utilisation", () => {
    expect(sinceLabel(null, NOW)).toBe("Jamais")
    expect(sinceLabel(ago(20_000), NOW)).toBe("à l'instant")
    expect(sinceLabel(ago(5 * 60_000), NOW)).toBe("il y a 5 min")
    expect(sinceLabel(ago(3 * 3_600_000), NOW)).toBe("il y a 3 h")
    expect(sinceLabel(ago(5 * 86_400_000), NOW)).toBe("il y a 5 j")
    expect(sinceLabel(ago(90 * 86_400_000), NOW)).toMatch(/2026/)
  })

  it("jours avant expiration : arrondi supérieur, nul si la clé n'expire pas, négatif une fois expirée", () => {
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil(new Date(NOW + 36 * 3_600_000), NOW)).toBe(2)
    expect(daysUntil(new Date(NOW - 86_400_000), NOW)).toBe(-1)
  })

  it("à renouveler : clé active qui expire sous 14 jours, jamais une clé révoquée ni sans échéance", () => {
    const soon = new Date(NOW + 10 * 86_400_000)
    expect(needsRenewal({ state: "active", expiresAt: soon }, NOW)).toBe(true)
    expect(needsRenewal({ state: "active", expiresAt: new Date(NOW + 40 * 86_400_000) }, NOW)).toBe(false)
    expect(needsRenewal({ state: "revoked", expiresAt: soon }, NOW)).toBe(false)
    expect(needsRenewal({ state: "active", expiresAt: null }, NOW)).toBe(false)
  })

  it("utilisée dans les dernières heures", () => {
    expect(usedWithin({ lastUsedAt: ago(3_600_000) }, 24, NOW)).toBe(true)
    expect(usedWithin({ lastUsedAt: ago(30 * 3_600_000) }, 24, NOW)).toBe(false)
    expect(usedWithin({ lastUsedAt: null }, 24, NOW)).toBe(false)
  })

  it("chaque état a un libellé et un ton ; les droits d'écriture sont repérés", () => {
    expect(Object.keys(KEY_STATE_LABEL).sort()).toEqual(Object.keys(KEY_STATE_TONE).sort())
    expect(isWriteScope("payment_links:write")).toBe(true)
    expect(isWriteScope("wallet:read")).toBe(false)
    expect(SCOPE_LABEL["wallet:read"]).toBeTruthy()
  })
})
