import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { cardVault, db, hashPassword, logs, users, type Actor, type Role } from "@vtex/core"
import { businessCards, businessMembers, businessWalletAccounts } from "@vtex/business"
import { cards, walletAccounts } from "@vtex/wallet"

import { createManagedUser } from "./admin"
import { expiryFromMonthYear, expiryParts } from "./adminCards"
import { appRouter } from "./index"

const SAVED_KEY = process.env.VTEX_VAULT_KEY

beforeAll(() => { process.env.VTEX_VAULT_KEY = randomBytes(32).toString("base64") })
afterAll(() => { if (SAVED_KEY === undefined) delete process.env.VTEX_VAULT_KEY; else process.env.VTEX_VAULT_KEY = SAVED_KEY })

/**
 * Numéro de test valide (clé de Luhn) et UNIQUE : la base de test persiste entre les exécutions et le coffre refuse deux cartes
 * de même numéro — des constantes feraient échouer la seconde exécution. Jamais une vraie carte.
 */
function freshPan(prefix: string, length = 16): string {
  let body = prefix
  while (body.length < length - 1) body += String(randomInt(0, 10))
  let sum = 0
  let double = true
  for (let index = body.length - 1; index >= 0; index -= 1) {
    let digit = Number(body[index])
    if (double) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
    double = !double
  }
  return `${body}${(10 - (sum % 10)) % 10}`
}
const visa = () => freshPan("4")
const mastercard = () => freshPan("55")

async function makeStaff(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Staff", lastName: suffix, email: `cards-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}

const callerFor = (actor: Actor) => appRouter.createCaller({ actor, jti: "jti-test", ip: "127.0.0.1", requestId: `req-${randomUUID().slice(0, 6)}` })

async function personalCard(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Porteur", lastName: suffix, email: `porteur-${suffix}@test.local`, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
  const [account] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, created.userId))
  const [card] = await db.select().from(cards).where(eq(cards.walletAccountId, account!.id))
  return { userId: created.userId, card: card!, accountId: account!.id }
}

async function professionalCard(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Gérant", lastName: suffix, email: `gerant-${suffix}@test.local`, walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: `SARL ${suffix}`, brandName: `Marque ${suffix}` } })
  const [inserted] = await db.insert(businessCards).values({ businessWalletAccountId: created.businessAccountId!, cardholderName: "Gérant Pro", lastFour: "0001", network: "visa", theme: "teal", tokenReference: randomBytes(16).toString("hex"), expiresAt: new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000) })
  const [card] = await db.select().from(businessCards).where(eq(businessCards.id, inserted.insertId))
  return { businessId: created.businessId!, card: card! }
}

const nextYear = new Date().getUTCFullYear() + 3

async function auditRowsFor(cardId: number, targetType: "card" | "business_card") {
  return db.select().from(logs).where(and(eq(logs.targetType, targetType), eq(logs.targetId, cardId)))
}

/** MariaDB renvoie une colonne JSON sous forme de texte (MySQL, déjà analysée). */
const detailOf = (entry: { detail: unknown }) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail) as Record<string, unknown>

/**
 * Aucune fuite : le NUMÉRO n'apparaît nulle part et aucune clé pan / cvv / pin n'existe dans la donnée. Un CVV ou un PIN (3-4 chiffres)
 * se retrouverait par hasard dans un horodatage ou un identifiant : on ne le cherche donc pas comme sous-chaîne.
 */
const hasSecretKey = (value: unknown): boolean => value !== null && typeof value === "object" && Object.entries(value as Record<string, unknown>).some(([key, inner]) => ["pan", "cvv", "pin"].includes(key) || hasSecretKey(inner))
const noneOf = (text: string, secrets: string[]) => {
  for (const secret of secrets.filter((value) => value.length >= 12)) expect(text).not.toContain(secret)
  expect(hasSecretKey(JSON.parse(text))).toBe(false)
}

