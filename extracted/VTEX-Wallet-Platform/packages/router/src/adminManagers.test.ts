import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db, hashPassword, logs, notifications, users, type Actor, type Role } from "@vtex/core"

import { createManagedUser } from "./admin"
import { appRouter } from "./index"

async function makeStaff(role: Role, label = "Staff"): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: label, lastName: suffix, email: `mgr-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}
const callerFor = (actor: Actor | null, ip = "10.7.0.1") => appRouter.createCaller({ actor, jti: actor ? "jti-mgr" : null, ip, requestId: `req-${randomUUID().slice(0, 6)}` })
const detailOf = (entry: { detail: unknown }) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail) as Record<string, unknown>

async function personal(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Cliente", lastName: suffix, email: `cliente-mgr-${suffix}@test.local`, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
  return { actor: { id: created.userId, role: "user" as const } satisfies Actor, holderId: created.userId, name: `Cliente ${suffix}` }
}
async function company(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Gérant", lastName: suffix, email: `gerant-mgr-${suffix}@test.local`, walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: `SARL Suivi ${suffix}`, brandName: `Suivi ${suffix}` } })
  return { owner: { id: created.userId, role: "user" as const } satisfies Actor, holderId: created.businessId!, accountId: created.businessAccountId!, name: `Suivi ${suffix}` }
}
/** Un gestionnaire créé par l'API d'administration, comme au Dashboard. */
async function newManager(admin: Actor, role: "account_manager" | "agent" = "account_manager") {
  const suffix = randomUUID().slice(0, 8)
  const created = await callerFor(admin).admin.managers.create({ firstName: "Gestion", lastName: suffix, email: `gestion-${suffix}@test.local`, role })
  return { actor: { id: created.id, role } as Actor, id: created.id, temporaryPassword: created.temporaryPassword, name: `Gestion ${suffix}`, email: `gestion-${suffix}@test.local` }
}

describe("admin.managers — création, droits, statut", () => {
  it("l'ADMIN crée un gestionnaire (mot de passe temporaire montré une fois, haché, changement obligatoire, audit sans secret) ; le SUPPORT lit seulement ; le gestionnaire n'a aucun accès", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const manager = await newManager(admin)
    expect(manager.temporaryPassword.length).toBeGreaterThanOrEqual(12)

    const [row] = await db.select().from(users).where(eq(users.id, manager.id))
    expect(row).toMatchObject({ role: "account_manager", status: "active", mustChangePassword: true })
    expect(row!.passwordHash).not.toContain(manager.temporaryPassword)
    expect(row!.tempPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 70 * 3_600_000)

    const trail = (await db.select().from(logs).where(and(eq(logs.targetType, "user"), eq(logs.targetId, manager.id)))).find((entry) => entry.action === "manager.create")!
    expect(trail).toMatchObject({ actorId: admin.id, actorRole: "admin" })
    expect(JSON.stringify(trail)).not.toContain(manager.temporaryPassword)

    await expect(callerFor(admin).admin.managers.create({ firstName: "Doublon", lastName: "Email", email: manager.email, role: "agent" })).rejects.toThrow(/déjà utilisé/)
    await expect(callerFor(admin).admin.managers.create({ firstName: "Trop", lastName: "Haut", email: `haut-${randomUUID().slice(0, 6)}@test.local`, role: "admin" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(callerFor(agent).admin.managers.create({ firstName: "Refusé", lastName: "Support", email: `refuse-${randomUUID().slice(0, 6)}@test.local`, role: "agent" })).rejects.toThrow(/Permission requise/)

    const listed = await callerFor(agent).admin.managers.list({ search: manager.email })
    expect(listed).toEqual([expect.objectContaining({ id: manager.id, role: "account_manager", status: "active", walletCount: 0, mustChangePassword: true })])
    expect(JSON.stringify(listed)).not.toMatch(/passwordHash|password_hash/)
    await expect(callerFor(manager.actor).admin.managers.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(null).admin.managers.list()).rejects.toThrow(/Authentification/)
    await expect(callerFor(agent).admin.managers.holders({ query: "x" })).rejects.toThrow(/Permission requise/)
  })

  it("suspendre exige un motif, coupe les sessions, interdit toute attribution ; réactiver la rétablit ; jamais soi-même, jamais un compte hors gestionnaires", async () => {
    const admin = await makeStaff("admin")
    const other = await makeStaff("admin")
    const manager = await newManager(admin)
    const client = await personal(admin)

    await expect(callerFor(admin).admin.managers.setStatus({ id: manager.id, status: "suspended", reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const suspended = await callerFor(admin).admin.managers.setStatus({ id: manager.id, status: "suspended", reason: "Départ du gestionnaire de l'équipe" })
    expect(suspended.status).toBe("suspended")
    await expect(callerFor(admin).admin.managers.setStatus({ id: manager.id, status: "suspended", reason: "Déjà suspendu ce compte" })).rejects.toThrow(/déjà suspendu/)
    await expect(callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId })).rejects.toThrow(/suspendu/)
    const active = await callerFor(admin).admin.managers.setStatus({ id: manager.id, status: "active", reason: "Retour du gestionnaire dans l'équipe" })
    expect(active.status).toBe("active")

    await expect(callerFor(admin).admin.managers.setStatus({ id: other.id, status: "suspended", reason: "Tentative sur un administrateur" })).rejects.toThrow(/introuvable/)
    await expect(callerFor(admin).admin.managers.setStatus({ id: client.holderId, status: "suspended", reason: "Tentative sur un titulaire" })).rejects.toThrow(/introuvable/)
    const trail = (await db.select().from(logs).where(and(eq(logs.targetType, "user"), eq(logs.targetId, manager.id)))).map((entry) => entry.action)
    expect(trail).toEqual(expect.arrayContaining(["manager.suspend", "manager.reactivate"]))
  })
})

describe("admin.managers — attributions de wallets", () => {
  it("attribuer / retirer (idempotent), journalisé sur le wallet, gestionnaire notifié, visible sur la fiche du wallet et dans la liste", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const manager = await newManager(admin)
    const client = await personal(admin)
    const shop = await company(admin)
    const caller = callerFor(admin)

    const first = await caller.admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId, reason: "Client suivi de près" })
    expect(first.created).toBe(true)
    expect((await caller.admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId })).created).toBe(false)
    await caller.admin.managers.assign({ managerId: manager.id, walletType: "PROFESSIONAL", holderId: shop.holderId })
    await expect(caller.admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: 999_999_999 })).rejects.toThrow(/introuvable/)
    await expect(caller.admin.managers.assign({ managerId: 999_999_999, walletType: "PERSONAL", holderId: client.holderId })).rejects.toThrow(/introuvable/)
    await expect(caller.admin.managers.assign({ managerId: client.holderId, walletType: "PERSONAL", holderId: client.holderId })).rejects.toThrow(/introuvable/)

    expect(first.wallets.map((wallet) => wallet.name)).toContain(client.name)
    const detail = await caller.admin.managers.get({ id: manager.id })
    expect(detail.wallets).toHaveLength(2)
    expect(detail.wallets.find((wallet) => wallet.walletType === "PROFESSIONAL")).toMatchObject({ name: shop.name, holderId: shop.holderId })
    expect((await callerFor(agent).admin.managers.list({ search: manager.email }))[0]).toMatchObject({ walletCount: 2 })
    expect(await callerFor(agent).admin.managers.forWallet({ walletType: "PERSONAL", holderId: client.holderId })).toEqual([expect.objectContaining({ id: manager.id, name: manager.name, role: "account_manager" })])

    const assignLog = (await db.select().from(logs).where(and(eq(logs.action, "manager.assign"), eq(logs.walletType, "PERSONAL"), eq(logs.holderId, client.holderId))))
    expect(assignLog).toHaveLength(1)
    expect(assignLog[0]).toMatchObject({ actorId: admin.id, targetId: manager.id })
    expect(detailOf(assignLog[0]!)).toMatchObject({ reason: "Client suivi de près", holderName: client.name })
    const told = await db.select().from(notifications).where(and(eq(notifications.targetUserId, manager.id), eq(notifications.title, "Nouveau wallet attribué")))
    expect(told).toHaveLength(2)

    const removed = await caller.admin.managers.unassign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId, reason: "Suivi transféré à un collègue" })
    expect(removed.removed).toBe(true)
    expect(removed.wallets).toHaveLength(1)
    expect((await caller.admin.managers.unassign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId })).removed).toBe(false)
    expect(await callerFor(agent).admin.managers.forWallet({ walletType: "PERSONAL", holderId: client.holderId })).toEqual([])
    expect((await db.select().from(logs).where(and(eq(logs.action, "manager.unassign"), eq(logs.holderId, client.holderId)))).length).toBe(1)

    await expect(callerFor(agent).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId })).rejects.toThrow(/Permission requise/)
    const candidates = await caller.admin.managers.holders({ query: shop.name })
    expect(candidates).toEqual([expect.objectContaining({ walletType: "PROFESSIONAL", holderId: shop.holderId, name: shop.name })])
  })
})

describe("admin.portfolio — le périmètre du gestionnaire de compte", () => {
  it("il ne lit QUE ses wallets attribués : liste, fiche (lecture seule, sans secret), refus immédiat après retrait, aucun accès transverse", async () => {
    const admin = await makeStaff("admin")
    const manager = await newManager(admin)
    const rival = await newManager(admin)
    const client = await personal(admin)
    const shop = await company(admin)
    const stranger = await personal(admin)
    await callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: client.holderId })
    await callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PROFESSIONAL", holderId: shop.holderId })
    await callerFor(admin).admin.managers.assign({ managerId: rival.id, walletType: "PERSONAL", holderId: stranger.holderId })
    await callerFor(admin).businessAdmin.adjustBalance({ businessId: shop.holderId, accountId: shop.accountId, deltaCents: 4_200, reason: "Provision de test du portefeuille" })

    const mine = await callerFor(manager.actor).admin.portfolio.list()
    expect(mine.map((wallet) => wallet.name).sort()).toEqual([client.name, shop.name].sort())
    expect(mine.find((wallet) => wallet.walletType === "PROFESSIONAL")).toMatchObject({ balances: [{ currency: "EUR", availableCents: 4_200 }] })

    const sheet = await callerFor(manager.actor).admin.portfolio.wallet({ walletType: "PROFESSIONAL", holderId: shop.holderId })
    expect(sheet.holder).toMatchObject({ name: shop.name, walletType: "PROFESSIONAL" })
    expect(sheet.accounts[0]).toMatchObject({ currency: "EUR", availableCents: 4_200 })
    expect(sheet.recentTransactions[0]).toMatchObject({ type: "adjustment", direction: "credit", amountCents: 4_200 })
    expect(sheet.managers).toEqual([expect.objectContaining({ id: manager.id, isMe: true })])
    expect(JSON.stringify(sheet)).not.toMatch(/iban|passwordHash|pinHash|tokenReference|keyHash|email/i)
    const view = (await db.select().from(logs).where(and(eq(logs.action, "portfolio.view"), eq(logs.holderId, shop.holderId))))[0]!
    expect(view).toMatchObject({ actorId: manager.id, actorRole: "account_manager", walletType: "PROFESSIONAL" })

    // Wallet d'un autre gestionnaire, identifiant deviné : refusé, sans révéler s'il existe.
    await expect(callerFor(manager.actor).admin.portfolio.wallet({ walletType: "PERSONAL", holderId: stranger.holderId })).rejects.toThrow(/ne fait pas partie de votre portefeuille/)
    await expect(callerFor(manager.actor).admin.portfolio.wallet({ walletType: "PERSONAL", holderId: 999_999_999 })).rejects.toThrow(/ne fait pas partie de votre portefeuille/)

    await callerFor(admin).admin.managers.unassign({ managerId: manager.id, walletType: "PROFESSIONAL", holderId: shop.holderId })
    await expect(callerFor(manager.actor).admin.portfolio.wallet({ walletType: "PROFESSIONAL", holderId: shop.holderId })).rejects.toThrow(/ne fait pas partie de votre portefeuille/)
    expect((await callerFor(manager.actor).admin.portfolio.list()).map((wallet) => wallet.name)).toEqual([client.name])

    // Aucun accès transverse : ni fiches, ni banque, ni cartes, ni gestionnaires, ni liens, ni clés.
    const denied = callerFor(manager.actor).admin
    await expect(denied.users.list()).rejects.toThrow(/Permission requise/)
    await expect(denied.banking.list()).rejects.toThrow(/Permission requise/)
    await expect(denied.cards.list()).rejects.toThrow(/Permission requise/)
    await expect(denied.managers.list()).rejects.toThrow(/Permission requise/)
    await expect(denied.paymentLinks.list()).rejects.toThrow(/Permission requise/)
    await expect(denied.apiKeys.list()).rejects.toThrow(/Permission requise/)
    // Et les autres rôles n'ont pas de portefeuille.
    const agent = await makeStaff("agent")
    await expect(callerFor(agent).admin.portfolio.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(client.actor).admin.portfolio.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(null).admin.portfolio.list()).rejects.toThrow(/Authentification/)
  })
})

describe("admin.suggestions — envoi, périmètre, réception", () => {
  it("le SUPPORT écrit à un wallet personnel et à une entreprise : une remise par destinataire, l'auteur n'est identifié que par prénom et rôle, lecture propre à chacun", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent", "Support")
    const client = await personal(admin)
    const shop = await company(admin)
    const token = `ref-${randomUUID().slice(0, 8)}`

    const result = await callerFor(agent).admin.suggestions.send({ wallets: [{ walletType: "PERSONAL", holderId: client.holderId }, { walletType: "PROFESSIONAL", holderId: shop.holderId }, { walletType: "PERSONAL", holderId: client.holderId }], title: "Complétez votre profil", body: `Ajoutez un justificatif pour lever vos plafonds. Réf ${token}` })
    expect(result).toMatchObject({ sent: 2, wallets: 2, skipped: [] })

    const inbox = await callerFor(client.actor).notifications.listMine()
    const suggestion = inbox.find((item) => item.kind === "suggestion")!
    expect(suggestion).toMatchObject({ title: "Complétez votre profil", isRead: false, walletType: "PERSONAL", holderId: client.holderId, sender: { firstName: "Support", role: "agent" } })
    expect(JSON.stringify(suggestion)).not.toMatch(/email|@test\.local/)
    expect((await callerFor(shop.owner).notifications.listMine()).filter((item) => item.kind === "suggestion")).toHaveLength(1)
    expect(await callerFor(client.actor).notifications.unreadCount()).toBeGreaterThanOrEqual(1)

    const before = await callerFor(agent).admin.suggestions.list({ status: "unread", search: token })
    expect(before.length).toBe(2)
    await callerFor(client.actor).notifications.markRead({ notificationId: suggestion.id })
    const afterRead = await callerFor(agent).admin.suggestions.list({ search: token })
    expect(afterRead.find((row) => row.id === suggestion.id)).toMatchObject({ read: true, recipient: { id: client.holderId }, holder: { name: client.name } })
    expect(afterRead.find((row) => row.id !== suggestion.id)?.read).toBe(false)
    expect((await callerFor(agent).admin.suggestions.list({ status: "read", search: token })).map((row) => row.id)).toEqual([suggestion.id])

    const trail = await db.select().from(logs).where(and(eq(logs.action, "suggestion.send"), eq(logs.holderId, client.holderId)))
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ actorId: agent.id, actorRole: "agent", walletType: "PERSONAL" })
    expect(JSON.stringify(trail)).not.toContain("justificatif")

    // Les notifications classiques ne contiennent pas les suggestions ; un titulaire ne peut pas marquer lu le message d'un autre.
    expect((await callerFor(admin).notifications.list()).some((item) => item.kind === "suggestion")).toBe(false)
    const other = await personal(admin)
    await callerFor(other.actor).notifications.markRead({ notificationId: (await callerFor(shop.owner).notifications.listMine()).find((item) => item.kind === "suggestion")!.id })
    expect((await callerFor(agent).admin.suggestions.list({ search: token, status: "unread" })).length).toBe(1)
  })

  it("le GESTIONNAIRE n'écrit qu'aux wallets qui lui sont attribués : un seul refus annule tout l'envoi ; il ne lit que ses propres envois", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const manager = await newManager(admin)
    const mine = await personal(admin)
    const notMine = await personal(admin)
    await callerFor(admin).admin.managers.assign({ managerId: manager.id, walletType: "PERSONAL", holderId: mine.holderId })

    const before = await db.select().from(notifications).where(eq(notifications.createdBy, manager.id))
    await expect(callerFor(manager.actor).admin.suggestions.send({ wallets: [{ walletType: "PERSONAL", holderId: mine.holderId }, { walletType: "PERSONAL", holderId: notMine.holderId }], title: "Bonjour", body: "Message partiel interdit." })).rejects.toThrow(/ne fait pas partie de votre portefeuille/)
    expect((await db.select().from(notifications).where(eq(notifications.createdBy, manager.id))).length).toBe(before.length)
    expect((await callerFor(notMine.actor).notifications.listMine()).some((item) => item.kind === "suggestion")).toBe(false)

    const ok = await callerFor(manager.actor).admin.suggestions.send({ wallets: [{ walletType: "PERSONAL", holderId: mine.holderId }], title: "Votre point mensuel", body: "Souhaitez-vous planifier un échange cette semaine ?" })
    expect(ok.sent).toBe(1)
    expect((await callerFor(mine.actor).notifications.listMine()).find((item) => item.kind === "suggestion")).toMatchObject({ sender: { role: "account_manager" } })

    await callerFor(agent).admin.suggestions.send({ wallets: [{ walletType: "PERSONAL", holderId: notMine.holderId }], title: "Message du support", body: "Un message du support." })
    const seenByManager = await callerFor(manager.actor).admin.suggestions.list()
    expect(seenByManager.every((row) => row.sender?.id === manager.id)).toBe(true)
    expect(seenByManager.length).toBeGreaterThan(0)
    expect((await callerFor(agent).admin.suggestions.list()).length).toBeGreaterThan(seenByManager.length - 1)

    const targets = await callerFor(manager.actor).admin.suggestions.targets({ query: "" })
    expect(targets.map((target) => target.holderId)).toEqual([mine.holderId])
    expect((await callerFor(agent).admin.suggestions.targets({ query: mine.name })).some((target) => target.holderId === mine.holderId)).toBe(true)
  })

  it("validation : titre et message bornés, 50 wallets au plus, wallet inconnu, titulaire suspendu ignoré (signalé), rôles sans droit refusés", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const active = await personal(admin)
    const suspended = await personal(admin)
    await callerFor(admin).users.suspend({ id: suspended.holderId })
    const wallet = { walletType: "PERSONAL" as const, holderId: active.holderId }
    const send = (input: Partial<Parameters<ReturnType<typeof callerFor>["admin"]["suggestions"]["send"]>[0]>) => callerFor(agent).admin.suggestions.send({ wallets: [wallet], title: "Titre valide", body: "Message valide.", ...input })

    await expect(send({ title: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ body: "y".repeat(501) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: Array.from({ length: 51 }, (_, index) => ({ walletType: "PERSONAL" as const, holderId: index + 1 })) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ wallets: [{ walletType: "PERSONAL", holderId: 999_999_999 }] })).rejects.toThrow(/introuvable/)

    const mixed = await send({ wallets: [wallet, { walletType: "PERSONAL", holderId: suspended.holderId }] })
    expect(mixed).toMatchObject({ sent: 1, wallets: 1, skipped: [expect.objectContaining({ holderId: suspended.holderId, reason: "Aucun destinataire actif" })] })

    await expect(callerFor(active.actor).admin.suggestions.send({ wallets: [wallet], title: "Titre valide", body: "Un titulaire n'écrit pas." })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(active.actor).admin.suggestions.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(null).admin.suggestions.list()).rejects.toThrow(/Authentification/)
  })
})
