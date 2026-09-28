import { describe, expect, it } from "vitest"

import { ForbiddenError, isAdminRole, isStaffRole, requireRole, type Role } from "./permissions"
import { PERMISSIONS, ROLE_PERMISSIONS, assertCanAssignRole, can, requirePermission } from "./rbac"

const ROLES: Role[] = ["super_admin", "admin", "account_manager", "agent", "user"]

describe("RBAC — matrice rôle → permissions", () => {
  it("SUPER_ADMIN possède toutes les permissions ; ADMIN toutes sauf celles du système et des comptes privilégiés", () => {
    for (const permission of PERMISSIONS) expect(can({ role: "super_admin" }, permission)).toBe(true)
    expect(can({ role: "admin" }, "users.create")).toBe(true)
    expect(can({ role: "admin" }, "wallets.manage")).toBe(true)
    expect(can({ role: "admin" }, "system.manage")).toBe(false)
    expect(can({ role: "admin" }, "staff.assign_privileged_role")).toBe(false)
  })

  it("SUPPORT (agent) lit les fiches et peut envoyer des suggestions, sans rien modifier ; user n'a aucun accès transverse", () => {
    expect(ROLE_PERMISSIONS.agent).toEqual(["users.read", "wallets.read", "companies.read", "cards.read", "banking.read", "paymentlinks.read", "apikeys.read", "managers.read", "suggestions.read", "suggestions.send", "documents.read"])
    for (const permission of PERMISSIONS) {
      if (!ROLE_PERMISSIONS.agent.includes(permission)) expect(can({ role: "agent" }, permission)).toBe(false)
      expect(can({ role: "user" }, permission)).toBe(false)
    }
  })

  it("ACCOUNT_MANAGER : aucun accès transverse, seulement son portefeuille et l'envoi de suggestions (le périmètre est vérifié par les services)", () => {
    expect(ROLE_PERMISSIONS.account_manager).toEqual(["suggestions.read", "suggestions.send", "portfolio.read", "documents.read", "documents.send"])
    for (const permission of PERMISSIONS) {
      if (!ROLE_PERMISSIONS.account_manager.includes(permission)) expect(can({ role: "account_manager" }, permission)).toBe(false)
    }
    for (const forbidden of ["users.read", "wallets.read", "banking.read", "cards.read", "managers.read", "managers.manage", "paymentlinks.read", "apikeys.read"] as const) expect(can({ role: "account_manager" }, forbidden)).toBe(false)
  })

  it("gestionnaires : SUPPORT lit la liste, ADMIN crée / désactive / attribue ; portefeuille réservé au GESTIONNAIRE", () => {
    expect(can({ role: "agent" }, "managers.read")).toBe(true)
    expect(can({ role: "agent" }, "managers.manage")).toBe(false)
    expect(can({ role: "admin" }, "managers.manage")).toBe(true)
    expect(can({ role: "super_admin" }, "managers.manage")).toBe(true)
    expect(can({ role: "account_manager" }, "portfolio.read")).toBe(true)
    expect(can({ role: "agent" }, "portfolio.read")).toBe(false)
    expect(can({ role: "user" }, "suggestions.send")).toBe(false)
  })

  it("données de carte en clair : saisie et révélation réservées au SUPER_ADMIN ; l'ADMIN et le SUPPORT ne voient que l'état masqué", () => {
    expect(can({ role: "super_admin" }, "cards.reveal")).toBe(true)
    expect(can({ role: "super_admin" }, "cards.vault.write")).toBe(true)
    for (const role of ["admin", "agent", "account_manager", "user"] as const) {
      expect(can({ role }, "cards.reveal")).toBe(false)
      expect(can({ role }, "cards.vault.write")).toBe(false)
    }
    expect(can({ role: "admin" }, "cards.read")).toBe(true)
    expect(can({ role: "agent" }, "cards.read")).toBe(true)
    // Statut, canaux, plafonds, réémission : ADMIN et SUPER_ADMIN ; le SUPPORT lit seulement.
    expect(can({ role: "admin" }, "cards.manage")).toBe(true)
    expect(can({ role: "super_admin" }, "cards.manage")).toBe(true)
    expect(can({ role: "agent" }, "cards.manage")).toBe(false)
    expect(can({ role: "account_manager" }, "cards.manage")).toBe(false)
  })

  it("banque : le SUPPORT lit les RIB masqués ; l'ADMIN les gère et voit l'IBAN complet (journalisé) ; les autres rôles n'ont rien", () => {
    expect(can({ role: "agent" }, "banking.read")).toBe(true)
    expect(can({ role: "agent" }, "banking.reveal")).toBe(false)
    expect(can({ role: "agent" }, "banking.manage")).toBe(false)
    for (const permission of ["banking.read", "banking.reveal", "banking.manage"] as const) {
      expect(can({ role: "admin" }, permission)).toBe(true)
      expect(can({ role: "super_admin" }, permission)).toBe(true)
      expect(can({ role: "account_manager" }, permission)).toBe(false)
      expect(can({ role: "user" }, permission)).toBe(false)
    }
  })

  it("liens de paiement : le SUPPORT les consulte, l'ADMIN les gère (désactivation, remboursement) ; les autres rôles n'ont rien", () => {
    expect(can({ role: "agent" }, "paymentlinks.read")).toBe(true)
    expect(can({ role: "agent" }, "paymentlinks.manage")).toBe(false)
    for (const permission of ["paymentlinks.read", "paymentlinks.manage"] as const) {
      expect(can({ role: "admin" }, permission)).toBe(true)
      expect(can({ role: "super_admin" }, permission)).toBe(true)
      expect(can({ role: "account_manager" }, permission)).toBe(false)
      expect(can({ role: "user" }, permission)).toBe(false)
    }
  })

  it("clés d'API : le SUPPORT les consulte, l'ADMIN peut les révoquer ; les autres rôles n'ont rien", () => {
    expect(can({ role: "agent" }, "apikeys.read")).toBe(true)
    expect(can({ role: "agent" }, "apikeys.manage")).toBe(false)
    for (const permission of ["apikeys.read", "apikeys.manage"] as const) {
      expect(can({ role: "admin" }, permission)).toBe(true)
      expect(can({ role: "super_admin" }, permission)).toBe(true)
      expect(can({ role: "account_manager" }, permission)).toBe(false)
      expect(can({ role: "user" }, permission)).toBe(false)
    }
  })

  it("documents : le SUPPORT lit ; le GESTIONNAIRE lit et envoie (dans son périmètre) ; seuls les administrateurs valident, refusent, archivent", () => {
    expect(can({ role: "agent" }, "documents.read")).toBe(true)
    expect(can({ role: "agent" }, "documents.send")).toBe(false)
    expect(can({ role: "account_manager" }, "documents.send")).toBe(true)
    for (const permission of ["documents.review", "documents.archive"] as const) {
      expect(can({ role: "admin" }, permission)).toBe(true)
      expect(can({ role: "super_admin" }, permission)).toBe(true)
      expect(can({ role: "agent" }, permission)).toBe(false)
      expect(can({ role: "account_manager" }, permission)).toBe(false)
      expect(can({ role: "user" }, permission)).toBe(false)
    }
    expect(can({ role: "user" }, "documents.read")).toBe(false)
  })
  it("requirePermission lève ForbiddenError avec la permission manquante", () => {
    expect(() => requirePermission({ role: "agent" }, "users.create")).toThrow(ForbiddenError)
    expect(() => requirePermission({ role: "agent" }, "users.create")).toThrow(/users\.create/)
    expect(() => requirePermission({ role: "admin" }, "users.create")).not.toThrow()
  })
})

