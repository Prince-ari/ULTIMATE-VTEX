import { randomBytes, randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { bankAccounts, db, formatIban, generatedVirtualIban, hashPassword, logs, users, type Actor, type Role } from "@vtex/core"
import { businessWalletAccounts } from "@vtex/business"
import { walletAccounts, walletBankDetails } from "@vtex/wallet"

import { createManagedUser } from "./admin"
import { backfillBankAccounts } from "./backfillBankAccounts"
import { appRouter } from "./index"

const SAVED_KEY = process.env.VTEX_VAULT_KEY
beforeAll(() => { process.env.VTEX_VAULT_KEY = randomBytes(32).toString("base64") })
afterAll(() => { if (SAVED_KEY === undefined) delete process.env.VTEX_VAULT_KEY; else process.env.VTEX_VAULT_KEY = SAVED_KEY })

async function makeStaff(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Staff", lastName: suffix, email: `bank-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}
const callerFor = (actor: Actor) => appRouter.createCaller({ actor, jti: "jti-bank", ip: "127.0.0.1", requestId: `req-${randomUUID().slice(0, 6)}` })

async function personal(admin: Actor, currency: "EUR" | "XPF" = "EUR") {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Bancaire", lastName: suffix, email: `bancaire-${suffix}@test.local`, walletType: "PERSONAL", currency, status: "active", passwordMode: "generate" })
  return { userId: created.userId, accountId: created.walletAccountId!, name: `Bancaire ${suffix}` }
}
async function professional(admin: Actor, currency: "EUR" | "XPF" = "EUR") {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Gérant", lastName: suffix, email: `gerant-bank-${suffix}@test.local`, walletType: "PROFESSIONAL", currency, status: "active", passwordMode: "generate", company: { legalName: `SARL Banque ${suffix}`, brandName: `Banque ${suffix}` } })
  return { userId: created.userId, businessId: created.businessId!, accountId: created.businessAccountId!, name: `Banque ${suffix}` }
}
const detailOf = (entry: { detail: unknown }) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail) as Record<string, unknown>
async function auditFor(bankId: number) {
  return db.select().from(logs).where(and(eq(logs.targetType, "bank_account"), eq(logs.targetId, bankId)))
}

describe("admin.banking — permissions", () => {
  it("SUPPORT : lit les RIB masqués sans historique ; ne gère ni ne révèle rien. ADMIN : gère et révèle. Titulaire / gestionnaire : rien", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const owner = await personal(admin)
    const created = await callerFor(admin).admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "RIB principal", generate: true })
    const bankId = created.account.id

    const listed = await callerFor(agent).admin.banking.list({ search: owner.name })
    expect(listed.some((row) => row.id === bankId)).toBe(true)
    const seen = await callerFor(agent).admin.banking.get({ id: bankId })
    expect(seen.history).toBeNull()
    expect(seen.account.ibanMasked).toMatch(/^FR•• •••• •••• \d{4}$/)
    await expect(callerFor(agent).admin.banking.reveal({ id: bankId })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(agent).admin.banking.create({ kind: "SUB", currency: "EUR", label: "Refusé", generate: true })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(agent).admin.banking.update({ id: bankId, label: "Refusé", reason: "Tentative support" })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(agent).admin.banking.holders({ query: "x" })).rejects.toThrow(/Permission requise/)

    expect((await callerFor(admin).admin.banking.get({ id: bankId })).history?.length).toBeGreaterThan(0)
    expect((await callerFor(admin).admin.banking.reveal({ id: bankId })).iban).toMatch(/^FR\d{2}/)
    for (const actor of [{ id: owner.userId, role: "user" as const }, { id: 1, role: "account_manager" as const }]) {
      await expect(callerFor(actor).admin.banking.list()).rejects.toThrow(/Permission requise/)
      await expect(callerFor(actor).admin.banking.reveal({ id: bankId })).rejects.toThrow(/Permission requise/)
    }
  })
})

