import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { ForbiddenError, ValidationError, db, hashPassword, logs, users, verifyPassword, type Actor, type Role } from "@vtex/core"
import { businessMembers, businessSettings, businessWalletAccounts, businesses } from "@vtex/business"
import { cards, walletAccounts } from "@vtex/wallet"

import { createManagedUser, getManagedUserFile, listManagedUsers, maskIban } from "./admin"
import { appRouter } from "./index"

async function makeStaff(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Staff", lastName: suffix, email: `staff-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}

const identity = () => {
  const suffix = randomUUID().slice(0, 8)
  return { firstName: "Nouvel", lastName: `Titulaire${suffix}`, email: `nouveau-${suffix}@test.local` }
}

async function userByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return row
}

describe("admin.users.create — utilisateur + wallet, en une seule transaction", () => {
  it("PERSONAL : crée l'utilisateur, le compte dans la devise choisie et sa carte virtuelle ; mot de passe temporaire imposé", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    const created = await createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "XPF", status: "active", passwordMode: "generate" })

    expect(created.walletType).toBe("PERSONAL")
    expect(created.temporaryPassword).toHaveLength(16)
    const user = (await userByEmail(who.email))!
    expect(user).toMatchObject({ id: created.userId, role: "user", status: "active", mustChangePassword: true })
    expect(user.tempPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000)
    expect(user.passwordHash).not.toContain(created.temporaryPassword!)
    expect(verifyPassword(created.temporaryPassword!, user.passwordHash)).toBe(true)

    const accounts = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, created.userId))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ currency: "XPF", status: "active", availableBalanceCents: 0 })
    const accountCards = await db.select().from(cards).where(eq(cards.walletAccountId, accounts[0]!.id))
    expect(accountCards).toHaveLength(1)
  })

  it("PROFESSIONAL : crée l'utilisateur, la société, le membre owner, les paramètres et le compte principal dans la devise choisie", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    const created = await createManagedUser(admin, {
      ...who,
      walletType: "PROFESSIONAL",
      currency: "EUR",
      status: "active",
      passwordMode: "generate",
      company: { legalName: `SARL ${who.lastName}`, brandName: `Marque ${who.lastName}`, industry: "Commerce" },
    })
    expect(created.walletType).toBe("PROFESSIONAL")
    const [company] = await db.select().from(businesses).where(eq(businesses.id, created.businessId!)).limit(1)
    expect(company).toMatchObject({ ownerUserId: created.userId, currency: "EUR", status: "active" })
    const [member] = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, created.businessId!), eq(businessMembers.userId, created.userId)))
    expect(member).toMatchObject({ role: "owner", status: "active" })
    const settings = await db.select().from(businessSettings).where(eq(businessSettings.businessId, created.businessId!))
    expect(settings).toHaveLength(1)
    const accounts = await db.select().from(businessWalletAccounts).where(eq(businessWalletAccounts.businessId, created.businessId!))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ id: created.businessAccountId, label: "Compte principal", currency: "EUR" })
    // Un titulaire PROFESSIONAL n'a pas de wallet personnel tant qu'il n'en ouvre pas un.
    expect(await db.select().from(walletAccounts).where(eq(walletAccounts.userId, created.userId))).toHaveLength(0)
  })

  it("ROLLBACK : une erreur au milieu de la création n'en laisse aucune trace (ni utilisateur, ni société)", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    // « GBP » n'est pas une devise prise en charge : l'échec survient APRÈS l'insertion de l'utilisateur.
    await expect(
      createManagedUser(admin, { ...who, walletType: "PROFESSIONAL", currency: "GBP" as never, status: "active", passwordMode: "generate", company: { legalName: "Fantôme SAS", brandName: "Fantôme" } }),
    ).rejects.toThrow(ValidationError)
    expect(await userByEmail(who.email)).toBeUndefined()
    expect(await db.select().from(businesses).where(eq(businesses.legalName, "Fantôme SAS"))).toHaveLength(0)
  })

  it("refuse un e-mail déjà utilisé sans rien créer", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    const first = await createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
    await expect(createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "USD", status: "active", passwordMode: "generate" })).rejects.toThrow(/déjà utilisé/)
    // Le titulaire existant garde son seul compte EUR ; rien n'a été ajouté par la tentative refusée.
    const accounts = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, first.userId))
    expect(accounts.map((account) => account.currency)).toEqual(["EUR"])
  })

  it("mot de passe manuel : politique appliquée, jamais renvoyé dans la réponse", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    await expect(createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "manual", initialPassword: "court" })).rejects.toThrow(ValidationError)
    expect(await userByEmail(who.email)).toBeUndefined()
    const created = await createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "manual", initialPassword: "Mot-de-passe-choisi-9" })
    expect(created.temporaryPassword).toBeNull()
    expect(JSON.stringify(created)).not.toContain("Mot-de-passe-choisi-9")
    const user = (await userByEmail(who.email))!
    expect(verifyPassword("Mot-de-passe-choisi-9", user.passwordHash)).toBe(true)
    expect(user.mustChangePassword).toBe(true)
  })

  it("le journal rattache la création au titulaire (fiche) sans jamais contenir de mot de passe", async () => {
    const admin = await makeStaff("admin")
    const who = identity()
    const created = await createManagedUser(admin, { ...who, walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
    const entries = await db.select().from(logs).where(and(eq(logs.walletType, "PERSONAL"), eq(logs.holderId, created.userId)))
    expect(entries.map((entry) => entry.action).sort()).toEqual(["user.create", "wallet.account.create"])
    expect(entries.every((entry) => entry.actorId === admin.id)).toBe(true)
    expect(JSON.stringify(entries)).not.toContain(created.temporaryPassword!)
  })

  it("permissions : seuls ADMIN et SUPER_ADMIN créent ; SUPPORT, ACCOUNT_MANAGER et user sont refusés", async () => {
    for (const role of ["agent", "account_manager", "user"] as const) {
      const actor = await makeStaff(role)
      await expect(createManagedUser(actor, { ...identity(), walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })).rejects.toThrow(ForbiddenError)
    }
    const superAdmin = await makeStaff("super_admin")
    await expect(createManagedUser(superAdmin, { ...identity(), walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })).resolves.toBeTruthy()
  })

  it("via tRPC : la société est exigée pour PROFESSIONAL et interdite pour PERSONAL (validation serveur)", async () => {
    const admin = await makeStaff("admin")
    const caller = appRouter.createCaller({ actor: admin, jti: "j", ip: "127.0.0.1", requestId: "r" })
    const base = { ...identity(), currency: "EUR" as const }
    await expect(caller.admin.users.create({ ...base, walletType: "PROFESSIONAL" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller.admin.users.create({ ...base, walletType: "PERSONAL", company: { legalName: "Nope SAS", brandName: "Nope" } })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const ok = await caller.admin.users.create({ ...base, walletType: "PERSONAL" })
    expect(ok.userId).toBeGreaterThan(0)
  })
})

describe("admin.users.list / file", () => {
  it("list : type de wallet et devises par utilisateur, filtres walletType et currency ; lisible par SUPPORT", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const personal = await createManagedUser(admin, { ...identity(), walletType: "PERSONAL", currency: "XPF", status: "active", passwordMode: "generate" })
    const pro = await createManagedUser(admin, { ...identity(), walletType: "PROFESSIONAL", currency: "USD", status: "active", passwordMode: "generate", company: { legalName: "Pro USD SAS", brandName: "ProUSD" } })

    const all = await listManagedUsers(agent, {})
    const personalRow = all.find((row) => row.id === personal.userId)!
    const proRow = all.find((row) => row.id === pro.userId)!
    expect(personalRow).toMatchObject({ walletTypes: ["PERSONAL"], currencies: ["XPF"] })
    expect(proRow).toMatchObject({ walletTypes: ["PROFESSIONAL"], currencies: ["USD"] })
    expect(proRow.companies[0]).toMatchObject({ id: pro.businessId, role: "owner" })
    expect(personalRow).not.toHaveProperty("passwordHash")

    const onlyPro = await listManagedUsers(admin, { walletType: "PROFESSIONAL", currency: "USD" })
    expect(onlyPro.some((row) => row.id === pro.userId)).toBe(true)
    expect(onlyPro.some((row) => row.id === personal.userId)).toBe(false)
    const onlyXpf = await listManagedUsers(admin, { currency: "XPF" })
    expect(onlyXpf.every((row) => row.currencies.includes("XPF"))).toBe(true)
  })

  it("list : ACCOUNT_MANAGER et user sont refusés (fermé par défaut)", async () => {
    for (const role of ["account_manager", "user"] as const) await expect(listManagedUsers(await makeStaff(role), {})).rejects.toThrow(ForbiddenError)
  })

  it("file : un administrateur ouvre n'importe quel titulaire par son identifiant ; la consultation est journalisée", async () => {
    const admin = await makeStaff("admin")
    const target = await createManagedUser(admin, { ...identity(), walletType: "PERSONAL", currency: "EUR", status: "active", passwordMode: "generate" })
    const file = await getManagedUserFile(admin, target.userId)

    expect(file.user).toMatchObject({ id: target.userId, role: "user", mustChangePassword: true })
    expect(file.user).not.toHaveProperty("passwordHash")
    expect(file.walletTypes).toEqual(["PERSONAL"])
    expect(file.personal.accounts).toHaveLength(1)
    expect(file.personal.accounts[0]).toMatchObject({ currency: "EUR", availableBalanceCents: 0, ibanMasked: null })
    expect(file.personal.accounts[0]!.cards).toHaveLength(1)
    expect(file.security).toMatchObject({ activeSessions: 0, mustChangePassword: true, failedLoginCount: 0 })
    expect(file.activity!.map((entry) => entry.action)).toEqual(expect.arrayContaining(["user.create"]))

    const views = await db.select().from(logs).where(and(eq(logs.action, "user.file.view"), eq(logs.targetId, target.userId)))
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({ actorId: admin.id, walletType: "PERSONAL", holderId: target.userId })
  })

  it("file : SUPPORT lit la fiche mais n'a pas l'historique d'audit ; société et comptes Pro visibles pour le propriétaire", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const pro = await createManagedUser(admin, { ...identity(), walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: "Fiche Pro SAS", brandName: "FichePro" } })
    const file = await getManagedUserFile(agent, pro.userId)
    expect(file.activity).toBeNull()
    expect(file.walletTypes).toEqual(["PROFESSIONAL"])
    expect(file.companies).toHaveLength(1)
    expect(file.companies[0]).toMatchObject({ businessId: pro.businessId, myRole: "owner", brandName: "FichePro" })
    expect(file.companies[0]!.accounts).toHaveLength(1)
  })

  it("file : identifiant inexistant → 404 ; ACCOUNT_MANAGER refusé", async () => {
    const admin = await makeStaff("admin")
    await expect(getManagedUserFile(admin, 2_000_000_000)).rejects.toThrow(/introuvable/)
    await expect(getManagedUserFile(await makeStaff("account_manager"), admin.id)).rejects.toThrow(ForbiddenError)
  })

  it("maskIban ne laisse voir que le début et les quatre derniers caractères", () => {
    expect(maskIban("FR7630004028320001234567890")).toBe("FR76 •••• •••• 7890")
    expect(maskIban(null)).toBeNull()
    expect(maskIban("FR12")).toBe("••••")
  })
})
