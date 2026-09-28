import { describe, expect, it } from "vitest"
import { assertCardPaymentAllowed } from "./service"

const account = { status: "active" as const }
const future = new Date("2030-01-01T00:00:00.000Z")
const now = new Date("2026-08-13T12:00:00.000Z")

function card(overrides: Record<string, unknown> = {}) {
  return {
    status: "active" as const,
    expiresAt: future,
    onlinePaymentsEnabled: true,
    contactlessEnabled: true,
    cashWithdrawalEnabled: true,
    perTransactionLimitCents: 10_000,
    dailyLimitCents: 20_000,
    monthlyLimitCents: 50_000,
    ...overrides,
  } as Parameters<typeof assertCardPaymentAllowed>[1]
}

function input(overrides: Record<string, unknown> = {}) {
  return { amountCents: 2_500, merchantName: "Marchand VTEX", channel: "online" as const, ...overrides }
}

describe("autorisation de paiement carte", () => {
  it("refuse une carte gelée ou expirée", () => {
    expect(() => assertCardPaymentAllowed(account, card({ status: "frozen" }), input(), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("gelée")
    expect(() => assertCardPaymentAllowed(account, card({ expiresAt: new Date("2026-08-12T00:00:00.000Z") }), input(), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("expirée")
  })

  it("refuse chaque canal désactivé", () => {
    expect(() => assertCardPaymentAllowed(account, card({ onlinePaymentsEnabled: false }), input({ channel: "online" }), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("ligne")
    expect(() => assertCardPaymentAllowed(account, card({ contactlessEnabled: false }), input({ channel: "contactless" }), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("sans contact")
    expect(() => assertCardPaymentAllowed(account, card({ cashWithdrawalEnabled: false }), input({ channel: "cash_withdrawal" }), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("retraits")
  })

  it("refuse les dépassements de plafond par opération, jour et mois", () => {
    expect(() => assertCardPaymentAllowed(account, card(), input({ amountCents: 10_001 }), { dailySpentCents: 0, monthlySpentCents: 0 }, now)).toThrow("par opération")
    expect(() => assertCardPaymentAllowed(account, card(), input({ amountCents: 2_000 }), { dailySpentCents: 18_500, monthlySpentCents: 0 }, now)).toThrow("quotidien")
    expect(() => assertCardPaymentAllowed(account, card(), input({ amountCents: 2_000 }), { dailySpentCents: 0, monthlySpentCents: 48_500 }, now)).toThrow("mensuel")
  })

  it("autorise un paiement conforme aux contrôles serveur", () => {
    expect(() => assertCardPaymentAllowed(account, card(), input(), { dailySpentCents: 5_000, monthlySpentCents: 15_000 }, now)).not.toThrow()
  })
})