describe("admin.banking — RIB principal (écriture jumelée avec les colonnes historiques)", () => {
  it("créer : IBAN chiffré, colonnes du compte et historique du Wallet alimentés, IBAN jamais dans les listes ni le journal ; révéler est journalisé", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin, "XPF")
    const caller = callerFor(admin)
    const created = await caller.admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "RIB principal", generate: true, reason: "Ouverture du compte" })
    expect(created.account).toMatchObject({ kind: "MAIN", status: "active", currency: "XPF", holderId: owner.userId, ledgerAccountId: owner.accountId, holder: { kind: "user", name: owner.name }, ledger: { label: "Compte XPF" } })
    const { iban } = await caller.admin.banking.reveal({ id: created.account.id })

    const [legacy] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(legacy).toMatchObject({ iban, bic: "VTEXFRPPXXX" })
    const history = await db.select().from(walletBankDetails).where(eq(walletBankDetails.walletAccountId, owner.accountId))
    expect(history.filter((entry) => entry.status === "active")).toHaveLength(1)

    const everything = JSON.stringify([await caller.admin.banking.list({ search: owner.name }), await caller.admin.banking.get({ id: created.account.id }), await auditFor(created.account.id)])
    expect(everything).not.toContain(iban)
    expect(everything).not.toContain(iban.slice(4, 22))
    const actions = (await auditFor(created.account.id)).map((entry) => entry.action).sort()
    expect(actions).toEqual(["bank.account.create", "bank.iban.reveal"])
    const reveal = (await auditFor(created.account.id)).find((entry) => entry.action === "bank.iban.reveal")!
    expect(reveal).toMatchObject({ actorId: admin.id, actorRole: "admin", walletType: "PERSONAL", holderId: owner.userId })
  })

  it("un compte n'a qu'un RIB principal actif ; désactiver retire l'IBAN du compte, réactiver le rétablit ; modifier fait tourner l'IBAN partout", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin)
    const caller = callerFor(admin)
    const first = await caller.admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "RIB principal", generate: true })
    await expect(caller.admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "Second", generate: true })).rejects.toThrow(/déjà un RIB principal actif|déjà enregistré/)

    const rotated = generatedVirtualIban()
    await caller.admin.banking.update({ id: first.account.id, iban: formatIban(rotated), bic: "vtexfrppxxx", bankName: "Banque Test", reason: "Rotation demandée par le titulaire" })
    expect((await caller.admin.banking.reveal({ id: first.account.id })).iban).toBe(rotated)
    const [afterRotation] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(afterRotation).toMatchObject({ iban: rotated, bic: "VTEXFRPPXXX" })
    const updateLog = (await auditFor(first.account.id)).find((entry) => entry.action === "bank.account.update")!
    expect(detailOf(updateLog)).toMatchObject({ fields: expect.arrayContaining(["iban", "bic", "bankName"]), reason: "Rotation demandée par le titulaire" })
    expect(JSON.stringify(detailOf(updateLog))).not.toContain(rotated)

    await expect(caller.admin.banking.update({ id: first.account.id, label: "Sans motif suffisant", reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.banking.update({ id: first.account.id, reason: "Aucune modification demandée" })).rejects.toThrow(/Aucune modification/)

    await caller.admin.banking.setStatus({ id: first.account.id, status: "disabled", reason: "Compte clôturé chez la banque" })
    const [disabled] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(disabled).toMatchObject({ iban: null, bic: null })
    await expect(caller.admin.banking.setStatus({ id: first.account.id, status: "disabled", reason: "Déjà désactivé ce RIB" })).rejects.toThrow(/déjà désactivé/)

    await caller.admin.banking.setStatus({ id: first.account.id, status: "active", reason: "Réouverture du compte" })
    const [restored] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(restored!.iban).toBe(rotated)
  })

  it("RIB principal d'une société : colonnes du compte Pro alimentées", async () => {
    const admin = await makeStaff("admin")
    const company = await professional(admin)
    const caller = callerFor(admin)
    const created = await caller.admin.banking.create({ kind: "MAIN", walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.accountId, label: "RIB principal", generate: true })
    expect(created.account).toMatchObject({ walletType: "PROFESSIONAL", holder: { kind: "business", name: company.name } })
    const { iban } = await caller.admin.banking.reveal({ id: created.account.id })
    const [legacy] = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.id, company.accountId))
    expect(legacy!.iban).toBe(iban)
    expect(iban).toMatch(/^FR\d{2}30005/) // banque « Pro »
  })

  it("les anciens points d'entrée (Wallet / Wallet Pro) écrivent aussi dans bank_accounts : une seule vérité", async () => {
    const admin = await makeStaff("super_admin")
    const owner = await personal(admin)
    const company = await professional(admin)
    const caller = callerFor(admin)
    const personalIban = generatedVirtualIban()
    await caller.walletAdmin.updateBankDetails({ walletAccountId: owner.accountId, iban: personalIban, bic: "VTEXFRPPXXX", reason: "Attribution via l'ancien écran" })
    const proIban = generatedVirtualIban()
    await caller.businessAdmin.updateBankDetails({ businessId: company.businessId, accountId: company.accountId, iban: proIban, bic: "VTEXFRPPXXX", reason: "Attribution via l'ancien écran" })

    const listed = await caller.admin.banking.list({ kind: "MAIN" })
    const mine = listed.find((row) => row.ledgerAccountId === owner.accountId && row.walletType === "PERSONAL")!
    const pro = listed.find((row) => row.ledgerAccountId === company.accountId && row.walletType === "PROFESSIONAL")!
    expect((await caller.admin.banking.reveal({ id: mine.id })).iban).toBe(personalIban)
    expect((await caller.admin.banking.reveal({ id: pro.id })).iban).toBe(proIban)

    await caller.walletAdmin.revokeBankDetails({ walletAccountId: owner.accountId, reason: "Révocation via l'ancien écran" })
    expect((await caller.admin.banking.get({ id: mine.id })).account.status).toBe("disabled")
  })
})

