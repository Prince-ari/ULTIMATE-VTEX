import { randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VaultIntegrityError, VaultUnavailableError, activeVaultKeyId, blindIndex, decryptSecret, encryptSecret } from "./crypto"

const key = () => randomBytes(32).toString("base64")
const SAVED = { ...process.env }

beforeEach(() => {
  delete process.env.VTEX_VAULT_KEYS
  delete process.env.VTEX_VAULT_KEY
  delete process.env.VTEX_VAULT_ACTIVE_KEY
  delete process.env.VTEX_VAULT_INDEX_KEY
})
afterEach(() => {
  process.env = { ...SAVED }
})

describe("coffre — chiffrement AES-256-GCM", () => {
  it("chiffre puis déchiffre ; le clair n'apparaît pas dans le chiffré ; deux chiffrements du même clair diffèrent (IV aléatoire)", () => {
    process.env.VTEX_VAULT_KEY = key()
    const a = encryptSecret("4111111111111111", "card:PERSONAL:1:pan")
    const b = encryptSecret("4111111111111111", "card:PERSONAL:1:pan")
    expect(a.blob).not.toContain("4111111111111111")
    expect(a.blob).not.toBe(b.blob)
    expect(a.keyId).toBe("v1")
    expect(decryptSecret(a.blob, "card:PERSONAL:1:pan")).toBe("4111111111111111")
  })

  it("le contexte (AAD) est authentifié : un chiffré déplacé vers une autre carte ou un autre champ est refusé", () => {
    process.env.VTEX_VAULT_KEY = key()
    const { blob } = encryptSecret("123", "card:PERSONAL:1:cvv")
    expect(() => decryptSecret(blob, "card:PERSONAL:2:cvv")).toThrow(VaultIntegrityError)
    expect(() => decryptSecret(blob, "card:PERSONAL:1:pin")).toThrow(VaultIntegrityError)
    expect(() => decryptSecret(blob, "card:PROFESSIONAL:1:cvv")).toThrow(VaultIntegrityError)
  })

  it("détecte toute altération du chiffré", () => {
    process.env.VTEX_VAULT_KEY = key()
    const { blob } = encryptSecret("4242", "card:PERSONAL:9:pin")
    const flipped = `${blob.slice(0, -2)}${blob.endsWith("A") ? "B" : "A"}${blob.slice(-1)}`
    expect(() => decryptSecret(flipped, "card:PERSONAL:9:pin")).toThrow(VaultIntegrityError)
    expect(() => decryptSecret("n'importe quoi", "card:PERSONAL:9:pin")).toThrow(VaultIntegrityError)
    expect(() => decryptSecret("v1.AAAA", "card:PERSONAL:9:pin")).toThrow(VaultIntegrityError)
  })

  it("rotation : la clé active chiffre, les anciennes clés déchiffrent encore", () => {
    const oldKey = key()
    process.env.VTEX_VAULT_KEYS = `v1:${oldKey}`
    const before = encryptSecret("999", "card:PERSONAL:3:cvv")
    process.env.VTEX_VAULT_KEYS = `v2:${key()},v1:${oldKey}`
    process.env.VTEX_VAULT_ACTIVE_KEY = "v2"
    const after = encryptSecret("999", "card:PERSONAL:3:cvv")
    expect(activeVaultKeyId()).toBe("v2")
    expect(after.keyId).toBe("v2")
    expect(decryptSecret(before.blob, "card:PERSONAL:3:cvv")).toBe("999")
    expect(decryptSecret(after.blob, "card:PERSONAL:3:cvv")).toBe("999")
    // Sans l'ancienne clé, l'ancien chiffré n'est plus lisible (et le dit clairement).
    process.env.VTEX_VAULT_KEYS = `v2:${key()}`
    expect(() => decryptSecret(before.blob, "card:PERSONAL:3:cvv")).toThrow(/v1/)
  })

  it("rejette une clé de mauvaise longueur ou une clé active absente du trousseau", () => {
    process.env.VTEX_VAULT_KEY = Buffer.from("trop-courte").toString("base64")
    expect(() => encryptSecret("1", "x")).toThrow(VaultUnavailableError)
    process.env.VTEX_VAULT_KEY = key()
    process.env.VTEX_VAULT_ACTIVE_KEY = "inconnue"
    expect(() => encryptSecret("1", "x")).toThrow(/inconnue/)
  })

  it("production sans clé : échec fermé, jamais de clé de repli", () => {
    process.env.NODE_ENV = "production"
    process.env.JWT_SECRET = "x".repeat(40)
    expect(() => encryptSecret("1", "x")).toThrow(VaultUnavailableError)
  })

  it("développement sans clé : clé dérivée de JWT_SECRET, stable entre appels", () => {
    process.env.NODE_ENV = "test"
    process.env.JWT_SECRET = "y".repeat(40)
    const sealed = encryptSecret("2024", "card:PERSONAL:5:pin")
    expect(sealed.keyId).toBe("dev")
    expect(decryptSecret(sealed.blob, "card:PERSONAL:5:pin")).toBe("2024")
  })

  it("index aveugle : déterministe, distinct par usage, stable après rotation de la clé de chiffrement", () => {
    const oldKey = key()
    const indexKey = key()
    process.env.VTEX_VAULT_KEYS = `v1:${oldKey}`
    process.env.VTEX_VAULT_INDEX_KEY = indexKey
    const first = blindIndex("4111111111111111", "card-pan")
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(blindIndex("4111111111111111", "card-pan")).toBe(first)
    expect(blindIndex("4111111111111111", "autre-usage")).not.toBe(first)
    expect(blindIndex("4111111111111112", "card-pan")).not.toBe(first)
    process.env.VTEX_VAULT_KEYS = `v2:${key()},v1:${oldKey}`
    process.env.VTEX_VAULT_ACTIVE_KEY = "v2"
    expect(blindIndex("4111111111111111", "card-pan")).toBe(first)
  })
})