describe("admin.cards — permissions", () => {
  it("le SUPPORT et l'ADMIN listent les cartes (état masqué) mais ne saisissent ni ne révèlent rien ; le SUPER_ADMIN peut tout", async () => {
    const superAdmin = await makeStaff("super_admin")
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }

    for (const staff of [agent, admin]) {
      expect(Array.isArray(await callerFor(staff).admin.cards.list({ search: String(owner.card.lastFour) }))).toBe(true)
      await expect(callerFor(staff).admin.cards.reveal(ref)).rejects.toThrow(/Permission requise/)
      await expect(callerFor(staff).admin.cards.setData({ ...ref, pan: visa() })).rejects.toThrow(/Permission requise/)
      await expect(callerFor(staff).admin.cards.clearData(ref)).rejects.toThrow(/Permission requise/)
    }
    const holder = await makeStaff("user")
    await expect(callerFor(holder).admin.cards.list()).rejects.toThrow(/Permission requise/)
    await expect(callerFor(holder).admin.cards.reveal(ref)).rejects.toThrow(/Permission requise/)
    await expect(callerFor({ id: 1, role: "account_manager" }).admin.cards.list()).rejects.toThrow(/Permission requise/)

    await expect(callerFor(superAdmin).admin.cards.setData({ ...ref, pan: visa(), cvv: "123", pin: "4321", expiryMonth: 12, expiryYear: nextYear })).resolves.toBeTruthy()
  })
})

