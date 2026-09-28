import { describe, expect, it } from "vitest"

import { appRouter } from "./index"

describe("routeur composé VTEX", () => {
  it("expose les branches transversales Core, Wallet et Wallet Pro attendues", () => {
    const branches = Object.keys(appRouter._def.record)

    expect(branches).toEqual([
      "auth",
      "users",
      "notifications",
      "leads",
      "analytics",
      "settings",
      "support",
      "journal",
      "documents",
      "config",
      "wallets",
      "bankAccounts",
      "cards",
      "beneficiaries",
      "transactions",
      "savingsGoals",
      "walletAdmin",
      "walletSettings",
      "topups",
      "businesses",
      "team",
      "wallet",
      "payouts",
      "customers",
      "paymentLinks",
      "publicPayments",
      "invoices",
      "estimates",
      "subscriptions",
      "products",
      "orders",
      "resolution",
      "developers",
      "businessTopups",
      "businessAdmin",
      "admin",
    ])
    expect(branches).not.toContain("goals")
  })

  it("compose la recharge par carte du wallet perso et du Wallet Pro sans collision de clés", () => {
    const procedures = Object.keys(appRouter._def.procedures)
    expect(procedures).toEqual(expect.arrayContaining(["topups.create", "businessTopups.create", "walletAdmin.refundTopup", "businessAdmin.refundTopup", "publicPayments.start", "publicPayments.confirm", "admin.paymentLinks.refund"]))
  })
})
