import { describe, expect, it } from "vitest"

import { MANAGER_HOME, assignableRoles, canManageTarget, canUseDashboard, isAdmin, isManagerPath, navVisible } from "./roles"

describe("rôles — aides d'affichage (le serveur reste l'autorité)", () => {
  it("le Dashboard s'ouvre pour super_admin, admin, support et gestionnaire de compte ; pas pour un titulaire", () => {
    expect(canUseDashboard("super_admin")).toBe(true)
    expect(canUseDashboard("admin")).toBe(true)
    expect(canUseDashboard("agent")).toBe(true)
    expect(canUseDashboard("account_manager")).toBe(true)
    expect(canUseDashboard("user")).toBe(false)
    expect(isAdmin("super_admin") && isAdmin("admin")).toBe(true)
    expect(isAdmin("agent") || isAdmin(undefined)).toBe(false)
  })

  it("un ADMIN n'attribue ni admin ni super_admin, ne modifie pas un administrateur, ni soi-même", () => {
    const admin = { id: 1, role: "admin" as const }
    expect(assignableRoles(admin, { id: 2, role: "user" })).toEqual(["agent", "account_manager"])
    expect(assignableRoles(admin, { id: 2, role: "agent" })).toEqual(["user", "account_manager"])
    expect(assignableRoles(admin, { id: 3, role: "admin" })).toEqual([])
    expect(assignableRoles(admin, { id: 1, role: "admin" })).toEqual([])
  })

  it("un SUPER_ADMIN attribue tous les rôles à un autre compte, jamais à lui-même", () => {
    const superAdmin = { id: 1, role: "super_admin" as const }
    expect(assignableRoles(superAdmin, { id: 2, role: "user" })).toEqual(["super_admin", "admin", "account_manager", "agent"])
    expect(assignableRoles(superAdmin, { id: 1, role: "super_admin" })).toEqual([])
  })

  it("support et gestionnaire n'attribuent rien", () => {
    expect(assignableRoles({ id: 1, role: "agent" }, { id: 2, role: "user" })).toEqual([])
    expect(assignableRoles({ id: 1, role: "account_manager" }, { id: 2, role: "user" })).toEqual([])
  })

  it("un compte privilégié n'est géré que par un SUPER_ADMIN", () => {
    expect(canManageTarget({ id: 1, role: "admin" }, { id: 2, role: "user" })).toBe(true)
    expect(canManageTarget({ id: 1, role: "admin" }, { id: 2, role: "admin" })).toBe(false)
    expect(canManageTarget({ id: 1, role: "super_admin" }, { id: 2, role: "admin" })).toBe(true)
    expect(canManageTarget({ id: 1, role: "admin" }, { id: 1, role: "admin" })).toBe(false)
    expect(canManageTarget({ id: 1, role: "agent" }, { id: 2, role: "user" })).toBe(false)
  })
  it("un gestionnaire de compte ne voit que son portefeuille et ses suggestions ; les autres rôles ne voient jamais le portefeuille", () => {
    expect(MANAGER_HOME).toBe("/portefeuille")
    expect(isManagerPath("/portefeuille")).toBe(true)
    expect(isManagerPath("/suggestions")).toBe(true)
    expect(isManagerPath("/documents")).toBe(true)
    expect(navVisible("account_manager", "/documents")).toBe(true)
    expect(isManagerPath("/documents-internes")).toBe(false)
    expect(isManagerPath("/portefeuille/12")).toBe(true)
    expect(isManagerPath("/utilisateurs")).toBe(false)
    expect(isManagerPath("/portefeuille-secret")).toBe(false)
    expect(navVisible("account_manager", "/portefeuille")).toBe(true)
    expect(navVisible("account_manager", "/banque")).toBe(false)
    expect(navVisible("account_manager", "/")).toBe(false)
    for (const role of ["super_admin", "admin", "agent", null] as const) {
      expect(navVisible(role, "/gestionnaires")).toBe(true)
      expect(navVisible(role, "/portefeuille")).toBe(false)
    }
  })
})