describe("admin.cards — saisie, lecture masquée, révélation (carte personnelle)", () => {
  it("chiffre au repos, garde la carte cohérente, ne renvoie aucun secret hors révélation et journalise sans valeur", async () => {
    const superAdmin = await makeStaff("super_admin")
    const admin = await makeStaff("admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    const pan = visa()
    const secrets = [pan, "737", "2468"]

    const spaced = pan.replace(/(\d{4})(?=\d)/g, "$1 ")
    const saved = await caller.admin.cards.setData({ ...ref, pan: spaced, cvv: "737", pin: "2468", expiryMonth: 7, expiryYear: nextYear, cardholderName: "PORTEUR TEST" })
    expect(saved.vault).toMatchObject({ configured: true, hasPan: true, hasCvv: true, hasPin: true, revealCount: 0 })
    // La ligne de carte reste cohérente avec ce qui a été saisi.
    expect(saved).toMatchObject({ lastFour: pan.slice(-4), cardholderName: "PORTEUR TEST", network: "visa" })
    expect(expiryParts(new Date(saved.expiresAt))).toEqual({ month: 7, year: nextYear })
    const [row] = await db.select().from(cards).where(eq(cards.id, owner.card.id))
    expect(row!.pinHash).toBeTruthy()

    // Rien de lisible en base, rien dans la lecture masquée, rien dans les listes.
    const [vaultRow] = await db.select().from(cardVault).where(and(eq(cardVault.walletType, "PERSONAL"), eq(cardVault.cardId, owner.card.id)))
    noneOf(JSON.stringify(vaultRow), secrets)
    noneOf(JSON.stringify(await callerFor(admin).admin.cards.get(ref)), secrets)
    noneOf(JSON.stringify(await callerFor(admin).admin.cards.list({ search: pan.slice(-4) })), secrets)

    const revealed = await caller.admin.cards.reveal(ref)
    expect(revealed).toMatchObject({ pan, cvv: "737", pin: "2468", expiryMonth: 7, expiryYear: nextYear, cardholderName: "PORTEUR TEST", lastFour: pan.slice(-4), maskAfterSeconds: 30 })

    const audit = await auditRowsFor(owner.card.id, "card")
    expect(audit.map((entry) => entry.action).sort()).toEqual(["card.vault.reveal", "card.vault.set"])
    const reveal = audit.find((entry) => entry.action === "card.vault.reveal")!
    expect(reveal).toMatchObject({ actorId: superAdmin.id, actorRole: "super_admin", walletType: "PERSONAL", holderId: owner.userId, requestId: expect.stringMatching(/^req-/) })
    expect(detailOf(reveal)).toMatchObject({ fields: ["pan", "cvv", "pin"] })
    for (const entry of audit) noneOf(JSON.stringify(entry), secrets)

    const after = await caller.admin.cards.get(ref)
    expect(after.vault).toMatchObject({ revealCount: 1, lastRevealedBy: superAdmin.id })
    expect(after.lastRevealedByName).toContain("Staff")
  })

  it("un numéro Mastercard corrige le réseau de la carte, sauf une carte CB ; un numéro déjà utilisé ailleurs est refusé", async () => {
    const superAdmin = await makeStaff("super_admin")
    const first = await personalCard(superAdmin)
    const second = await personalCard(superAdmin)
    const caller = callerFor(superAdmin)
    const mc = mastercard()
    const other = visa()
    expect(await caller.admin.cards.setData({ walletType: "PERSONAL", cardId: first.card.id, pan: mc })).toMatchObject({ network: "mastercard", lastFour: mc.slice(-4) })

    await db.update(cards).set({ network: "cb" }).where(eq(cards.id, second.card.id))
    expect(await caller.admin.cards.setData({ walletType: "PERSONAL", cardId: second.card.id, pan: other })).toMatchObject({ network: "cb", lastFour: other.slice(-4) })
    await expect(caller.admin.cards.setData({ walletType: "PERSONAL", cardId: second.card.id, pan: mc })).rejects.toThrow(/déjà rattaché/)
  })

  it("valide les saisies : longueur du numéro, CVV, PIN, expiration passée, mois sans année, requête vide", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    await expect(caller.admin.cards.setData({ ...ref, pan: "1234" })).rejects.toThrow(/12 et 19/)
    await expect(caller.admin.cards.setData({ ...ref, cvv: "12" })).rejects.toThrow(/3 ou 4/)
    await expect(caller.admin.cards.setData({ ...ref, pin: "12a4" })).rejects.toThrow(/quatre chiffres/)
    await expect(caller.admin.cards.setData({ ...ref, expiryMonth: 1, expiryYear: 2020 })).rejects.toThrow(/dépassée/)
    await expect(caller.admin.cards.setData({ ...ref, expiryMonth: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.cards.setData(ref)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    // Une saisie refusée n'écrit rien.
    expect((await caller.admin.cards.get(ref)).vault.configured).toBe(false)
  })

  it("le PIN changé par le titulaire invalide le PIN du coffre ; effacer le PIN efface aussi son empreinte", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    await caller.admin.cards.setData({ ...ref, pan: visa(), pin: "1357" })
    const holder: Actor = { id: owner.userId, role: "user" }
    await callerFor(holder).cards.setPin({ cardId: owner.card.id, pin: "8642" })
    expect((await caller.admin.cards.get(ref)).vault).toMatchObject({ hasPan: true, hasPin: false })

    await caller.admin.cards.setData({ ...ref, pin: "1122" })
    const [withPin] = await db.select().from(cards).where(eq(cards.id, owner.card.id))
    expect(withPin!.pinHash).toBeTruthy()
    const cleared = await caller.admin.cards.clearData({ ...ref, fields: ["pin"] })
    expect(cleared.vault).toMatchObject({ hasPan: true, hasPin: false })
    const [withoutPin] = await db.select().from(cards).where(eq(cards.id, owner.card.id))
    expect(withoutPin!.pinHash).toBeNull()
  })

  it("annuler la carte purge son numéro, son CVV et son PIN", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    const pan = mastercard()
    await caller.admin.cards.setData({ ...ref, pan, cvv: "999", pin: "1234" })
    await caller.walletAdmin.cancelCard({ cardId: owner.card.id })
    expect((await caller.admin.cards.get(ref)).vault.configured).toBe(false)
    await expect(caller.admin.cards.setData({ ...ref, pan })).rejects.toThrow(/annulée/)
    expect(await caller.admin.cards.reveal(ref)).toMatchObject({ pan: null, cvv: null, pin: null })
    // Rien à révéler : pas d'événement de révélation dans le journal.
    expect((await auditRowsFor(owner.card.id, "card")).some((entry) => entry.action === "card.vault.reveal")).toBe(false)
  })

  it("le titulaire ne reçoit jamais l'empreinte de son PIN, seulement « défini » ou non", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const holder: Actor = { id: owner.userId, role: "user" }
    await callerFor(holder).cards.setPin({ cardId: owner.card.id, pin: "8642" })
    const mine = await callerFor(holder).cards.listMine()
    expect(mine[0]).toMatchObject({ id: owner.card.id, pinConfigured: true })
    expect(mine[0]).not.toHaveProperty("pinHash")
    const boot = await callerFor(holder).wallets.bootstrap()
    expect(boot.cards[0]).not.toHaveProperty("pinHash")
  })
})

