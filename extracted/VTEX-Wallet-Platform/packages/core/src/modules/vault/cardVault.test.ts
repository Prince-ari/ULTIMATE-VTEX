import { randomBytes, randomInt } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { cardVault } from "../../db/schema"
import { makeUser } from "../../test/fixtures"
import { VaultIntegrityError } from "./crypto"
import { cardVaultStatus, cardVaultStatuses, clearCardSecrets, detectNetwork, luhnValid, normalizeCvv, normalizePan, normalizePin, revealCardSecrets, storeCardSecrets } from "./cardVault"

const SAVED = { ...process.env }
// Numéros de test valides (Luhn) et UNIQUES : la base de test persiste et le coffre refuse deux cartes de même numéro.
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
// Numéros publics de documentation, uniquement pour les tests purs (aucune écriture en base).
const VISA = "4111111111111111"
const MASTERCARD = "5555555555554444"
let nextId = 900_000 + Math.floor(Math.random() * 90_000)
const ref = (walletType: "PERSONAL" | "PROFESSIONAL" = "PERSONAL") => ({ walletType, cardId: nextId++ })

beforeEach(() => {
  process.env.VTEX_VAULT_KEY = randomBytes(32).toString("base64")
  delete process.env.VTEX_VAULT_KEYS
  delete process.env.VTEX_VAULT_ACTIVE_KEY
  delete process.env.VTEX_VAULT_STORE_CVV
})
afterEach(() => {
  process.env = { ...SAVED }
})

describe("validation des saisies", () => {
  it("Luhn : accepte les numéros de test, refuse une faute de frappe", () => {
    expect(luhnValid(VISA)).toBe(true)
    expect(luhnValid(MASTERCARD)).toBe(true)
    expect(luhnValid("4111111111111112")).toBe(false)
    expect(luhnValid("abcd")).toBe(false)
  })

  it("normalise le numéro (espaces, tirets) et borne les longueurs", () => {
    expect(normalizePan("4111 1111-1111 1111")).toBe(VISA)
    expect(() => normalizePan("4111")).toThrow(/12 et 19/)
    expect(() => normalizePan("4111 1111 1111 111x")).toThrow(/12 et 19/)
    expect(normalizeCvv(" 123 ")).toBe("123")
    expect(normalizeCvv("1234")).toBe("1234")
    expect(() => normalizeCvv("12")).toThrow(/3 ou 4/)
    expect(normalizePin("0042")).toBe("0042")
    expect(() => normalizePin("12345")).toThrow(/quatre chiffres/)
  })

  it("détecte le réseau d'après le préfixe", () => {
    expect(detectNetwork(VISA)).toBe("visa")
    expect(detectNetwork(MASTERCARD)).toBe("mastercard")
    expect(detectNetwork("2221000000000009")).toBe("mastercard")
    expect(detectNetwork("378282246310005")).toBe("amex")
    expect(detectNetwork("6011111111111117")).toBe("unknown")
  })
})