describe("hiérarchie des rôles", () => {
  it("SUPER_ADMIN satisfait toute exigence « admin » ; aucun autre rôle n'hérite", () => {
    expect(() => requireRole({ id: 1, role: "super_admin" }, "admin")).not.toThrow()
    expect(() => requireRole({ id: 1, role: "super_admin" }, "admin", "agent")).not.toThrow()
    expect(() => requireRole({ id: 1, role: "admin" }, "super_admin")).toThrow(ForbiddenError)
    expect(() => requireRole({ id: 1, role: "account_manager" }, "admin", "agent")).toThrow(ForbiddenError)
    expect(() => requireRole({ id: 1, role: "agent" }, "admin")).toThrow(ForbiddenError)
    expect(() => requireRole({ id: 1, role: "user" }, "admin", "agent")).toThrow(ForbiddenError)
  })

  it("isAdminRole / isStaffRole", () => {
    expect(ROLES.filter(isAdminRole)).toEqual(["super_admin", "admin"])
    expect(ROLES.filter(isStaffRole)).toEqual(["super_admin", "admin", "account_manager", "agent"])
  })
})

describe("attribution des rôles — anti-escalade", () => {
  const superAdmin = { id: 1, role: "super_admin" as const }
  const admin = { id: 2, role: "admin" as const }

  it("personne ne change son propre rôle", () => {
    expect(() => assertCanAssignRole(superAdmin, { id: 1, role: "super_admin" }, "admin")).toThrow(/propre rôle/)
    expect(() => assertCanAssignRole(admin, { id: 2, role: "admin" }, "user")).toThrow(/propre rôle/)
  })

  it("ADMIN attribue user / agent / account_manager à des comptes non privilégiés, jamais admin ni super_admin", () => {
    expect(() => assertCanAssignRole(admin, { id: 9, role: "user" }, "agent")).not.toThrow()
    expect(() => assertCanAssignRole(admin, { id: 9, role: "agent" }, "account_manager")).not.toThrow()
    expect(() => assertCanAssignRole(admin, { id: 9, role: "user" }, "admin")).toThrow(ForbiddenError)
    expect(() => assertCanAssignRole(admin, { id: 9, role: "user" }, "super_admin")).toThrow(ForbiddenError)
    // Un ADMIN ne peut pas non plus rétrograder un administrateur.
    expect(() => assertCanAssignRole(admin, { id: 9, role: "admin" }, "user")).toThrow(ForbiddenError)
  })

  it("SUPER_ADMIN peut attribuer et retirer les rôles privilégiés (à un autre compte)", () => {
    expect(() => assertCanAssignRole(superAdmin, { id: 9, role: "user" }, "admin")).not.toThrow()
    expect(() => assertCanAssignRole(superAdmin, { id: 9, role: "admin" }, "super_admin")).not.toThrow()
    expect(() => assertCanAssignRole(superAdmin, { id: 9, role: "admin" }, "user")).not.toThrow()
  })

  it("SUPPORT et ACCOUNT_MANAGER n'attribuent aucun rôle", () => {
    expect(() => assertCanAssignRole({ id: 3, role: "agent" }, { id: 9, role: "user" }, "agent")).toThrow(ForbiddenError)
    expect(() => assertCanAssignRole({ id: 4, role: "account_manager" }, { id: 9, role: "user" }, "agent")).toThrow(ForbiddenError)
  })
})