describe("admin.cards — carte Wallet Pro", () => {
  it("même parcours pour une carte professionnelle : rattachée à la société, révélation journalisée au niveau de la société", async () => {
    const superAdmin = await makeStaff("super_admin")
    const company = await professionalCard(superAdmin)
    const ref = { walletType: "PROFESSIONAL" as const, cardId: company.card.id }
    const caller = callerFor(superAdmin)
    const pan = mastercard()
    const secrets = [pan, "321", "7777"]

    const listed = (await caller.admin.cards.list({ walletType: "PROFESSIONAL", search: "0001" })).find((card) => card.id === company.card.id)
    expect(listed).toMatchObject({ walletType: "PROFESSIONAL", theme: "teal", holder: { kind: "business", id: company.businessId }, vault: { hasPan: false } })
    expect(listed).not.toHaveProperty("tokenReference")

    const saved = await caller.admin.cards.setData({ ...ref, pan, cvv: "321", pin: "7777", expiryMonth: 3, expiryYear: nextYear })
    expect(saved).toMatchObject({ lastFour: pan.slice(-4), network: "mastercard", vault: { hasPan: true, hasCvv: true, hasPin: true } })
    const [row] = await db.select().from(businessCards).where(eq(businessCards.id, company.card.id))
    expect(row).toMatchObject({ lastFour: pan.slice(-4), network: "mastercard" })
    expect(expiryParts(row!.expiresAt)).toEqual({ month: 3, year: nextYear })

    expect(await caller.admin.cards.reveal(ref)).toMatchObject({ pan, cvv: "321", pin: "7777", network: "mastercard" })
    const audit = await auditRowsFor(company.card.id, "business_card")
    expect(audit.map((entry) => entry.action).sort()).toEqual(["card.vault.reveal", "card.vault.set"])
    expect(audit[0]).toMatchObject({ walletType: "PROFESSIONAL", holderId: company.businessId })
    for (const entry of audit) noneOf(JSON.stringify(entry), secrets)
  })

  it("même numéro sur une carte personnelle et une carte professionnelle : refusé", async () => {
    const superAdmin = await makeStaff("super_admin")
    const personal = await personalCard(superAdmin)
    const company = await professionalCard(superAdmin)
    const caller = callerFor(superAdmin)
    const pan = visa()
    await caller.admin.cards.setData({ walletType: "PERSONAL", cardId: personal.card.id, pan })
    await expect(caller.admin.cards.setData({ walletType: "PROFESSIONAL", cardId: company.card.id, pan })).rejects.toThrow(/déjà rattaché/)
  })
})

describe("admin.cards — coffre indisponible et données altérées", () => {
  it("une donnée altérée échoue proprement et le journalise ; sans clé (production) la saisie est refusée sans rien écrire", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    const pan = visa()
    await caller.admin.cards.setData({ ...ref, pan, cvv: "111" })

    // Altération du chiffré en base : le déchiffrement doit échouer, pas renvoyer n'importe quoi.
    const [row] = await db.select().from(cardVault).where(and(eq(cardVault.walletType, "PERSONAL"), eq(cardVault.cardId, owner.card.id)))
    const tampered = `${row!.cvvEnc!.slice(0, -3)}${row!.cvvEnc!.endsWith("AAA") ? "BBB" : "AAA"}`
    await db.update(cardVault).set({ cvvEnc: tampered }).where(eq(cardVault.id, row!.id))
    await expect(caller.admin.cards.reveal(ref)).rejects.toThrow(/illisibles/)
    const failed = (await auditRowsFor(owner.card.id, "card")).find((entry) => entry.action === "card.vault.reveal_failed")
    expect(detailOf(failed!)).toMatchObject({ reason: "integrity" })
    await db.update(cardVault).set({ cvvEnc: row!.cvvEnc }).where(eq(cardVault.id, row!.id))

    const savedKey = process.env.VTEX_VAULT_KEY
    const savedEnv = process.env.NODE_ENV
    try {
      delete process.env.VTEX_VAULT_KEY
      process.env.NODE_ENV = "production"
      await expect(caller.admin.cards.setData({ ...ref, pan: mastercard() })).rejects.toThrow(/pas configuré/)
    } finally {
      process.env.VTEX_VAULT_KEY = savedKey
      process.env.NODE_ENV = savedEnv
    }
    // La saisie refusée n'a pas touché la carte (transaction annulée).
    const [unchanged] = await db.select().from(cards).where(eq(cards.id, owner.card.id))
    expect(unchanged!.lastFour).toBe(pan.slice(-4))
  })
})

