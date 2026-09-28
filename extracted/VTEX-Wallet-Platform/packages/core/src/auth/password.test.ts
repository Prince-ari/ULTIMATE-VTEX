import { describe, expect, it } from "vitest"

import { assertPasswordPolicy, generateTemporaryPassword, hashPassword, verifyPassword } from "./password"
import { ValidationError } from "./permissions"

describe("politique de mot de passe", () => {
  it("accepte un mot de passe de 10+ caractères avec lettre et chiffre", () => {
    expect(() => assertPasswordPolicy("Correct-Horse-42", "alice@example.com")).not.toThrow()
  })

  it.each([
    ["trop court", "Abc123"],
    ["sans chiffre", "uniquementdeslettres"],
    ["sans lettre", "12345678901234"],
    ["trop long", "a1".repeat(70)],
  ])("refuse un mot de passe %s", (_label, password) => {
    expect(() => assertPasswordPolicy(password)).toThrow(ValidationError)
  })

  it("refuse un mot de passe qui contient l'identifiant e-mail", () => {
    expect(() => assertPasswordPolicy("marie.dupont-2026x", "marie.dupont@example.com")).toThrow(/identifiant/)
    // Une partie locale très courte ne déclenche pas la règle (trop de faux positifs).
    expect(() => assertPasswordPolicy("ab-Valid-Pass-42", "ab@example.com")).not.toThrow()
  })
})

describe("mot de passe temporaire", () => {
  it("fait 16 caractères, contient toujours une lettre et un chiffre, sans caractères ambigus", () => {
    for (let i = 0; i < 300; i += 1) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(16)
      expect(password).toMatch(/[A-Za-z]/)
      expect(password).toMatch(/\d/)
      expect(password).not.toMatch(/[0OIl1]/)
      expect(() => assertPasswordPolicy(password)).not.toThrow()
    }
  })

  it("n'est jamais deux fois identique et se vérifie via son hash uniquement", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()))
    expect(seen.size).toBe(200)
    const password = generateTemporaryPassword()
    const stored = hashPassword(password)
    expect(stored).not.toContain(password)
    expect(verifyPassword(password, stored)).toBe(true)
    expect(verifyPassword(password + "x", stored)).toBe(false)
  })
})
