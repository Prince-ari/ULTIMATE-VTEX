import { describe, expect, it } from "vitest"
import {
  add,
  assertCents,
  CURRENCY_CATALOG,
  CURRENCY_CODES,
  CURRENCY_SYMBOLS,
  canConvert,
  convert,
  currencyInfo,
  format,
  fromEuros,
  fromMajorUnits,
  isCurrencyCode,
  isNegative,
  isPositive,
  isValidCents,
  subtract,
  toEuros,
  toMajorUnits,
} from "./index"

describe("fromEuros", () => {
  it("convertit un montant simple sans erreur d'arrondi", () => {
    // Cas piège connu : 19.99 * 100 = 1998.9999999999998 en flottant brut
    expect(fromEuros(19.99)).toBe(1999)
  })

  it("gère les montants ronds", () => {
    expect(fromEuros(1500)).toBe(150000)
  })

  it("rejette une valeur non finie", () => {
    expect(() => fromEuros(NaN)).toThrow()
    expect(() => fromEuros(Infinity)).toThrow()
  })
})

describe("toEuros", () => {
  it("reconvertit correctement", () => {
    expect(toEuros(150000)).toBe(1500)
    expect(toEuros(1999)).toBeCloseTo(19.99)
  })

  it("rejette un flottant en entrée (jamais de centimes non entiers)", () => {
    expect(() => toEuros(19.5)).toThrow()
  })
})

describe("isValidCents", () => {
  it("accepte les entiers sûrs", () => {
    expect(isValidCents(0)).toBe(true)
    expect(isValidCents(150000)).toBe(true)
    expect(isValidCents(-500)).toBe(true)
  })

  it("rejette les flottants, NaN, chaînes", () => {
    expect(isValidCents(19.99)).toBe(false)
    expect(isValidCents(NaN)).toBe(false)
    expect(isValidCents("1500")).toBe(false)
    expect(isValidCents(undefined)).toBe(false)
  })
})

describe("add / subtract", () => {
  it("additionne deux montants entiers", () => {
    expect(add(1000, 250)).toBe(1250)
  })

  it("soustrait deux montants entiers", () => {
    expect(subtract(1000, 250)).toBe(750)
  })

  it("lève une erreur si un opérande n'est pas des centimes valides", () => {
    expect(() => add(1000, 19.99 as unknown as number)).toThrow()
  })
})

describe("isPositive / isNegative", () => {
  it("distingue correctement les signes", () => {
    expect(isPositive(100)).toBe(true)
    expect(isPositive(-100)).toBe(false)
    expect(isNegative(-100)).toBe(true)
    expect(isNegative(100)).toBe(false)
  })
})

describe("format", () => {
  it("formate en euros français", () => {
    // Espace insécable entre le nombre et le symbole selon Intl fr-FR
    expect(format(150000)).toContain("1")
    expect(format(150000)).toContain("500")
    expect(format(150000)).toContain("€")
  })

  it("formate le dollar avec 2 décimales, comme l'euro", () => {
    const usd = format(150050, "USD")
    expect(usd).toContain("1")
    expect(usd).toContain("500")
    expect(usd).toContain("50")
  })

  it("formate le franc Pacifique SANS décimale, avec le signe ₣ (devise à zéro décimale)", () => {
    const xpf = format(1500, "XPF")
    expect(xpf).not.toMatch(/,\d/) // aucune virgule suivie de décimales
    expect(xpf).toContain("1")
    expect(xpf).toContain("500")
    expect(xpf.endsWith("₣")).toBe(true)
    expect(xpf).not.toMatch(/XPF|CFP/)
  })
})

describe("conversion EUR ↔ XPF à parité fixe", () => {
  it("1 EUR = 119,3317 XPF : 2 000 € → 238 663 ₣ ; 238 663 ₣ → 2 000 €", () => {
    expect(convert(200000, "EUR", "XPF")).toBe(238663)
    expect(convert(238663, "XPF", "EUR")).toBe(200000)
  })

  it("même devise : identité ; le dollar n'est jamais converti", () => {
    expect(convert(1234, "EUR", "EUR")).toBe(1234)
    expect(canConvert("EUR", "USD")).toBe(false)
    expect(() => convert(100, "USD", "XPF")).toThrow()
  })
})

describe("fromMajorUnits / toMajorUnits — multi-devises", () => {
  it("EUR et USD : facteur 100 (centimes), comme fromEuros historique", () => {
    expect(fromMajorUnits(19.99, "EUR")).toBe(1999)
    expect(fromMajorUnits(19.99, "USD")).toBe(1999)
  })

  it("XPF : facteur 1 — le montant stocké EST le montant XPF, pas des centimes", () => {
    expect(fromMajorUnits(1500, "XPF")).toBe(1500)
    expect(toMajorUnits(1500, "XPF")).toBe(1500)
  })

  it("round-trip cohérent pour chaque devise", () => {
    for (const currency of ["EUR", "USD", "XPF"] as const) {
      const stored = fromMajorUnits(42, currency)
      expect(toMajorUnits(stored, currency)).toBe(42)
    }
  })

  it("fromEuros/toEuros restent équivalents à fromMajorUnits/toMajorUnits en EUR (rétrocompatibilité)", () => {
    expect(fromEuros(19.99)).toBe(fromMajorUnits(19.99, "EUR"))
    expect(toEuros(1999)).toBe(toMajorUnits(1999, "EUR"))
  })
})

describe("assertCents", () => {
  it("ne lève rien pour une valeur valide", () => {
    expect(() => assertCents(1000)).not.toThrow()
  })

  it("lève avec un message contextualisé", () => {
    expect(() => assertCents(1.5, "product.adjustBalance")).toThrowError(
      /product\.adjustBalance/,
    )
  })
})

describe("catalogue des devises (configuration centralisée)", () => {
  it("chaque code pris en charge a une configuration cohérente (code, symbole, décimales)", () => {
    expect([...CURRENCY_CODES]).toEqual(["EUR", "USD", "XPF"])
    for (const code of CURRENCY_CODES) {
      const info = CURRENCY_CATALOG[code]
      expect(info.code).toBe(code)
      expect(info.symbol).toBe(CURRENCY_SYMBOLS[code])
      expect([0, 2]).toContain(info.decimals)
      expect(info.glyph.length).toBeGreaterThan(0)
    }
  })

  it("le franc Pacifique : ₣, zéro décimale, sans icône Phosphor (repli sur le glyphe) ; l'euro et le dollar ont une icône", () => {
    expect(currencyInfo("XPF")).toMatchObject({ symbol: "₣", decimals: 0, iconName: null, glyph: "₣" })
    expect(currencyInfo("EUR").iconName).toBe("currency-eur")
    expect(currencyInfo("USD").iconName).toBe("currency-dollar")
  })

  it("les décimales du catalogue pilotent le stockage et le formatage (aucune liste parallèle)", () => {
    expect(fromMajorUnits(1500, "XPF")).toBe(1500)
    expect(fromMajorUnits(15, "EUR")).toBe(1500)
    expect(format(1500, "XPF")).toMatch(/^1\s500\s₣$/u)
  })

  it("isCurrencyCode / currencyInfo refusent tout code inconnu ou mal casé", () => {
    expect(isCurrencyCode("EUR")).toBe(true)
    expect(isCurrencyCode("eur")).toBe(false)
    expect(isCurrencyCode("GBP")).toBe(false)
    expect(isCurrencyCode(undefined)).toBe(false)
    expect(() => currencyInfo("GBP")).toThrow(/non prise en charge/)
  })
})