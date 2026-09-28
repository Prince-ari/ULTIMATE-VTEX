import { afterEach, describe, expect, it } from "vitest"
import { assertProductionEnv } from "./env"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("assertProductionEnv", () => {
  it("passe avec une configuration valide", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    expect(() => assertProductionEnv()).not.toThrow()
  })

  it("échoue si JWT_SECRET est absent", () => {
    delete process.env.JWT_SECRET
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    expect(() => assertProductionEnv()).toThrow(/JWT_SECRET manquant/)
  })

  it("échoue si JWT_SECRET est trop court", () => {
    process.env.JWT_SECRET = "trop-court"
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    expect(() => assertProductionEnv()).toThrow(/trop court/)
  })

  it("échoue explicitement sur la valeur par défaut connue (la faille trouvée à l'audit)", () => {
    process.env.JWT_SECRET = "insecure-dev-secret"
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    expect(() => assertProductionEnv()).toThrow()
  })

  it("échoue si DATABASE_URL est absent", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    delete process.env.DATABASE_URL
    expect(() => assertProductionEnv()).toThrow(/DATABASE_URL manquant/)
  })

  it("RESEND_API_KEY absent ne bloque PAS en développement (devPeekOtp sert de contournement)", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    delete process.env.NODE_ENV
    delete process.env.RESEND_API_KEY
    expect(() => assertProductionEnv()).not.toThrow()
  })

  it("RESEND_API_KEY absent BLOQUE en production — sinon personne ne peut se connecter", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    process.env.NODE_ENV = "production"
    delete process.env.RESEND_API_KEY
    expect(() => assertProductionEnv()).toThrow(/RESEND_API_KEY manquant/)
  })

  it("EMAIL_FROM absent BLOQUE en production — aucun expéditeur de test ne doit être utilisé", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    process.env.NODE_ENV = "production"
    process.env.RESEND_API_KEY = "re_real_key"
    process.env.ALLOWED_ORIGINS = "https://wallet.example.com"
    process.env.WEBAUTHN_ORIGIN = "https://wallet.example.com"
    process.env.WEBAUTHN_RP_ID = "wallet.example.com"
    process.env.VTEX_MEDIA_S3_ENDPOINT = "http://minio:9000"
    process.env.VTEX_MEDIA_S3_ACCESS_KEY = "vtex_media_test"
    process.env.VTEX_MEDIA_S3_SECRET_KEY = "vtex_media_test_secret"
    process.env.VTEX_MEDIA_S3_BUCKET = "vtex-media"
    delete process.env.EMAIL_FROM
    expect(() => assertProductionEnv()).toThrow(/EMAIL_FROM manquant/)
  })

  it("configuration production complète passe", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    process.env.NODE_ENV = "production"
    process.env.RESEND_API_KEY = "re_real_key"
    process.env.EMAIL_FROM = "VTEX <connexion@wallet.example.com>"
    process.env.ALLOWED_ORIGINS = "https://wallet.example.com,https://admin.example.com"
    process.env.WEBAUTHN_ORIGIN = "https://wallet.example.com"
    process.env.WEBAUTHN_RP_ID = "wallet.example.com"
    process.env.VTEX_MEDIA_S3_ENDPOINT = "http://minio:9000"
    process.env.VTEX_MEDIA_S3_ACCESS_KEY = "vtex_media_test"
    process.env.VTEX_MEDIA_S3_SECRET_KEY = "vtex_media_test_secret"
    process.env.VTEX_MEDIA_S3_BUCKET = "vtex-media"
    process.env.VTEX_VAULT_KEY = Buffer.alloc(32, 7).toString("base64")
    expect(() => assertProductionEnv()).not.toThrow()
  })

  it("coffre de cartes : clé absente ou de mauvaise longueur BLOQUE en production (échec fermé)", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    process.env.NODE_ENV = "production"
    process.env.RESEND_API_KEY = "re_real_key"
    process.env.EMAIL_FROM = "VTEX <connexion@wallet.example.com>"
    process.env.ALLOWED_ORIGINS = "https://wallet.example.com"
    process.env.WEBAUTHN_ORIGIN = "https://wallet.example.com"
    process.env.WEBAUTHN_RP_ID = "wallet.example.com"
    process.env.VTEX_MEDIA_S3_ENDPOINT = "http://minio:9000"
    process.env.VTEX_MEDIA_S3_ACCESS_KEY = "vtex_media_test"
    process.env.VTEX_MEDIA_S3_SECRET_KEY = "vtex_media_test_secret"
    process.env.VTEX_MEDIA_S3_BUCKET = "vtex-media"
    delete process.env.VTEX_VAULT_KEYS
    delete process.env.VTEX_VAULT_KEY
    expect(() => assertProductionEnv()).toThrow(/VTEX_VAULT_KEYS manquant/)
    process.env.VTEX_VAULT_KEY = Buffer.from("trop-courte").toString("base64")
    expect(() => assertProductionEnv()).toThrow(/32 octets/)
    process.env.VTEX_VAULT_KEYS = `v2:${Buffer.alloc(32, 9).toString("base64")},v1:${Buffer.alloc(32, 7).toString("base64")}`
    process.env.VTEX_VAULT_ACTIVE_KEY = "v2"
    expect(() => assertProductionEnv()).not.toThrow()
  })

  it("coffre de cartes : absent ne bloque pas en développement (clé dérivée de JWT_SECRET)", () => {
    process.env.JWT_SECRET = "a".repeat(64)
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db"
    delete process.env.NODE_ENV
    delete process.env.VTEX_VAULT_KEYS
    delete process.env.VTEX_VAULT_KEY
    expect(() => assertProductionEnv()).not.toThrow()
  })
})
