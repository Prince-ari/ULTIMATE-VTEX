import { describe, expect, it } from "vitest"
import { desc, eq } from "drizzle-orm"

import { db } from "../../db/client"
import { logs } from "../../db/schema"
import { runWithRequestContext, currentRequestContext } from "../../api/requestContext"
import { makeUser } from "../../test/fixtures"
import { listLogsForHolder, logAction } from "./service"

async function lastLogFor(targetId: number, action: string) {
  const [row] = await db.select().from(logs).where(eq(logs.targetId, targetId)).orderBy(desc(logs.id)).limit(1)
  expect(row?.action).toBe(action)
  return row!
}

describe("journal — contexte d'audit automatique", () => {
  it("renseigne rôle, session, IP et identifiant de requête sans que l'appelant les passe", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await runWithRequestContext(
      { requestId: "req-abc", actorId: admin.userId, actorRole: "admin", sessionJti: "jti-123", ip: "203.0.113.7", supportSessionId: null },
      () => logAction(db, admin.userId, "test.context", "user", target.userId, { note: "x" }),
    )
    const row = await lastLogFor(target.userId, "test.context")
    expect(row).toMatchObject({ actorId: admin.userId, actorRole: "admin", sessionJti: "jti-123", ip: "203.0.113.7", requestId: "req-abc", supportSessionId: null })
  })

  it("rattache l'événement à une session support quand elle est ouverte (Sprint 8) — jamais confondu avec l'utilisateur", async () => {
    const admin = await makeUser({ role: "admin" })
    const target = await makeUser()
    await runWithRequestContext(
      { requestId: "req-sup", actorId: admin.userId, actorRole: "admin", sessionJti: "jti-sup", ip: "198.51.100.4", supportSessionId: 42 },
      () => logAction(db, admin.userId, "test.support", "user", target.userId, undefined, { walletType: "PERSONAL", holderId: target.userId }),
    )
    const row = await lastLogFor(target.userId, "test.support")
    expect(row.supportSessionId).toBe(42)
    expect(row).toMatchObject({ walletType: "PERSONAL", holderId: target.userId })
  })

  it("n'attache ni rôle ni session lorsque l'acteur journalisé n'est pas l'acteur authentifié de la requête", async () => {
    const admin = await makeUser({ role: "admin" })
    const newcomer = await makeUser()
    await runWithRequestContext(
      { requestId: "req-other", actorId: admin.userId, actorRole: "admin", sessionJti: "jti-admin", ip: "192.0.2.10", supportSessionId: 7 },
      () => logAction(db, newcomer.userId, "test.other_actor", "user", newcomer.userId),
    )
    const row = await lastLogFor(newcomer.userId, "test.other_actor")
    expect(row).toMatchObject({ actorId: newcomer.userId, actorRole: null, sessionJti: null, supportSessionId: null, requestId: "req-other", ip: "192.0.2.10" })
  })

  it("hors requête (job, script), les colonnes de contexte restent nulles", async () => {
    expect(currentRequestContext()).toBeUndefined()
    const target = await makeUser()
    await logAction(db, null, "test.system", "user", target.userId)
    const row = await lastLogFor(target.userId, "test.system")
    expect(row).toMatchObject({ actorId: null, actorRole: null, sessionJti: null, ip: null, requestId: null })
  })

  it("le contexte survit aux await et reste isolé entre requêtes concurrentes", async () => {
    const a = await makeUser({ role: "admin" })
    const b = await makeUser({ role: "admin" })
    const target = await makeUser()
    await Promise.all([
      runWithRequestContext({ requestId: "req-A", actorId: a.userId, actorRole: "admin", sessionJti: "jA", ip: "10.0.0.1", supportSessionId: null }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 15))
        await logAction(db, a.userId, "test.concurrent_a", "user", target.userId)
      }),
      runWithRequestContext({ requestId: "req-B", actorId: b.userId, actorRole: "admin", sessionJti: "jB", ip: "10.0.0.2", supportSessionId: null }, async () => {
        await logAction(db, b.userId, "test.concurrent_b", "user", target.userId)
      }),
    ])
    const rows = await db.select().from(logs).where(eq(logs.targetId, target.userId))
    expect(rows.find((row) => row.action === "test.concurrent_a")).toMatchObject({ requestId: "req-A", sessionJti: "jA", ip: "10.0.0.1" })
    expect(rows.find((row) => row.action === "test.concurrent_b")).toMatchObject({ requestId: "req-B", sessionJti: "jB", ip: "10.0.0.2" })
  })

  it("listLogsForHolder : réservé à audit.read, filtré sur le titulaire", async () => {
    const admin = await makeUser({ role: "admin" })
    const agent = await makeUser({ role: "agent" })
    const holder = await makeUser()
    await logAction(db, admin.userId, "test.holder", "user", holder.userId, undefined, { walletType: "PERSONAL", holderId: holder.userId })
    await logAction(db, admin.userId, "test.elsewhere", "user", holder.userId, undefined, { walletType: "PROFESSIONAL", holderId: holder.userId })
    const rows = await listLogsForHolder(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId })
    expect(rows.map((row) => row.action)).toEqual(["test.holder"])
    await expect(listLogsForHolder(db, agent.actor, { walletType: "PERSONAL", holderId: holder.userId })).rejects.toThrow(/audit\.read/)
  })
})