describe("admin.cards — statut, canaux, plafonds, réémission", () => {
  it("SUPPORT : lecture seule ; ADMIN : gèle, dégèle et règle les plafonds ; le titulaire relit l'état depuis la même source", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const owner = await personalCard(admin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    await expect(callerFor(agent).admin.cards.setFrozen({ ...ref, frozen: true })).rejects.toThrow(/Permission requise : cards\.manage/)
    await expect(callerFor(agent).admin.cards.updateControls({ ...ref, cashWithdrawalEnabled: false })).rejects.toThrow(/Permission requise/)

    const caller = callerFor(admin)
    expect((await caller.admin.cards.setFrozen({ ...ref, frozen: true })).status).toBe("frozen")
    const holder: Actor = { id: owner.userId, role: "user" }
    expect((await callerFor(holder).cards.listMine())[0]).toMatchObject({ id: owner.card.id, status: "frozen" })
    expect((await caller.admin.cards.setFrozen({ ...ref, frozen: false })).status).toBe("active")

    const updated = await caller.admin.cards.updateControls({ ...ref, onlinePaymentsEnabled: false, cashWithdrawalEnabled: false, perTransactionLimitCents: 20_000, dailyLimitCents: 60_000, monthlyLimitCents: 200_000 })
    expect(updated.controls).toEqual({ online: false, contactless: true, cash: false })
    expect(updated.limits).toEqual({ perTransactionCents: 20_000, dailyCents: 60_000, monthlyCents: 200_000 })
    expect(updated.tokenTail).toHaveLength(8)
    expect(updated).not.toHaveProperty("tokenReference")
    expect((await callerFor(holder).cards.listMine())[0]).toMatchObject({ onlinePaymentsEnabled: false, dailyLimitCents: 60_000 })
    await expect(caller.admin.cards.updateControls({ ...ref, perTransactionLimitCents: 90_000 })).rejects.toThrow(/par opération ≤ par jour ≤ par mois/)
    await expect(caller.admin.cards.updateControls({ ...ref, dailyLimitCents: -5 })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.cards.updateControls(ref)).rejects.toThrow(/Aucune modification/)
  })

  it("dernière utilisation connue : le dernier paiement carte terminé", async () => {
    const admin = await makeStaff("super_admin")
    const owner = await personalCard(admin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(admin)
    expect((await caller.admin.cards.get(ref)).lastUsedAt).toBeNull()
    await caller.walletAdmin.adjustBalance({ walletAccountId: owner.accountId, deltaCents: 50_000, reason: "Provision de test carte", idempotencyKey: `adj-${randomUUID()}` })
    await callerFor({ id: owner.userId, role: "user" }).cards.authorizePayment({ cardId: owner.card.id, amountCents: 1_500, merchantName: "Boulangerie Test", channel: "online", idempotencyKey: `pay-${randomUUID()}` })
    const used = await caller.admin.cards.get(ref)
    expect(used.lastUsedAt).toBeInstanceOf(Date)
    expect(Date.now() - new Date(used.lastUsedAt!).getTime()).toBeLessThan(120_000)
    expect((await caller.admin.cards.list({ search: owner.card.lastFour })).find((card) => card.id === owner.card.id)?.lastUsedAt).toBeTruthy()
  })

  it("renouveler / remplacer : nouvelle carte, ancienne annulée et son coffre purgé ; motif obligatoire au remplacement ; refusé pour une carte Pro", async () => {
    const superAdmin = await makeStaff("super_admin")
    const owner = await personalCard(superAdmin)
    const ref = { walletType: "PERSONAL" as const, cardId: owner.card.id }
    const caller = callerFor(superAdmin)
    await caller.admin.cards.setData({ ...ref, pan: visa(), cvv: "123", pin: "1234" })
    await expect(caller.admin.cards.reissue({ ...ref, action: "replace", idempotencyKey: `re-${randomUUID()}` })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const next = await caller.admin.cards.reissue({ ...ref, action: "replace", reason: "Carte perdue par le titulaire", idempotencyKey: `re-${randomUUID()}` })
    expect(next.id).not.toBe(owner.card.id)
    expect(next.status).toBe("active")
    const old = await caller.admin.cards.get(ref)
    expect(old.status).toBe("cancelled")
    expect(old.vault.configured).toBe(false)
    const company = await professionalCard(superAdmin)
    await expect(caller.admin.cards.cancel({ walletType: "PROFESSIONAL", cardId: company.card.id })).rejects.toThrow(/Wallet personnel/)
    await expect(caller.admin.cards.reissue({ walletType: "PROFESSIONAL", cardId: company.card.id, action: "renew", idempotencyKey: `re-${randomUUID()}` })).rejects.toThrow(/Wallet personnel/)
  })

  it("carte Wallet Pro : geler, canaux et plafonds depuis le Dashboard, relus par la société", async () => {
    const admin = await makeStaff("admin")
    const company = await professionalCard(admin)
    const ref = { walletType: "PROFESSIONAL" as const, cardId: company.card.id }
    const caller = callerFor(admin)
    expect((await caller.admin.cards.setFrozen({ ...ref, frozen: true })).status).toBe("frozen")
    const updated = await caller.admin.cards.updateControls({ ...ref, contactlessEnabled: false, perTransactionLimitCents: 50_000, dailyLimitCents: 150_000, monthlyLimitCents: 900_000 })
    expect(updated.controls.contactless).toBe(false)
    expect(updated.limits.dailyCents).toBe(150_000)
    const [row] = await db.select().from(businessCards).where(eq(businessCards.id, company.card.id))
    expect(row).toMatchObject({ status: "frozen", contactlessEnabled: false, dailyLimitCents: 150_000 })
  })
})

describe("Wallet Pro — cloisonnement des entreprises (IDOR)", () => {
  it("le propriétaire d'une société ne peut ni geler, ni régler, ni créer de carte sur les comptes d'une AUTRE société", async () => {
    const admin = await makeStaff("admin")
    const mine = await professionalCard(admin)
    const theirs = await professionalCard(admin)
    const [account] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, theirs.businessId))
    // L'appelant est le propriétaire de « mine » : membre actif, rôle owner — mais l'identifiant de carte / de compte est celui d'une autre société.
    const [ownerRow] = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, mine.businessId), eq(businessMembers.role, "owner")))
    const attacker = callerFor({ id: ownerRow!.userId, role: "user" })
    await expect(attacker.wallet.setCardFrozen({ businessId: mine.businessId, cardId: theirs.card.id, frozen: true })).rejects.toThrow(/introuvable pour cette entreprise/)
    await expect(attacker.wallet.updateCardControls({ businessId: mine.businessId, cardId: theirs.card.id, dailyLimitCents: 1 })).rejects.toThrow(/introuvable pour cette entreprise/)
    await expect(attacker.wallet.createCard({ businessId: mine.businessId, businessWalletAccountId: account!.id, cardholderName: "Intrus", network: "visa", theme: "navy", expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) })).rejects.toThrow(/introuvable pour cette entreprise/)
    const [untouched] = await db.select().from(businessCards).where(eq(businessCards.id, theirs.card.id))
    expect(untouched!.status).toBe("active")
    // Sur sa propre société, les mêmes appels réussissent.
    await expect(attacker.wallet.setCardFrozen({ businessId: mine.businessId, cardId: mine.card.id, frozen: true })).resolves.toBeTruthy()
    await expect(attacker.wallet.updateCardControls({ businessId: mine.businessId, cardId: mine.card.id, dailyLimitCents: 500_000, monthlyLimitCents: 2_000_000, perTransactionLimitCents: 100_000 })).resolves.toBeTruthy()
  })
})

describe("dates d'expiration", () => {
  it("dernier jour du mois, aller-retour sans dérive de fuseau", () => {
    expect(expiryFromMonthYear(2, 2028).toISOString()).toBe("2028-02-29T23:59:59.000Z")
    expect(expiryFromMonthYear(12, 2030).toISOString()).toBe("2030-12-31T23:59:59.000Z")
    expect(expiryParts(expiryFromMonthYear(1, 2031))).toEqual({ month: 1, year: 2031 })
  })
})
