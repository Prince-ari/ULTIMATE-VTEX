import { describe, expect, it } from "vitest"

import { displayMoney, parseToStored } from "./displayCurrency"

// Espaces insécables (fr-FR) normalisés pour des assertions lisibles.
const flat = (value: string) => value.replace(/[  ]/g, " ")

describe("displayMoney — devise d'affichage du Dashboard", () => {
  it("affiche les euros en euros quand la devise d'affichage est l'euro", () => {
    expect(flat(displayMoney(200000, "EUR", "EUR"))).toBe("2 000,00 €")
  })

  it("convertit les euros en francs Pacifique avec le signe ₣ (jamais XPF)", () => {
    const value = flat(displayMoney(200000, "EUR", "XPF"))
    expect(value).toBe("238 663 ₣")
    expect(value).not.toMatch(/XPF|CFP/)
  })

  it("convertit un compte en francs Pacifique vers l'euro quand l'euro est demandé", () => {
    expect(flat(displayMoney(238663, "XPF", "EUR"))).toBe("2 000,00 €")
  })

  it("ne convertit jamais le dollar", () => {
    expect(flat(displayMoney(12345, "USD", "XPF"))).toBe("123,45 $")
  })
})

describe("parseToStored — saisie dans la devise d'affichage", () => {
  it("₣ saisis → centimes d'euro du compte", () => {
    expect(parseToStored("238 663", "XPF", "EUR")).toBe(200000)
  })

  it("€ saisis sur un compte en euros restent inchangés (virgule décimale acceptée)", () => {
    expect(parseToStored("2 000,50", "EUR", "EUR")).toBe(200050)
  })

  it("€ saisis sur un compte en francs Pacifique → francs entiers", () => {
    expect(parseToStored("2000", "EUR", "XPF")).toBe(238663)
  })

  it("refuse une valeur non numérique et une conversion sans parité", () => {
    expect(parseToStored("abc", "EUR", "EUR")).toBeNull()
    expect(parseToStored("10", "XPF", "USD")).toBeNull()
  })
})
