import { describe, expect, it } from "vitest"

import { cardLabel, formatTotals, isOpenPayment, money, publicPayUrl, socleFor, sumByCurrency, LINK_STATUS_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "./paymentLinkFormat"

describe("paymentLinkFormat", () => {
  it("additionne par devise sans jamais mélanger euros et francs Pacifique", () => {
    const totals = sumByCurrency([{ currency: "EUR", cents: 12_500 }, { currency: "XPF", cents: 60_000 }, { currency: "EUR", cents: 2_500 }])
    expect(totals).toEqual({ EUR: 15_000, XPF: 60_000 })
    expect(formatTotals(totals)).toMatch(/150,00\s?€ · 60\s?000\s?₣/)
    expect(formatTotals({})).toBe("—")
    expect(formatTotals({ EUR: 0 })).toBe("—")
  })

  it("le franc Pacifique s'écrit avec ₣ et une devise inconnue ne casse pas l'affichage", () => {
    expect(money(119_000, "XPF")).toContain("₣")
    expect(money(1_000, "ZZZ")).toBe("1000 ZZZ")
  })

  it("adresse publique : variable d'environnement, sinon port local en développement, sinon chemin relatif (jamais un domaine inventé)", () => {
    expect(publicPayUrl("aB3_x-9QwErT", "https://pro.vtex.app/", false)).toBe("https://pro.vtex.app/pay/aB3_x-9QwErT")
    expect(publicPayUrl("aB3_x-9QwErT", undefined, true)).toBe("http://localhost:3001/pay/aB3_x-9QwErT")
    expect(publicPayUrl("aB3_x-9QwErT", "  ", false)).toBe("/pay/aB3_x-9QwErT")
  })

  it("carte : marque lisible et quatre derniers chiffres, jamais un numéro complet", () => {
    expect(cardLabel("visa", "4242")).toBe("Visa •••• 4242")
    expect(cardLabel("cartes_bancaires", "0001")).toBe("CB •••• 0001")
    expect(cardLabel(null, null)).toBe("Carte non renseignée")
  })

  it("seuls les paiements ouverts se revérifient ; chaque état a un libellé et un ton", () => {
    expect((["pending", "requires_action", "processing"] as const).every(isOpenPayment)).toBe(true)
    expect((["succeeded", "failed", "canceled", "refunded"] as const).some(isOpenPayment)).toBe(false)
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual(Object.keys(PAYMENT_STATUS_TONE).sort())
    expect(LINK_STATUS_LABEL.disabled).toBe("Suspendu")
  })

  it("le cycle de socles boucle", () => {
    expect(socleFor(0)).toBe("violet")
    expect(socleFor(5)).toBe("violet")
    expect(new Set([0, 1, 2, 3, 4].map(socleFor)).size).toBe(5)
  })
})
