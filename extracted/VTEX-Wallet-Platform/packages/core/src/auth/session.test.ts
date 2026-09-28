import { describe, expect, it } from "vitest"

import { db } from "../db/client"
import { sessions, users } from "../db/schema"
import { hashPassword } from "./password"
import { cleanupOldSessions, createSession } from "./session"
import { eq } from "drizzle-orm"

async function makeSessionTestUser() {
  const email = `session-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "Cleanup",
    lastName: "Test",
    email,
    passwordHash: hashPassword("testpass123"),
    role: "user",
    status: "active",
    kycVerified: true,
  })
  return inserted.insertId
}

describe("cleanupOldSessions", () => {
  it("supprime les sessions expirées", async () => {
    const userId = await makeSessionTestUser()
    const [inserted] = await db.insert(sessions).values({
      jti: `expired-${Date.now()}`,
      userId,
      expiresAt: new Date(Date.now() - 60_000), // expirée il y a 1 minute
    })

    await cleanupOldSessions(db)

    const [remaining] = await db.select().from(sessions).where(eq(sessions.id, inserted.insertId)).limit(1)
    expect(remaining).toBeUndefined()
  })

  it("supprime les sessions révoquées depuis plus de 30 jours", async () => {
    const userId = await makeSessionTestUser()
    const [inserted] = await db.insert(sessions).values({
      jti: `old-revoked-${Date.now()}`,
      userId,
      expiresAt: new Date(Date.now() + 60_000), // pas encore expirée
      revokedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // révoquée il y a 31 jours
    })

    await cleanupOldSessions(db)

    const [remaining] = await db.select().from(sessions).where(eq(sessions.id, inserted.insertId)).limit(1)
    expect(remaining).toBeUndefined()
  })

  it("garde les sessions actives (ni expirées, ni révoquées)", async () => {
    const userId = await makeSessionTestUser()
    const token = await createSession(db, userId, { device: "Test" })
    expect(token).toBeDefined()

    await cleanupOldSessions(db)

    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId))
    expect(rows).toHaveLength(1)
  })

  it("garde les sessions révoquées récemment (utile pour l'audit de sécurité)", async () => {
    const userId = await makeSessionTestUser()
    const [inserted] = await db.insert(sessions).values({
      jti: `recent-revoked-${Date.now()}`,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(), // révoquée à l'instant
    })

    await cleanupOldSessions(db)

    const [remaining] = await db.select().from(sessions).where(eq(sessions.id, inserted.insertId)).limit(1)
    expect(remaining).toBeDefined()
  })
})
