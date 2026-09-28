import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { makeUser } from "../../test/fixtures"
import { createNotification, createSystemNotification, listMyNotifications, markRead, unreadCount } from "./service"
import { ForbiddenError, ValidationError } from "../../auth/permissions"

describe("notifications", () => {
  it("un agent ne peut PAS diffuser à tous (Sprint 0 §2)", async () => {
    const agent = await makeUser({ role: "agent" })
    await expect(
      createNotification(db, agent.actor, { targetUserId: null, title: "Test", body: "Corps" }),
    ).rejects.toThrow(ValidationError)
  })

  it("un agent peut envoyer une notification ciblée", async () => {
    const agent = await makeUser({ role: "agent" })
    const u = await makeUser()
    await expect(
      createNotification(db, agent.actor, { targetUserId: u.userId, title: "Test", body: "Corps" }),
    ).resolves.toBeDefined()
  })

  it("un utilisateur ne peut pas créer de notification", async () => {
    const u = await makeUser()
    await expect(
      createNotification(db, u.actor, { targetUserId: u.userId, title: "Test", body: "Corps" }),
    ).rejects.toThrow(ForbiddenError)
  })

  it("une diffusion à tous est visible par n'importe quel utilisateur, et markRead est idempotent", async () => {
    const admin = await makeUser({ role: "admin" })
    const u = await makeUser()
    await createNotification(db, admin.actor, { targetUserId: null, title: "Annonce", body: "Pour tous" })

    const before = await unreadCount(db, u.actor)
    expect(before).toBeGreaterThan(0)

    const mine = await listMyNotifications(db, u.actor)
    const target = mine.find((n) => n.title === "Annonce")!
    await markRead(db, u.actor, target.id)
    await markRead(db, u.actor, target.id) // idempotent, ne doit pas lever

    const after = await unreadCount(db, u.actor)
    expect(after).toBe(before - 1)
  })

  it("un service métier peut enregistrer une alerte ciblée pour un superviseur", async () => {
    const holder = await makeUser()
    const supervisor = await makeUser({ role: "admin" })
    await createSystemNotification(db, {
      targetUserId: supervisor.userId,
      createdBy: holder.userId,
      title: "Justificatif de virement reçu",
      body: "Un titulaire a transmis un justificatif.",
    })

    const mine = await listMyNotifications(db, supervisor.actor)
    expect(mine.some((notification) => notification.title === "Justificatif de virement reçu")).toBe(true)
  })
})
