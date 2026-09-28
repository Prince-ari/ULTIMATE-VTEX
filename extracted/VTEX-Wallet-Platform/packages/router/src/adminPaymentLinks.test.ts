import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db, hashPassword, logs, users, type Actor, type Role } from "@vtex/core"
import { businessTransactions, businessWalletAccounts, paymentLinkEvents, paymentLinkPayments, paymentLinks } from "@vtex/business"

import { createManagedUser } from "./admin"
import { appRouter } from "./index"

const GOOD_CARD = "4242 4242 4242 4242"
const DECLINED_CARD = "4000 0000 0000 0002"

async function makeStaff(role: Role): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({ firstName: "Staff", lastName: suffix, email: `plink-${suffix}@test.local`, passwordHash: hashPassword("staffpass-123456"), role, status: "active" })
  return { id: inserted.insertId, role }
}

const callerFor = (actor: Actor | null, ip = "10.1.0.1") => appRouter.createCaller({ actor, jti: actor ? "jti-plink" : null, ip, requestId: `req-${randomUUID().slice(0, 6)}` })
/** Chaque scénario paie depuis sa propre adresse : les limiteurs de débit sont par IP. */
const freshIp = () => `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

async function company(admin: Actor) {
  const suffix = randomUUID().slice(0, 8)
  const created = await createManagedUser(admin, { firstName: "Gérant", lastName: suffix, email: `gerant-plink-${suffix}@test.local`, walletType: "PROFESSIONAL", currency: "EUR", status: "active", passwordMode: "generate", company: { legalName: `SARL Lien ${suffix}`, brandName: `Boutique ${suffix}` } })
  return { owner: { id: created.userId, role: "user" as const } satisfies Actor, businessId: created.businessId!, accountId: created.businessAccountId!, brand: `Boutique ${suffix}` }
}

async function balanceOf(accountId: number) {
  const [row] = await db.select({ balance: businessWalletAccounts.availableBalanceCents }).from(businessWalletAccounts).where(eq(businessWalletAccounts.id, accountId))
  return Number(row!.balance)
}

async function newLink(owner: Actor, businessId: number, accountId: number, overrides: Partial<{ name: string; amountCents: number; mode: "unique" | "recurring"; description: string }> = {}) {
  const before = await callerFor(owner).paymentLinks.list({ businessId })
  const known = new Set(before.map((link) => link.id))
  const links = await callerFor(owner).paymentLinks.create({ businessId, name: overrides.name ?? "Acompte atelier", amountCents: overrides.amountCents ?? 12_500, currency: "EUR", mode: overrides.mode ?? "recurring", targetAccountId: accountId, description: overrides.description })
  return links.find((link) => !known.has(link.id))!
}

const startInput = (slug: string, email = "cliente@example.com") => ({ slug, payerName: "Camille Client", payerEmail: email, idempotencyKey: `pay-${randomUUID()}` })

describe("liens de paiement — paiement public, du lien au crédit", () => {
  it("la personne qui paie n'a aucun compte : lien lu, paiement démarré, réglé, compte Pro crédité une seule fois, jamais d'identifiant interne exposé", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId, { description: "Acompte pour la commande n° 42" })
    expect(link.slug).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(link.targetAccount).toMatchObject({ id: shop.accountId, currency: "EUR" })

    const ip = freshIp()
    const visitor = callerFor(null, ip)
    const view = await visitor.publicPayments.get({ slug: link.slug })
    expect(view).toMatchObject({ name: "Acompte atelier", description: "Acompte pour la commande n° 42", amountCents: 12_500, currency: "EUR", businessName: shop.brand, payable: true })
    const exposed = JSON.stringify(view)
    for (const secret of [`"businessId"`, `"targetAccountId"`, `"createdBy"`, `"slug"`, `"id":`]) expect(exposed).not.toContain(secret)

    const before = await balanceOf(shop.accountId)
    const started = await visitor.publicPayments.start(startInput(link.slug))
    expect(started).toMatchObject({ status: "pending", amountCents: 12_500, currency: "EUR", replayed: false })
    expect(started.reference).toMatch(/^PLP-[0-9A-F]{16}$/)
    expect(await balanceOf(shop.accountId)).toBe(before)

    const paid = await visitor.publicPayments.simPay({ reference: started.reference, cardNumber: GOOD_CARD })
    expect(paid).toMatchObject({ status: "succeeded", cardBrand: "visa", cardLast4: "4242", amountCents: 12_500 })
    expect(await balanceOf(shop.accountId)).toBe(before + 12_500)

    // Deux confirmations de plus (retour du payeur, webhook) : jamais un second crédit.
    await visitor.publicPayments.confirm({ reference: started.reference })
    await visitor.publicPayments.confirm({ reference: started.reference })
    expect(await balanceOf(shop.accountId)).toBe(before + 12_500)
    const credits = await db.select().from(businessTransactions).where(and(eq(businessTransactions.businessWalletAccountId, shop.accountId), eq(businessTransactions.type, "payment_link")))
    expect(credits).toHaveLength(1)
    expect(credits[0]).toMatchObject({ direction: "credit", amountCents: 12_500, reference: started.reference })
    expect(JSON.stringify(credits[0]!.metadata)).not.toMatch(/4242 4242|cvv|\bpin\b/i)

    const events = await db.select().from(paymentLinkEvents).where(eq(paymentLinkEvents.paymentLinkId, link.id))
    expect(events.filter((event) => event.kind === "visit")).toHaveLength(1)
    expect(events.filter((event) => event.kind === "payment")).toHaveLength(1)

    // Côté Pro : les compteurs et la liste des paiements reflètent l'encaissement.
    const [row] = (await callerFor(shop.owner).paymentLinks.list({ businessId: shop.businessId })).filter((entry) => entry.id === link.id)
    expect(row).toMatchObject({ visits: 1, paid: 1, revenueCents: 12_500 })
    const recent = await callerFor(shop.owner).paymentLinks.payments({ businessId: shop.businessId, linkId: link.id })
    expect(recent).toHaveLength(1)
    expect(JSON.stringify(recent)).not.toContain(ip)

    const trail = await db.select().from(logs).where(and(eq(logs.targetType, "payment_link"), eq(logs.targetId, link.id)))
    expect(trail.map((entry) => entry.action).sort()).toEqual(expect.arrayContaining(["business.payment_link.create", "payment_link.payment.start", "payment_link.payment.credit"]))
    expect(trail.find((entry) => entry.action === "payment_link.payment.credit")).toMatchObject({ walletType: "PROFESSIONAL", holderId: shop.businessId })
    // L'adresse du payeur n'existe que dans le journal d'audit (traçabilité anti-fraude) ; aucune vue Pro ni Dashboard ne la renvoie (cf. test admin).
  })

  it("un paiement refusé ne crédite rien et laisse le lien réutilisable ; rejouer la même clé renvoie le même paiement ; une clé ne sert pas à un autre payeur", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())
    const before = await balanceOf(shop.accountId)

    const input = startInput(link.slug)
    const first = await visitor.publicPayments.start(input)
    const replay = await visitor.publicPayments.start(input)
    expect(replay).toMatchObject({ reference: first.reference, replayed: true })
    await expect(visitor.publicPayments.start({ ...input, payerEmail: "autre@example.com" })).rejects.toThrow(/clé d'idempotence/)

    const declined = await visitor.publicPayments.simPay({ reference: first.reference, cardNumber: DECLINED_CARD })
    expect(declined.status).toBe("failed")
    expect(declined.failureMessage).toBeTruthy()
    expect(await balanceOf(shop.accountId)).toBe(before)

    const retried = await visitor.publicPayments.start(startInput(link.slug))
    expect(retried.reference).not.toBe(first.reference)
    await visitor.publicPayments.simPay({ reference: retried.reference, cardNumber: GOOD_CARD })
    expect(await balanceOf(shop.accountId)).toBe(before + 12_500)
  })

  it("un lien à usage unique n'encaisse qu'une fois puis arrive à terme ; pendant un règlement en cours il est réservé", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId, { mode: "unique", name: "Devis 88" })
    const visitor = callerFor(null, freshIp())

    const first = await visitor.publicPayments.start(startInput(link.slug))
    await expect(visitor.publicPayments.start(startInput(link.slug, "second@example.com"))).rejects.toThrow(/usage unique/)
    expect((await visitor.publicPayments.get({ slug: link.slug })).payable).toBe(false)

    await visitor.publicPayments.simPay({ reference: first.reference, cardNumber: GOOD_CARD })
    const [stored] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, link.id))
    expect(stored!.status).toBe("expired")
    await expect(visitor.publicPayments.start(startInput(link.slug, "troisieme@example.com"))).rejects.toThrow(/plus valable|usage unique/)
    await expect(callerFor(shop.owner).paymentLinks.updateStatus({ businessId: shop.businessId, linkId: link.id, status: "active" })).rejects.toThrow(/déjà payé/)
    expect(await balanceOf(shop.accountId)).toBe(12_500)
  })

  it("brouillon, désactivé, expiré ou inconnu : le payeur reçoit la même réponse « indisponible », sans deviner qu'il existe", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())

    await callerFor(shop.owner).paymentLinks.updateStatus({ businessId: shop.businessId, linkId: link.id, status: "draft" })
    await expect(visitor.publicPayments.get({ slug: link.slug })).rejects.toThrow(/pas disponible/)
    await callerFor(shop.owner).paymentLinks.updateStatus({ businessId: shop.businessId, linkId: link.id, status: "disabled" })
    await expect(visitor.publicPayments.get({ slug: link.slug })).rejects.toThrow(/pas disponible/)
    await expect(visitor.publicPayments.start(startInput(link.slug))).rejects.toThrow(/pas disponible/)
    await expect(visitor.publicPayments.get({ slug: "n'existe-pas!" })).rejects.toThrow(/pas disponible/)
    await expect(visitor.publicPayments.get({ slug: "zzzzzzzzzzzz" })).rejects.toThrow(/pas disponible/)

    // Expiration : le lien reste visible mais non payable.
    await callerFor(shop.owner).paymentLinks.updateStatus({ businessId: shop.businessId, linkId: link.id, status: "active" })
    await db.update(paymentLinks).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(paymentLinks.id, link.id))
    const expired = await visitor.publicPayments.get({ slug: link.slug })
    expect(expired).toMatchObject({ payable: false, unavailableReason: expect.stringMatching(/plus valable/) })
    await expect(visitor.publicPayments.start(startInput(link.slug))).rejects.toThrow(/plus valable/)
  })

  it("validations : nom et e-mail du payeur, montant minimum, date d'expiration future ; le payeur ne choisit jamais le montant", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())

    await expect(visitor.publicPayments.start({ ...startInput(link.slug), payerEmail: "pas-un-email" })).rejects.toThrow(/adresse e-mail valide/)
    await expect(visitor.publicPayments.start({ ...startInput(link.slug), payerName: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    // Un montant fourni par le payeur est ignoré : seul celui du lien fait foi.
    const tampered = await visitor.publicPayments.start({ ...startInput(link.slug), amountCents: 1 } as never)
    expect(tampered.amountCents).toBe(12_500)

    await expect(callerFor(shop.owner).paymentLinks.create({ businessId: shop.businessId, name: "Trop petit", amountCents: 50, mode: "recurring", targetAccountId: shop.accountId })).rejects.toThrow(/montant minimum/)
    await expect(callerFor(shop.owner).paymentLinks.create({ businessId: shop.businessId, name: "Démesuré", amountCents: 9_000_000, mode: "recurring", targetAccountId: shop.accountId })).rejects.toThrow(/montant maximum/)
    await expect(callerFor(shop.owner).paymentLinks.create({ businessId: shop.businessId, name: "Déjà expiré", amountCents: 5_000, mode: "recurring", targetAccountId: shop.accountId, expiresAt: new Date(Date.now() - 3_600_000) })).rejects.toThrow(/dans le futur/)
  })

  it("cloisonnement : une autre entreprise ne peut ni viser ce compte, ni lire ces paiements, ni changer ce lien", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const rival = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)

    await expect(callerFor(rival.owner).paymentLinks.create({ businessId: rival.businessId, name: "Vers le compte d'autrui", amountCents: 5_000, mode: "recurring", targetAccountId: shop.accountId })).rejects.toThrow(/introuvable pour cette entreprise/)
    await expect(callerFor(rival.owner).paymentLinks.payments({ businessId: shop.businessId, linkId: link.id })).rejects.toThrow()
    await expect(callerFor(rival.owner).paymentLinks.payments({ businessId: rival.businessId, linkId: link.id })).rejects.toThrow(/introuvable/)
    await expect(callerFor(rival.owner).paymentLinks.updateStatus({ businessId: rival.businessId, linkId: link.id, status: "disabled" })).rejects.toThrow(/introuvable/)
    await expect(callerFor(null).paymentLinks.list({ businessId: shop.businessId })).rejects.toThrow(/Authentification/)
  })
})

describe("admin.paymentLinks — supervision, désactivation, remboursement", () => {
  it("SUPPORT lit, ADMIN gère ; titulaire et gestionnaire n'ont aucun accès transverse ; les vues n'exposent ni IP ni intention", async () => {
    const admin = await makeStaff("admin")
    const agent = await makeStaff("agent")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const ip = freshIp()
    const started = await callerFor(null, ip).publicPayments.start(startInput(link.slug))
    await callerFor(null, ip).publicPayments.simPay({ reference: started.reference, cardNumber: GOOD_CARD })

    const listed = await callerFor(agent).admin.paymentLinks.list({ search: shop.brand })
    expect(listed).toEqual([expect.objectContaining({ id: link.id, paid: 1, revenueCents: 12_500, status: "active", business: expect.objectContaining({ id: shop.businessId }), publicPath: `/pay/${link.slug}` })])
    const detail = await callerFor(agent).admin.paymentLinks.get({ id: link.id })
    expect(detail.payments).toEqual([expect.objectContaining({ reference: started.reference, status: "succeeded", payerEmail: "cliente@example.com", cardLast4: "4242" })])
    const seen = JSON.stringify([listed, detail, await callerFor(agent).admin.paymentLinks.payments()])
    expect(seen).not.toContain(ip)
    expect(seen).not.toContain("pi_")
    expect(seen).not.toMatch(/stripePaymentIntentId|payerIp/)

    await expect(callerFor(agent).admin.paymentLinks.setStatus({ id: link.id, status: "disabled", reason: "Tentative du support" })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(agent).admin.paymentLinks.refund({ reference: started.reference, reason: "Tentative du support" })).rejects.toThrow(/Permission requise/)
    await expect(callerFor(agent).admin.paymentLinks.reconcile({ reference: started.reference })).rejects.toThrow(/Permission requise/)
    for (const actor of [shop.owner, { id: 1, role: "account_manager" as const }]) {
      await expect(callerFor(actor).admin.paymentLinks.list()).rejects.toThrow(/Permission requise/)
      await expect(callerFor(actor).admin.paymentLinks.get({ id: link.id })).rejects.toThrow(/Permission requise/)
    }
    await expect(callerFor(null).admin.paymentLinks.list()).rejects.toThrow(/Authentification/)
  })

  it("désactiver puis réactiver un lien exige un motif, se journalise sur la société et bloque réellement le paiement public", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())

    await expect(callerFor(admin).admin.paymentLinks.setStatus({ id: link.id, status: "disabled", reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const disabled = await callerFor(admin).admin.paymentLinks.setStatus({ id: link.id, status: "disabled", reason: "Soupçon de fraude signalé par la banque" })
    expect(disabled.status).toBe("disabled")
    await expect(visitor.publicPayments.start(startInput(link.slug))).rejects.toThrow(/pas disponible/)
    await expect(callerFor(admin).admin.paymentLinks.setStatus({ id: link.id, status: "disabled", reason: "Déjà désactivé ce lien" })).rejects.toThrow(/déjà désactivé/)

    const enabled = await callerFor(admin).admin.paymentLinks.setStatus({ id: link.id, status: "active", reason: "Vérification terminée, lien légitime" })
    expect(enabled.status).toBe("active")
    expect((await visitor.publicPayments.get({ slug: link.slug })).payable).toBe(true)

    const trail = await db.select().from(logs).where(and(eq(logs.targetType, "payment_link"), eq(logs.targetId, link.id)))
    const disable = trail.find((entry) => entry.action === "payment_link.admin.disable")!
    expect(disable).toMatchObject({ actorId: admin.id, actorRole: "admin", walletType: "PROFESSIONAL", holderId: shop.businessId })
    const detail = (typeof disable.detail === "string" ? JSON.parse(disable.detail) : disable.detail) as Record<string, unknown>
    expect(detail).toMatchObject({ from: "active", to: "disabled", reason: "Soupçon de fraude signalé par la banque" })
  })

  it("remboursement : débit du compte Pro, statut « remboursé », une seule fois, motif obligatoire et journalisé ; un paiement non encaissé ne se rembourse pas", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())
    const started = await visitor.publicPayments.start(startInput(link.slug))

    await expect(callerFor(admin).admin.paymentLinks.refund({ reference: started.reference, reason: "Remboursement avant paiement" })).rejects.toThrow(/encaissé/)
    await visitor.publicPayments.simPay({ reference: started.reference, cardNumber: GOOD_CARD })
    const funded = await balanceOf(shop.accountId)
    expect(funded).toBe(12_500)

    await expect(callerFor(admin).admin.paymentLinks.refund({ reference: started.reference, reason: "court" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const refunded = await callerFor(admin).admin.paymentLinks.refund({ reference: started.reference, reason: "Commande annulée par la cliente" })
    expect(refunded.status).toBe("refunded")
    expect(await balanceOf(shop.accountId)).toBe(0)
    await expect(callerFor(admin).admin.paymentLinks.refund({ reference: started.reference, reason: "Deuxième remboursement" })).rejects.toThrow(/encaissé/)
    expect(await balanceOf(shop.accountId)).toBe(0)

    const [row] = await db.select().from(paymentLinkPayments).where(eq(paymentLinkPayments.reference, started.reference))
    expect(row!.status).toBe("refunded")
    const refunds = await db.select().from(businessTransactions).where(and(eq(businessTransactions.businessWalletAccountId, shop.accountId), eq(businessTransactions.type, "refund")))
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({ direction: "debit", amountCents: 12_500 })
    const trail = await db.select().from(logs).where(and(eq(logs.targetType, "payment_link"), eq(logs.targetId, link.id), eq(logs.action, "payment_link.payment.refund")))
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ actorId: admin.id, walletType: "PROFESSIONAL", holderId: shop.businessId })

    // Rejouer la confirmation d'un paiement remboursé ne le recrédite jamais.
    await visitor.publicPayments.confirm({ reference: started.reference })
    expect(await balanceOf(shop.accountId)).toBe(0)
  })

  it("revérifier un paiement (réconciliation) est idempotent et journalisé", async () => {
    const admin = await makeStaff("admin")
    const shop = await company(admin)
    const link = await newLink(shop.owner, shop.businessId, shop.accountId)
    const visitor = callerFor(null, freshIp())
    const started = await visitor.publicPayments.start(startInput(link.slug))
    await visitor.publicPayments.simPay({ reference: started.reference, cardNumber: GOOD_CARD })

    const once = await callerFor(admin).admin.paymentLinks.reconcile({ reference: started.reference })
    const twice = await callerFor(admin).admin.paymentLinks.reconcile({ reference: started.reference })
    expect(once.status).toBe("succeeded")
    expect(twice.status).toBe("succeeded")
    expect(await balanceOf(shop.accountId)).toBe(12_500)
    await expect(callerFor(admin).admin.paymentLinks.reconcile({ reference: "PLP-INCONNU-000000" })).rejects.toThrow(/introuvable/)
  })
})