describe("admin.banking — sous-RIB (IBAN virtuels)", () => {
  it("plusieurs sous-RIB générés et attribués à un compte ; la devise du compte s'impose ; un sous-RIB non attribué attend dans le stock", async () => {
    const admin = await makeStaff("admin")
    const company = await professional(admin, "EUR")
    const caller = callerFor(admin)
    const one = await caller.admin.banking.create({ kind: "SUB", walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.accountId, label: "Marketing", generate: true })
    const two = await caller.admin.banking.create({ kind: "SUB", walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.accountId, label: "Logistique", generate: true, bankName: "Banque Test" })
    expect(one.account).toMatchObject({ kind: "SUB", currency: "EUR", status: "active" })
    expect(one.account.id).not.toBe(two.account.id)
    expect((await caller.admin.banking.get({ id: one.account.id })).relations.map((row) => row.id)).toEqual(expect.arrayContaining([one.account.id, two.account.id]))
    expect((await caller.admin.banking.reveal({ id: one.account.id })).iban).toMatch(/^FR\d{2}30006/)

    const stock = await caller.admin.banking.create({ kind: "SUB", currency: "XPF", label: "Stock XPF", generate: true })
    expect(stock.account).toMatchObject({ holderId: null, ledgerAccountId: null, holder: null, currency: "XPF" })
    expect((await caller.admin.banking.list({ assignment: "unassigned", search: "Stock XPF" })).some((row) => row.id === stock.account.id)).toBe(true)
    // Aucun journal rattaché à un titulaire tant qu'il n'est pas attribué.
    expect((await auditFor(stock.account.id)).every((entry) => entry.holderId === null)).toBe(true)
  })

  it("attribuer, réattribuer, retirer : devise compatible, appartenance vérifiée côté serveur, motif obligatoire, historique complet", async () => {
    const admin = await makeStaff("admin")
    const eurOwner = await personal(admin, "EUR")
    const xpfOwner = await personal(admin, "XPF")
    const eurCompany = await professional(admin, "EUR")
    const caller = callerFor(admin)
    const stock = await caller.admin.banking.create({ kind: "SUB", currency: "EUR", label: "À attribuer", generate: true })
    const id = stock.account.id

    await expect(caller.admin.banking.assign({ id, walletType: "PERSONAL", holderId: xpfOwner.userId, ledgerAccountId: xpfOwner.accountId, reason: "Mauvaise devise ici" })).rejects.toThrow(/est en EUR.*XPF/)
    // IDOR : le compte d'un autre titulaire ne peut pas être rattaché en se trompant de titulaire.
    await expect(caller.admin.banking.assign({ id, walletType: "PERSONAL", holderId: eurOwner.userId, ledgerAccountId: xpfOwner.accountId, reason: "Titulaire incohérent" })).rejects.toThrow(/n'appartient pas à ce titulaire/)
    await expect(caller.admin.banking.assign({ id, walletType: "PERSONAL", holderId: eurOwner.userId, ledgerAccountId: eurOwner.accountId, reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const assigned = await caller.admin.banking.assign({ id, walletType: "PERSONAL", holderId: eurOwner.userId, ledgerAccountId: eurOwner.accountId, reason: "Demande du titulaire" })
    expect(assigned.account).toMatchObject({ holderId: eurOwner.userId, ledgerAccountId: eurOwner.accountId, walletType: "PERSONAL" })
    await expect(caller.admin.banking.assign({ id, walletType: "PERSONAL", holderId: eurOwner.userId, ledgerAccountId: eurOwner.accountId, reason: "Déjà rattaché ici" })).rejects.toThrow(/déjà rattaché/)

    const moved = await caller.admin.banking.assign({ id, walletType: "PROFESSIONAL", holderId: eurCompany.businessId, ledgerAccountId: eurCompany.accountId, reason: "Transfert vers la société" })
    expect(moved.account).toMatchObject({ walletType: "PROFESSIONAL", holderId: eurCompany.businessId, holder: { kind: "business", name: eurCompany.name } })
    const removed = await caller.admin.banking.unassign({ id, reason: "Retour au stock" })
    expect(removed.account).toMatchObject({ holderId: null, ledgerAccountId: null })
    await expect(caller.admin.banking.unassign({ id, reason: "Déjà retiré du compte" })).rejects.toThrow(/personne/)

    const actions = (await auditFor(id)).map((entry) => entry.action)
    expect(actions).toEqual(expect.arrayContaining(["bank.account.create", "bank.account.assign", "bank.account.reassign", "bank.account.unassign"]))
    const reassign = (await auditFor(id)).find((entry) => entry.action === "bank.account.reassign")!
    expect(detailOf(reassign)).toMatchObject({ from: { walletType: "PERSONAL", holderId: eurOwner.userId }, to: { walletType: "PROFESSIONAL", holderId: eurCompany.businessId }, reason: "Transfert vers la société" })
    // L'ancien titulaire voit le retrait dans son propre historique.
    const previousHolderLogs = await db.select().from(logs).where(and(eq(logs.walletType, "PERSONAL"), eq(logs.holderId, eurOwner.userId), eq(logs.targetId, id)))
    expect(previousHolderLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining(["bank.account.assign", "bank.account.unassign"]))
    const detail = await caller.admin.banking.get({ id })
    expect(detail.history!.map((entry) => entry.action)).toContain("bank.account.reassign")
    expect(detail.history![0]!.actorName).toContain("Staff")
  })

  it("un RIB principal ne s'attribue pas ; un sous-RIB désactivé non plus ; désactiver un sous-RIB ne touche pas les colonnes du compte", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin)
    const other = await personal(admin)
    const caller = callerFor(admin)
    const main = await caller.admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "RIB principal", generate: true })
    await expect(caller.admin.banking.assign({ id: main.account.id, walletType: "PERSONAL", holderId: other.userId, ledgerAccountId: other.accountId, reason: "Tentative sur le principal" })).rejects.toThrow(/Seul un sous-RIB/)
    await expect(caller.admin.banking.unassign({ id: main.account.id, reason: "Tentative sur le principal" })).rejects.toThrow(/ne se retire pas/)
    const sub = await caller.admin.banking.create({ kind: "SUB", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "Sous-RIB", generate: true })
    await caller.admin.banking.setStatus({ id: sub.account.id, status: "disabled", reason: "Sous-RIB abandonné" })
    await expect(caller.admin.banking.assign({ id: sub.account.id, walletType: "PERSONAL", holderId: other.userId, ledgerAccountId: other.accountId, reason: "Sous-RIB désactivé" })).rejects.toThrow(/désactivé/)
    const [legacy] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(legacy!.iban).toBeTruthy()
  })

  it("un IBAN saisi doit être valide et unique ; recherche par IBAN complet (empreinte) ; sélecteur de titulaires", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin)
    const caller = callerFor(admin)
    const iban = generatedVirtualIban()
    const created = await caller.admin.banking.create({ kind: "SUB", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "Saisi à la main", iban: formatIban(iban) })
    await expect(caller.admin.banking.create({ kind: "SUB", currency: "EUR", label: "Doublon", iban })).rejects.toThrow(/déjà enregistré/)
    await expect(caller.admin.banking.create({ kind: "SUB", currency: "EUR", label: "Faux IBAN", iban: "FR7630006000011234567890188" })).rejects.toThrow(/clé de contrôle/)
    await expect(caller.admin.banking.create({ kind: "SUB", currency: "EUR", label: "Les deux", iban, generate: true })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.banking.create({ kind: "SUB", currency: "EUR", label: "Aucun des deux" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.banking.create({ kind: "MAIN", currency: "EUR", label: "Principal orphelin", generate: true })).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect((await caller.admin.banking.list({ search: formatIban(iban) })).map((row) => row.id)).toEqual([created.account.id])
    const holders = await caller.admin.banking.holders({ query: owner.name.split(" ")[1]! })
    expect(holders.find((holder) => holder.holderId === owner.userId && holder.walletType === "PERSONAL")).toMatchObject({ name: owner.name, accounts: [{ id: owner.accountId, currency: "EUR", hasMain: false }] })
  })
})

