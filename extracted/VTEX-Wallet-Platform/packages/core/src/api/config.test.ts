import { describe, expect, it } from "vitest"

import { coreRouter } from "./router"

describe("config.currencies — liste publique des devises, identique à celle du serveur", () => {
  it("est lisible sans authentification et ne contient aucune donnée d'utilisateur", async () => {
    const caller = coreRouter.createCaller({ actor: null, jti: null, ip: "127.0.0.1", requestId: "req-config" })
    const currencies = await caller.config.currencies()
    expect(currencies.map((currency) => currency.code)).toEqual(["EUR", "USD", "XPF"])
    expect(currencies.find((currency) => currency.code === "XPF")).toMatchObject({ symbol: "₣", decimals: 0, eurRate: 119.3317, glyph: "₣", iconName: null })
    expect(currencies.find((currency) => currency.code === "EUR")).toMatchObject({ eurRate: 1, iconName: "currency-eur" })
    // Le dollar n'a pas de parité fixe : il ne peut pas être une devise d'affichage.
    expect(currencies.find((currency) => currency.code === "USD")?.eurRate).toBeNull()
  })
})
