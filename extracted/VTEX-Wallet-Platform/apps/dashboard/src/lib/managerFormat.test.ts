import { describe, expect, it } from "vitest"

import { MANAGER_ROLE_HINT, MANAGER_ROLE_LABEL, MANAGER_STATUS_LABEL, MANAGER_STATUS_TONE, SUGGESTION_STATE_LABEL, SUGGESTION_STATE_TONE, activityLabel, initials, walletCountLabel } from "./managerFormat"

const NOW = Date.parse("2026-09-26T12:00:00Z")

describe("managerFormat", () => {
  it("initiales : deux lettres au plus, majuscules, jamais vide", () => {
    expect(initials("Léa Fontaine")).toBe("LF")
    expect(initials("  camille  ")).toBe("C")
    expect(initials("Jean Pierre Marie")).toBe("JP")
    expect(initials("")).toBe("?")
  })

  it("nombre de wallets accordé au pluriel", () => {
    expect(walletCountLabel(0)).toBe("Aucun wallet")
    expect(walletCountLabel(1)).toBe("1 wallet")
    expect(walletCountLabel(12)).toBe("12 wallets")
  })

  it("dernière activité lisible, « Jamais connecté » sans activité", () => {
    expect(activityLabel(null, NOW)).toBe("Jamais connecté")
    expect(activityLabel(new Date(NOW - 10_000), NOW)).toBe("à l'instant")
    expect(activityLabel(new Date(NOW - 5 * 60_000), NOW)).toBe("il y a 5 min")
    expect(activityLabel(new Date(NOW - 3 * 3_600_000), NOW)).toBe("il y a 3 h")
    expect(activityLabel(new Date(NOW - 4 * 86_400_000), NOW)).toBe("il y a 4 j")
    expect(activityLabel(new Date(NOW - 90 * 86_400_000), NOW)).toMatch(/2026/)
  })

  it("chaque rôle et chaque état ont un libellé ; le gestionnaire est décrit comme borné à son portefeuille", () => {
    expect(Object.keys(MANAGER_ROLE_LABEL).sort()).toEqual(Object.keys(MANAGER_ROLE_HINT).sort())
    expect(MANAGER_ROLE_HINT.account_manager).toMatch(/attribués/)
    expect(Object.keys(MANAGER_STATUS_LABEL).sort()).toEqual(Object.keys(MANAGER_STATUS_TONE).sort())
    expect(Object.keys(SUGGESTION_STATE_LABEL).sort()).toEqual(Object.keys(SUGGESTION_STATE_TONE).sort())
  })
})