describe("Wallet — le titulaire voit ses propres RIB, jamais ceux des autres", () => {
  it("bankAccounts.mine : RIB principal + sous-RIB actifs avec IBAN complet ; désactivé masqué ; Wallet Pro : membres seulement", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin)
    const stranger = await personal(admin)
    const company = await professional(admin)
    const caller = callerFor(admin)
    const main = await caller.admin.banking.create({ kind: "MAIN", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "RIB principal", generate: true })
    const sub = await caller.admin.banking.create({ kind: "SUB", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "Loyer", generate: true })
    const off = await caller.admin.banking.create({ kind: "SUB", walletType: "PERSONAL", holderId: owner.userId, ledgerAccountId: owner.accountId, label: "Ancien", generate: true })
    await caller.admin.banking.setStatus({ id: off.account.id, status: "disabled", reason: "Ancien sous-RIB désactivé" })

    const mine = await callerFor({ id: owner.userId, role: "user" }).bankAccounts.mine()
    expect(mine.map((row) => row.label)).toEqual(["RIB principal", "Loyer"])
    expect(mine[0]).toMatchObject({ kind: "MAIN", iban: (await caller.admin.banking.reveal({ id: main.account.id })).iban, currency: "EUR" })
    expect(mine[1]).toMatchObject({ kind: "SUB", iban: (await caller.admin.banking.reveal({ id: sub.account.id })).iban })
    expect(await callerFor({ id: stranger.userId, role: "user" }).bankAccounts.mine()).toEqual([])

    const proMain = await caller.admin.banking.create({ kind: "MAIN", walletType: "PROFESSIONAL", holderId: company.businessId, ledgerAccountId: company.accountId, label: "RIB principal", generate: true })
    const asMember = await callerFor({ id: company.userId, role: "user" }).wallet.bankAccounts({ businessId: company.businessId })
    expect(asMember).toHaveLength(1)
    expect(asMember[0]).toMatchObject({ kind: "MAIN", iban: (await caller.admin.banking.reveal({ id: proMain.account.id })).iban })
    await expect(callerFor({ id: stranger.userId, role: "user" }).wallet.bankAccounts({ businessId: company.businessId })).rejects.toThrow()
  })
})

