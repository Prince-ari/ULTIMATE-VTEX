import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { canConvert, convertMinor, CURRENCY_SYMBOLS, floorConvertMinor, formatMinor } from "./fx"
import { SimGateway, stripeAdminStatus, stripePublicConfig, topupDailyRemaining, topupLimits, topupLimitsByCurrency } from "./gateway"

/** Clés factices : uniquement pour tester la logique de sélection de mode, jamais envoyées à Stripe. */
const FAKE_PK_TEST = "pk_test_FAKEFAKEFAKEFAKEFAKE0001"
const FAKE_SK_TEST = "sk_test_FAKEFAKEFAKEFAKEFAKE0002"
const FAKE_PK_LIVE = "pk_live_FAKEFAKEFAKEFAKEFAKE0003"
const FAKE_SK_LIVE = "sk_live_FAKEFAKEFAKEFAKEFAKE0004"

function env(values: Record<string, string>) {
  for (const key of ["STRIPE_MODE", "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_ALLOW_LIVE_CHARGES", "STRIPE_WEBHOOK_SECRET"]) vi.stubEnv(key, "")
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

describe("configuration Stripe", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "development") })
  afterEach(() => { vi.unstubAllEnvs() })

  it("sans clé valide, bascule en simulateur de développement en le disant", () => {
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_LIVE, STRIPE_SECRET_KEY: "mk_not_a_secret_key" })
    const config = stripePublicConfig()
    expect(config).toMatchObject({ enabled: true, mode: "sim", fallback: true })
    expect(config.reason).toContain("Stripe réel inactif")
  })

  it("STRIPE_MODE=real ne retombe jamais sur le simulateur", () => {
    env({ STRIPE_MODE: "real", STRIPE_PUBLISHABLE_KEY: FAKE_PK_TEST })
    expect(stripePublicConfig()).toMatchObject({ enabled: false, mode: null, fallback: false })
  })

  it("clés de test cohérentes : mode test actif sans verrou", () => {
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_TEST, STRIPE_SECRET_KEY: FAKE_SK_TEST })
    expect(stripePublicConfig()).toMatchObject({ enabled: true, mode: "test", publishableKey: FAKE_PK_TEST, fallback: false })
  })

  it("refuse une clé publique de test associée à une clé secrète live", () => {
    env({ STRIPE_MODE: "real", STRIPE_PUBLISHABLE_KEY: FAKE_PK_TEST, STRIPE_SECRET_KEY: FAKE_SK_LIVE })
    expect(stripePublicConfig().enabled).toBe(false)
  })

  it("clés live valides : débits réels verrouillés tant que STRIPE_ALLOW_LIVE_CHARGES n'est pas « true »", () => {
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_LIVE, STRIPE_SECRET_KEY: FAKE_SK_LIVE })
    expect(stripePublicConfig()).toMatchObject({ enabled: false, mode: "live" })
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_LIVE, STRIPE_SECRET_KEY: FAKE_SK_LIVE, STRIPE_ALLOW_LIVE_CHARGES: "true" })
    expect(stripePublicConfig()).toMatchObject({ enabled: true, mode: "live" })
  })

  it("le simulateur est interdit en production, même forcé", () => {
    vi.stubEnv("NODE_ENV", "production")
    env({ STRIPE_MODE: "sim" })
    expect(stripePublicConfig()).toMatchObject({ enabled: false, mode: null })
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_LIVE, STRIPE_SECRET_KEY: "invalide" })
    expect(stripePublicConfig().enabled).toBe(false)
  })

  it("le diagnostic administrateur n'expose jamais la clé secrète ni le secret de webhook (la clé publique, elle, est publique par nature)", () => {
    env({ STRIPE_PUBLISHABLE_KEY: FAKE_PK_LIVE, STRIPE_SECRET_KEY: FAKE_SK_LIVE, STRIPE_WEBHOOK_SECRET: "whsec_FAKEFAKEFAKE" })
    const serialized = JSON.stringify(stripeAdminStatus())
    expect(serialized).not.toContain(FAKE_SK_LIVE)
    expect(serialized).not.toContain("FAKEFAKEFAKEFAKEFAKE0004")
    expect(serialized).not.toContain("whsec_FAKEFAKEFAKE")
    expect(stripeAdminStatus()).toMatchObject({ secretKeyKind: "sk", hasWebhookSecret: true, realKeysUsable: true })
  })
})

