import { ForbiddenError, requireRole, requireSelfOrRole } from "@vtex/core"
import { describe, expect, it } from "vitest"

describe("contrôles RBAC Wallet", () => {
  it("autorise un utilisateur à accéder uniquement à son propre compte", () => {
    expect(() => requireSelfOrRole({ id: 41, role: "user" }, 41, "admin", "agent")).not.toThrow()
    expect(() => requireSelfOrRole({ id: 41, role: "user" }, 42, "admin", "agent")).toThrow(ForbiddenError)
  })

  it("réserve les opérations de pilotage aux rôles opérationnels", () => {
    expect(() => requireRole({ id: 1, role: "admin" }, "admin")).not.toThrow()
    expect(() => requireRole({ id: 2, role: "agent" }, "admin", "agent")).not.toThrow()
    expect(() => requireRole({ id: 3, role: "user" }, "admin", "agent")).toThrow(ForbiddenError)
  })
})