describe("rattrapage des RIB historiques", () => {
  it("crée le RIB principal des comptes qui portent déjà un IBAN, sans doublon au second passage ; un IBAN invalide est signalé, pas migré", async () => {
    const admin = await makeStaff("admin")
    const owner = await personal(admin)
    const company = await professional(admin)
    const bad = await personal(admin)
    const iban = generatedVirtualIban()
    const proIban = generatedVirtualIban()
    await db.update(walletAccounts).set({ iban, bic: "VTEXFRPPXXX" }).where(eq(walletAccounts.id, owner.accountId))
    await db.update(businessWalletAccounts).set({ iban: proIban, bic: "VTEXFRPPXXX" }).where(eq(businessWalletAccounts.id, company.accountId))
    // IBAN historique invalide ET unique (clé de contrôle faussée) : la colonne est unique et la base de test persiste.
    const valid = generatedVirtualIban()
    const broken = `${valid.slice(0, -1)}${(Number(valid.slice(-1)) + 1) % 10}`
    await db.update(walletAccounts).set({ iban: broken }).where(eq(walletAccounts.id, bad.accountId))

    const first = await backfillBankAccounts()
    expect(first.personal.created).toBeGreaterThanOrEqual(1)
    expect(first.professional.created).toBeGreaterThanOrEqual(1)
    expect(first.problems.some((problem) => problem.includes(`#${bad.accountId}`))).toBe(true)
    const caller = callerFor(admin)
    const mains = await caller.admin.banking.list({ kind: "MAIN" })
    const mine = mains.find((row) => row.walletType === "PERSONAL" && row.ledgerAccountId === owner.accountId)!
    expect((await caller.admin.banking.reveal({ id: mine.id })).iban).toBe(iban)
    expect(mains.find((row) => row.walletType === "PROFESSIONAL" && row.ledgerAccountId === company.accountId)).toMatchObject({ holderId: company.businessId, accountHolderName: expect.stringContaining("SARL Banque") })
    expect(mains.some((row) => row.walletType === "PERSONAL" && row.ledgerAccountId === bad.accountId)).toBe(false)

    const second = await backfillBankAccounts()
    expect(second.personal.created).toBe(0)
    expect(second.professional.created).toBe(0)
    const rows = await db.select().from(bankAccounts).where(and(eq(bankAccounts.walletType, "PERSONAL"), eq(bankAccounts.ledgerAccountId, owner.accountId)))
    expect(rows).toHaveLength(1)
    // Les colonnes historiques ne sont jamais modifiées par le rattrapage.
    const [legacy] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, owner.accountId))
    expect(legacy!.iban).toBe(iban)
  })
})