describe("coffre de cartes (base réelle)", () => {
  it("stocke chiffré : aucune colonne ne contient le clair ; la révélation le restitue et compte la consultation", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const card = ref()
    const pan = freshPan("4")
    await storeCardSecrets(db, card, { pan, cvv: "737", pin: "4321", setBy: admin.userId })

    const [row] = await db.select().from(cardVault).where(eq(cardVault.cardId, card.cardId))
    const raw = JSON.stringify(row)
    expect(raw).not.toContain(pan)
    expect(raw).not.toContain("737")
    expect(raw).not.toContain("4321")
    expect(row!.panFingerprint).toMatch(/^[0-9a-f]{64}$/)

    const status = await cardVaultStatus(db, card)
    expect(status).toMatchObject({ configured: true, hasPan: true, hasCvv: true, hasPin: true, revealCount: 0, lastRevealedAt: null })
    expect(JSON.stringify(status)).not.toContain(pan)

    const reader = await makeUser({ role: "super_admin" })
    expect(await revealCardSecrets(db, card, reader.userId)).toEqual({ pan, cvv: "737", pin: "4321" })
    const after = await cardVaultStatus(db, card)
    expect(after).toMatchObject({ revealCount: 1, lastRevealedBy: reader.userId })
    expect(after.lastRevealedAt).toBeInstanceOf(Date)
  })

  it("une carte sans secret se révèle vide, sans erreur ni compteur", async () => {
    const reader = await makeUser({ role: "super_admin" })
    expect(await revealCardSecrets(db, ref(), reader.userId)).toEqual({ pan: null, cvv: null, pin: null })
    expect((await cardVaultStatus(db, ref())).configured).toBe(false)
  })

  it("mise à jour partielle : un champ non fourni est conservé, `null` l'efface", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const card = ref()
    const pan = freshPan("4")
    await storeCardSecrets(db, card, { pan, cvv: "111", pin: "1111", setBy: admin.userId })
    await storeCardSecrets(db, card, { cvv: "222", setBy: admin.userId })
    expect(await revealCardSecrets(db, card, admin.userId)).toEqual({ pan, cvv: "222", pin: "1111" })
    await storeCardSecrets(db, card, { pin: null, setBy: admin.userId })
    expect(await revealCardSecrets(db, card, admin.userId)).toEqual({ pan, cvv: "222", pin: null })
    expect(await cardVaultStatus(db, card)).toMatchObject({ hasPan: true, hasCvv: true, hasPin: false })
  })

  it("refuse le même numéro sur deux cartes (index aveugle) mais autorise la même carte à le réécrire", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const a = ref()
    const b = ref("PROFESSIONAL")
    const pan = freshPan("55")
    await storeCardSecrets(db, a, { pan, setBy: admin.userId })
    await expect(storeCardSecrets(db, b, { pan, setBy: admin.userId })).rejects.toThrow(/déjà rattaché/)
    await expect(storeCardSecrets(db, a, { pan, setBy: admin.userId })).resolves.toBeUndefined()
  })

  it("un chiffré recopié sur une autre carte est rejeté à la lecture (liaison ligne/colonne)", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const a = ref()
    const b = ref()
    await storeCardSecrets(db, a, { cvv: "555", setBy: admin.userId })
    await storeCardSecrets(db, b, { cvv: "666", setBy: admin.userId })
    const [rowA] = await db.select().from(cardVault).where(eq(cardVault.cardId, a.cardId))
    await db.update(cardVault).set({ cvvEnc: rowA!.cvvEnc }).where(eq(cardVault.cardId, b.cardId))
    await expect(revealCardSecrets(db, b, admin.userId)).rejects.toThrow(VaultIntegrityError)
  })

  it("le CVV peut être interdit par configuration (PCI-DSS) sans bloquer le numéro", async () => {
    const admin = await makeUser({ role: "super_admin" })
    process.env.VTEX_VAULT_STORE_CVV = "false"
    const card = ref()
    await expect(storeCardSecrets(db, card, { pan: freshPan("4"), cvv: "123", setBy: admin.userId })).rejects.toThrow(/CVV est désactivée/)
    await expect(storeCardSecrets(db, ref(), { pan: freshPan("4"), setBy: admin.userId })).resolves.toBeUndefined()
  })

  it("efface un champ ou tout : la ligne disparaît quand tout est effacé, le numéro redevient réutilisable", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const card = ref()
    const pan = freshPan("51")
    await storeCardSecrets(db, card, { pan, cvv: "321", pin: "9876", setBy: admin.userId })
    expect(await clearCardSecrets(db, card, ["pin"])).toBe(true)
    expect(await cardVaultStatus(db, card)).toMatchObject({ hasPan: true, hasCvv: true, hasPin: false })
    expect(await clearCardSecrets(db, card)).toBe(true)
    expect((await cardVaultStatus(db, card)).configured).toBe(false)
    expect(await clearCardSecrets(db, card)).toBe(false)
    await expect(storeCardSecrets(db, ref(), { pan, setBy: admin.userId })).resolves.toBeUndefined()
  })

  it("statuts groupés : une seule requête, aucune valeur", async () => {
    const admin = await makeUser({ role: "super_admin" })
    const a = ref()
    const b = ref()
    await storeCardSecrets(db, a, { pan: freshPan("6011"), setBy: admin.userId })
    const map = await cardVaultStatuses(db, "PERSONAL", [a.cardId, b.cardId])
    expect(map.get(a.cardId)?.hasPan).toBe(true)
    expect(map.has(b.cardId)).toBe(false)
    expect((await cardVaultStatuses(db, "PERSONAL", [])).size).toBe(0)
  })
})
