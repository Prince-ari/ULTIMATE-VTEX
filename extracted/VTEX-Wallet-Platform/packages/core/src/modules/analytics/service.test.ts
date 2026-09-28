import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { leads } from "../../db/schema"
import { makeUser } from "../../test/fixtures"
import { leadsFunnel } from "./service"
import { ForbiddenError } from "../../auth/permissions"

describe("analytics.leadsFunnel", () => {
  it("regroupe les leads par statut", async () => {
    const admin = await makeUser({ role: "admin" })
    await db.insert(leads).values({
      firstName: "Funnel",
      lastName: "Test",
      email: `funnel-${Date.now()}@test.local`,
      status: "new",
      notes: [],
    })

    const rows = await leadsFunnel(db, admin.actor)
    const newCount = rows.find((r) => r.status === "new")
    expect(newCount).toBeDefined()
    expect(newCount!.count).toBeGreaterThan(0)
  })

  it("réservé admin/agent", async () => {
    const u = await makeUser()
    await expect(leadsFunnel(db, u.actor)).rejects.toThrow(ForbiddenError)
  })
})
