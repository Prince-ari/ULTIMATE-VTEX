import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { db } from "../../db/client"
import { supportSessions } from "../../db/schema"
import { makeUser } from "../../test/fixtures"
import { assertOperatorAccess, endAccessSession, getMyActiveAccessSession, listAccessSessionsForHolder, startAccessSession } from "./accessSessions"

describe("accessSessions (base réelle) — Sprint 8", () => {
  it("un agent peut ouvrir une session en lecture seule, jamais opérateur (réservé ADMIN/SUPER_ADMIN)", async () => {
    const agent = await makeUser({ role: "agent" })
    const holder = await makeUser()
    const session = await startAccessSession(db, agent.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Titulaire signale un virement manquant" })
    expect(session).toMatchObject({ startedBy: agent.userId, walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", endedAt: null })

    await expect(
      startAccessSession(db, agent.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "operator", reason: "Je veux ajuster le solde" }),
    ).rejects.toThrow(/access_session\.start_operator/)
  })

  it("un simple titulaire (rôle user) ne peut ouvrir aucune session d'accès", async () => {
    const user = await makeUser()
    const holder = await makeUser()
    await expect(
      startAccessSession(db, user.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Curiosité" }),
    ).rejects.toThrow(/access_session\.start_readonly/)
  })

  it("un admin peut ouvrir une session opérateur", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    const session = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "operator", reason: "Dégel de carte demandé par le titulaire" })
    expect(session.mode).toBe("operator")
  })

  it("rejette un motif trop court", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    await expect(
      startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "trop court" }),
    ).rejects.toThrow(/motif/)
  })

  it("borne la durée entre 5 et 120 minutes", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    const tooShort = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Vérification rapide du solde", durationMinutes: 1 })
    const minutesShort = Math.round((tooShort.expiresAt.getTime() - tooShort.startedAt.getTime()) / 60_000)
    expect(minutesShort).toBe(5)

    const tooLong = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Vérification rapide du solde", durationMinutes: 999 })
    const minutesLong = Math.round((tooLong.expiresAt.getTime() - tooLong.startedAt.getTime()) / 60_000)
    expect(minutesLong).toBe(120)
  })

  it("une nouvelle session referme la précédente (superseded), jamais empilée", async () => {
    const admin = await makeUser({ role: "admin" })
    const holderA = await makeUser()
    const holderB = await makeUser()
    const first = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holderA.userId, mode: "read_only", reason: "Première consultation du titulaire A" })
    const second = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holderB.userId, mode: "read_only", reason: "Bascule vers le titulaire B" })

    const active = await getMyActiveAccessSession(db, admin.actor)
    expect(active?.id).toBe(second.id)

    const [closedFirst] = await db.select().from(supportSessions).where(eq(supportSessions.id, first.id)).limit(1)
    expect(closedFirst).toMatchObject({ endedReason: "superseded" })
  })

  it("getMyActiveAccessSession referme silencieusement une session expirée", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    const session = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Session qui va expirer tout de suite", durationMinutes: 5 })
    await db.update(supportSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(supportSessions.id, session.id))

    expect(await getMyActiveAccessSession(db, admin.actor)).toBeNull()
    const [row] = await db.select().from(supportSessions).where(eq(supportSessions.id, session.id)).limit(1)
    expect(row).toMatchObject({ endedReason: "expired" })
    expect(row?.endedAt).not.toBeNull()
  })

  it("endAccessSession : le titulaire de la session peut la terminer ; idempotent", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    const session = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Consultation terminée manuellement" })
    await endAccessSession(db, admin.actor, session.id)
    expect(await getMyActiveAccessSession(db, admin.actor)).toBeNull()
    await expect(endAccessSession(db, admin.actor, session.id)).resolves.toBeUndefined()
  })

  it("endAccessSession : un autre acteur sans access_session.manage_any ne peut pas terminer la session d'autrui", async () => {
    const admin = await makeUser({ role: "admin" })
    const agent = await makeUser({ role: "agent" })
    const holder = await makeUser()
    const session = await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Session ouverte par un admin" })
    await expect(endAccessSession(db, agent.actor, session.id)).rejects.toThrow(/access_session\.manage_any/)
  })

  it("assertOperatorAccess : sans session active, ne bloque jamais (comportement actuel inchangé)", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    await expect(assertOperatorAccess(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId })).resolves.toBeUndefined()
  })

  it("assertOperatorAccess : bloque une mutation quand la session active sur CE titulaire est en lecture seule", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Simple consultation du dossier" })
    await expect(assertOperatorAccess(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId })).rejects.toThrow(/lecture seule/)
  })

  it("assertOperatorAccess : laisse passer en mode opérateur", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "operator", reason: "Dépannage autorisé par le titulaire" })
    await expect(assertOperatorAccess(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId })).resolves.toBeUndefined()
  })

  it("assertOperatorAccess : une session en lecture seule sur un AUTRE titulaire n'affecte pas celui-ci", async () => {
    const admin = await makeUser({ role: "admin" })
    const holderWatched = await makeUser()
    const holderUnrelated = await makeUser()
    await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holderWatched.userId, mode: "read_only", reason: "Consultation du premier titulaire" })
    await expect(assertOperatorAccess(db, admin.actor, { walletType: "PERSONAL", holderId: holderUnrelated.userId })).resolves.toBeUndefined()
  })

  it("listAccessSessionsForHolder : réservé à audit.read (admin/super_admin), refusé à un agent", async () => {
    const admin = await makeUser({ role: "admin" })
    const agent = await makeUser({ role: "agent" })
    const holder = await makeUser()
    await startAccessSession(db, admin.actor, { walletType: "PERSONAL", holderId: holder.userId, mode: "read_only", reason: "Historique de consultation du titulaire" })
    const rows = await listAccessSessionsForHolder(db, admin.actor, "PERSONAL", holder.userId)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    await expect(listAccessSessionsForHolder(db, agent.actor, "PERSONAL", holder.userId)).rejects.toThrow(/audit\.read/)
  })
})