describe("plafonds de recharge", () => {
  it("wallet perso : 2 000 € par recharge ; Wallet Pro : 5 000 € par recharge ; 5 000 € par 24 h sur les deux", () => {
    expect(topupLimits("EUR", "wallet")).toEqual({ minCents: 500, maxCents: 200_000, dailyMaxCents: 500_000 })
    expect(topupLimits("eur", "business")).toEqual({ minCents: 1000, maxCents: 500_000, dailyMaxCents: 500_000 })
    expect(topupLimits("XPF", "business").maxCents).toBeGreaterThan(topupLimits("XPF", "wallet").maxCents)
    expect(topupLimits("XPF", "wallet").dailyMaxCents).toBe(topupLimits("XPF", "business").dailyMaxCents)
  })

  it("le franc Pacifique reçoit l'équivalent à la parité fixe, arrondi vers le bas (jamais au-dessus du plafond en euros)", () => {
    const perso = topupLimits("XPF", "wallet")
    expect(perso.maxCents).toBe(238_663)
    expect(perso.dailyMaxCents).toBe(596_658)
    expect(convertMinor(perso.maxCents, "XPF", "EUR")).toBeLessThanOrEqual(200_000)
    expect(convertMinor(perso.maxCents + 1, "XPF", "EUR")).toBeGreaterThanOrEqual(200_000)
    const pro = topupLimits("XPF", "business")
    expect(pro.maxCents).toBe(596_658)
    expect(convertMinor(pro.maxCents, "XPF", "EUR")).toBeLessThanOrEqual(500_000)
    expect(convertMinor(pro.maxCents + 1, "XPF", "EUR")).toBeGreaterThanOrEqual(500_000)
  })

  it("le diagnostic administrateur expose les plafonds de chaque portefeuille", () => {
    const { limits } = stripeAdminStatus()
    expect(limits.wallet).toEqual({ eur: { perRechargeCents: 200_000, dailyCents: 500_000 }, xpf: { perRechargeCents: 238_663, dailyCents: 596_658 } })
    expect(limits.business).toEqual({ eur: { perRechargeCents: 500_000, dailyCents: 500_000 }, xpf: { perRechargeCents: 596_658, dailyCents: 596_658 } })
  })

  it("le reste du plafond quotidien suit les recharges déjà faites, dans la devise demandée", () => {
    expect(topupDailyRemaining("EUR", 0)).toBe(500_000)
    expect(topupDailyRemaining("EUR", 320_000)).toBe(180_000)
    expect(topupDailyRemaining("XPF", 320_000)).toBe(floorConvertMinor(180_000, "EUR", "XPF"))
    expect(topupDailyRemaining("EUR", 900_000)).toBe(0)
    const all = topupLimitsByCurrency("wallet", 320_000)
    expect(all.EUR).toMatchObject({ maxCents: 200_000, dailyRemainingCents: 180_000, effectiveMaxCents: 180_000 })
    expect(all.XPF!.effectiveMaxCents).toBe(Math.min(238_663, all.XPF!.dailyRemainingCents))
    // Wallet Pro : 5 000 € par recharge, mais jamais plus que ce qui reste des 5 000 € du jour.
    expect(topupLimitsByCurrency("business", 0).EUR).toMatchObject({ maxCents: 500_000, dailyRemainingCents: 500_000, effectiveMaxCents: 500_000 })
    expect(topupLimitsByCurrency("business", 320_000).EUR).toMatchObject({ maxCents: 500_000, dailyRemainingCents: 180_000, effectiveMaxCents: 180_000 })
  })
})

describe("parité fixe EUR ↔ XPF", () => {
  it("convertit dans les deux sens, sans centimes côté XPF", () => {
    expect(convertMinor(100_000, "EUR", "XPF")).toBe(119_332) // 1 000 € → 119 332 ₣
    expect(convertMinor(119_332, "XPF", "EUR")).toBe(100_000)
    expect(convertMinor(500, "EUR", "EUR")).toBe(500)
  })

  it("le dollar n'est jamais converti", () => {
    expect(canConvert("USD", "EUR")).toBe(false)
    expect(() => convertMinor(1000, "USD", "XPF")).toThrow()
  })

  it("affiche le franc Pacifique avec son signe ₣", () => {
    expect(formatMinor(119_332, "XPF")).toMatch(/^119\s332 ₣$/u)
    expect(formatMinor(123_456, "EUR")).toMatch(/1\s234,56 €$/u)
    expect(CURRENCY_SYMBOLS.XPF).toBe("₣")
  })
})

describe("simulateur de paiement", () => {
  const gateway = new SimGateway()
  const create = (amountCents = 1000) => gateway.createIntent({ amountCents, currency: "eur", description: "test", metadata: { scope: "wallet" }, idempotencyKey: `t:${crypto.randomUUID()}` })

  it("la carte 4242 réussit et mémorise la marque et les 4 derniers chiffres", async () => {
    const intent = await create()
    expect(gateway.pay(intent.id, "4242 4242 4242 4242")).toMatchObject({ status: "succeeded" })
    const after = await gateway.retrieveIntent(intent.id)
    expect(after).toMatchObject({ status: "succeeded", amountReceivedCents: 1000, cardBrand: "visa", cardLast4: "4242" })
  })

  it("la carte 3D Secure exige une validation puis réussit", async () => {
    const intent = await create()
    expect(gateway.pay(intent.id, "4000 0027 6000 3184").status).toBe("requires_action")
    expect((await gateway.retrieveIntent(intent.id)).amountReceivedCents).toBe(0)
    expect(gateway.authenticate(intent.id).status).toBe("succeeded")
  })

  it("les refus ne créditent rien et expliquent la cause", async () => {
    const intent = await create()
    expect(gateway.pay(intent.id, "4000 0000 0000 9995")).toMatchObject({ status: "requires_payment_method", failureCode: "insufficient_funds" })
    expect((await gateway.retrieveIntent(intent.id)).amountReceivedCents).toBe(0)
  })

  it("un numéro qui échoue au contrôle de Luhn est rejeté", async () => {
    const intent = await create()
    expect(gateway.pay(intent.id, "1234 5678 9012 3456")).toMatchObject({ status: "requires_payment_method", failureCode: "incorrect_number" })
  })

  it("une même clé d'idempotence renvoie la même intention", async () => {
    const key = `t:${crypto.randomUUID()}`
    const input = { amountCents: 2000, currency: "EUR", description: "t", metadata: {}, idempotencyKey: key }
    const [a, b] = [await gateway.createIntent(input), await gateway.createIntent(input)]
    expect(b.id).toBe(a.id)
  })

  it("une recharge terminée ne peut pas être payée deux fois", async () => {
    const intent = await create()
    gateway.pay(intent.id, "4242 4242 4242 4242")
    expect(() => gateway.pay(intent.id, "4242 4242 4242 4242")).toThrow()
  })
})
