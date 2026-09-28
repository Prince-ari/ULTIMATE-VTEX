import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { makeUser } from "../../test/fixtures"
import { logAction, listLogs } from "./service"
import { ForbiddenError } from "../../auth/permissions"

/**
 * Les scénarios d’écriture du journal depuis un domaine produit sont
 * testés dans la suite de contrats de ce domaine. Ce fichier vérifie
 * uniquement le comportement générique du journal lui-même.
 */
describe("journal système", () => {
  it("une action journalisée apparaît dans la liste, pour un admin", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await logAction(db, admin.userId, "user.update", "user", target.userId, { field: "test" })

    const entries = await listLogs(db, admin.actor, { targetType: "user", limit: 20 })
    expect(entries.some((e) => e.action === "user.update" && e.targetId === target.userId)).toBe(true)
  })

  it("lecture strictement admin — même l'agent n'y a pas accès (Sprint 0 §3)", async () => {
    const agent = await makeUser({ role: "agent" })
    await expect(listLogs(db, agent.actor, {})).rejects.toThrow(ForbiddenError)
  })
})
