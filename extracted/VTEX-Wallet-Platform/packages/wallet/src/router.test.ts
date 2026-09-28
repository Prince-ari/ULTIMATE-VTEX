import { describe, expect, it } from "vitest"
import { walletRouter } from "./router"

describe("contrat du routeur Wallet", () => {
  it("expose les domaines utilisateurs et administratifs attendus", () => {
    expect(Object.keys(walletRouter._def.record).sort()).toEqual([
      "bankAccounts",
      "beneficiaries",
      "cards",
      "savingsGoals",
      "topups",
      "transactions",
      "walletAdmin",
      "walletSettings",
      "wallets",
    ])
  })

  it("expose la recharge par carte et son pilotage administrateur", () => {
    const procedures = Object.keys(walletRouter._def.procedures)
    expect(procedures).toEqual(expect.arrayContaining([
      "topups.config",
      "topups.create",
      "topups.confirm",
      "topups.listMine",
      "topups.simPay",
      "topups.simAuthenticate",
      "walletAdmin.stripeStatus",
      "walletAdmin.topups",
      "walletAdmin.reconcileTopup",
      "walletAdmin.cancelTopup",
      "walletAdmin.refundTopup",
    ]))
  })

  it("expose les opérations d’épargne et l’autorisation carte sécurisée", () => {
    const procedures = Object.keys(walletRouter._def.procedures)
    expect(procedures).toEqual(expect.arrayContaining([
      "savingsGoals.listMine",
      "savingsGoals.create",
      "savingsGoals.fund",
      "savingsGoals.update",
      "savingsGoals.close",
      "cards.authorizePayment",
    ]))
  })

  it("expose les commandes administratives de cycle de vie et le détail consolidé", () => {
    const procedures = Object.keys(walletRouter._def.procedures)
    expect(procedures).toEqual(expect.arrayContaining([
      "walletAdmin.detail",
      "walletAdmin.createWallet",
      "walletAdmin.updateWalletStatus",
      "walletAdmin.cancelCard",
      "walletAdmin.createBeneficiary",
      "walletAdmin.reconciliation",
      "walletAdmin.emergencyLockdown",
    ]))
  })
})

describe("préférences serveur du wallet", () => {
  it("expose la devise d'affichage au titulaire et à l'administration", () => {
    const procedures = Object.keys(walletRouter._def.procedures)
    expect(procedures).toEqual(expect.arrayContaining(["walletSettings.mine", "walletSettings.updateMine", "walletSettings.adminGet", "walletSettings.adminUpdate"]))
  })
})