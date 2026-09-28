import { describe, expect, it } from "vitest"

import { describeBankEvent, groupIban, maskIbanInput, toneForCurrency } from "./bankFormat"

describe("bankFormat", () => {
  it("groupe l'IBAN par quatre et normalise la saisie", () => {
    expect(groupIban("FR7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189")
    expect(groupIban("FR76 3000")).toBe("FR76 3000")
    expect(maskIbanInput("fr76-3000 6000.0112")).toBe("FR76 3000 6000 0112")
    expect(maskIbanInput("a".repeat(60)).replace(/ /g, "")).toHaveLength(34)
    expect(maskIbanInput("")).toBe("")
  })

  it("une devise garde toujours la même teinte", () => {
    expect(toneForCurrency("EUR")).toBe("violet")
    expect(toneForCurrency("XPF")).toBe("amber")
    expect(toneForCurrency("USD")).toBe("green")
    expect(toneForCurrency("GBP")).toBe("teal")
  })

  it("décrit les événements du journal d'un RIB sans jamais inventer de valeur", () => {
    expect(describeBankEvent({ action: "bank.account.create", detail: { generated: true } })).toMatchObject({ title: "RIB créé (IBAN généré)", tone: "ok" })
    expect(describeBankEvent({ action: "bank.account.update", detail: { fields: ["iban", "bic", "label"], reason: "Rotation demandée" } })).toEqual({ title: "Modifié : IBAN, BIC, libellé", reason: "Rotation demandée", tone: "neutral" })
    expect(describeBankEvent({ action: "bank.account.reassign", detail: { reason: "Transfert" } })).toMatchObject({ title: "Réattribué à un autre compte", reason: "Transfert", tone: "warn" })
    expect(describeBankEvent({ action: "bank.account.disable", detail: null })).toMatchObject({ title: "Désactivé", reason: null, tone: "danger" })
    expect(describeBankEvent({ action: "bank.iban.reveal", detail: { reason: "ignoré" } })).toMatchObject({ title: "IBAN affiché", reason: null })
    expect(describeBankEvent({ action: "bank.autre", detail: {} })).toMatchObject({ title: "bank.autre" })
  })
})
