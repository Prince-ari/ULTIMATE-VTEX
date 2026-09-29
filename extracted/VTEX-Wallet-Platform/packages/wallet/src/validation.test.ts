import { describe, expect, it } from "vitest"
import { ValidationError } from "@vtex/core"
import { assertIdempotencyKey, assertPositiveCents, assertSupportedCurrency, assertValueDate, normalizeAndValidateBic, normalizeAndValidateIban } from "./validation"

describe("validation Wallet", () => {
  it("normalise et valide un IBAN conforme à MOD 97", () => {
    expect(normalizeAndValidateIban("FR14 2004 1010 0505 0001 3M02 606")).toBe("FR1420041010050500013M02606")
  })

  it("rejette un IBAN dont la clé de contrôle est invalide", () => {
    expect(() => normalizeAndValidateIban("FR1420041010050500013M02607")).toThrow(ValidationError)
  })

  it("normalise et valide un BIC avec ou sans branche", () => {
    expect(normalizeAndValidateBic("vtexfrppxxx")).toBe("VTEXFRPPXXX")
    expect(normalizeAndValidateBic("VTEXFRPP")).toBe("VTEXFRPP")
    expect(() => normalizeAndValidateBic("BAD")).toThrow(ValidationError)
  })

  it("n’accepte que des montants entiers strictement positifs", () => {
    expect(() => assertPositiveCents(1250, "Montant")).not.toThrow()
    expect(() => assertPositiveCents(12.5, "Montant")).toThrow(ValidationError)
    expect(() => assertPositiveCents(0, "Montant")).toThrow(ValidationError)
    expect(() => assertPositiveCents(-1, "Montant")).toThrow(ValidationError)
  })

  it("restreint les devises au contrat VTEX", () => {
    expect(() => assertSupportedCurrency("EUR")).not.toThrow()
    expect(() => assertSupportedCurrency("GBP")).toThrow(ValidationError)
  })

  it("impose une clé d’idempotence stable et suffisamment longue", () => {
    expect(() => assertIdempotencyKey("transfer:4d6b40c5-5fbc-46d3-9062-a719f05b65c2")).not.toThrow()
    expect(() => assertIdempotencyKey("trop-court")).toThrow(ValidationError)
    expect(() => assertIdempotencyKey("clé avec espace non permise................................")).toThrow(ValidationError)
  })

  it("la date de valeur affichée au titulaire ne peut jamais être dans le futur", () => {
    expect(() => assertValueDate(new Date(Date.now() - 86_400_000))).not.toThrow()
    expect(() => assertValueDate(new Date())).not.toThrow()
    expect(() => assertValueDate(new Date(Date.now() + 3 * 86_400_000))).toThrow(ValidationError)
    expect(() => assertValueDate(new Date("not-a-date"))).toThrow(ValidationError)
  })
})
