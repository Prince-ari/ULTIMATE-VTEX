import { describe, expect, it } from "vitest"
import { db } from "../db/client"
import { rateLimitBuckets } from "../db/schema"
import { checkRateLimit, cleanupExpiredBuckets, RateLimitError, _resetRateLimitsForTests } from "./rateLimit"

describe("checkRateLimit", () => {
  it("autorise jusqu'à la limite, puis rejette", async () => {
    await _resetRateLimitsForTests(db)
    const key = "test-key-1"
    for (let i = 0; i < 5; i++) {
      await expect(checkRateLimit(db, key, 5, 60_000)).resolves.not.toThrow()
    }
    await expect(checkRateLimit(db, key, 5, 60_000)).rejects.toThrow(RateLimitError)
  })

  it("des clés différentes ont des compteurs indépendants", async () => {
    await _resetRateLimitsForTests(db)
    for (let i = 0; i < 5; i++) await checkRateLimit(db, "key-a", 5, 60_000)
    await expect(checkRateLimit(db, "key-b", 5, 60_000)).resolves.not.toThrow()
  })

  it("l'erreur porte un délai d'attente positif", async () => {
    await _resetRateLimitsForTests(db)
    const key = "test-key-2"
    for (let i = 0; i < 3; i++) await checkRateLimit(db, key, 3, 60_000)
    try {
      await checkRateLimit(db, key, 3, 60_000)
      throw new Error("aurait dû lever RateLimitError")
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      expect((err as RateLimitError).retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it("la fenêtre expirée réinitialise le compteur", async () => {
    await _resetRateLimitsForTests(db)
    const key = "test-key-3"
    // Les fenêtres de production sont au moins de l'ordre de la seconde. Le
    // pilote MySQL peut sérialiser un paramètre Date sans millisecondes selon
    // sa configuration ; une horloge alignée sur la seconde évite donc un
    // faux négatif tout en vérifiant la réinitialisation métier.
    const start = new Date("2026-01-01T00:00:00.000Z")
    await checkRateLimit(db, key, 1, 1_000, start)
    await expect(checkRateLimit(db, key, 1, 1_000, start)).rejects.toThrow(RateLimitError)
    await expect(checkRateLimit(db, key, 1, 1_000, new Date(start.getTime() + 1_001))).resolves.not.toThrow()
  })

  it("compteur correct sous requêtes concurrentes (verrouillage FOR UPDATE)", async () => {
    await _resetRateLimitsForTests(db)
    const key = "test-key-concurrent"
    // 10 tentatives strictement simultanées sur la même clé — sans
    // verrouillage correct, le compteur final serait inférieur à 10.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => checkRateLimit(db, key, 10, 60_000)),
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10)
    await expect(checkRateLimit(db, key, 10, 60_000)).rejects.toThrow(RateLimitError)
  })
})

describe("cleanupExpiredBuckets", () => {
  it("supprime les entrées expirées, laisse les actives intactes", async () => {
    await _resetRateLimitsForTests(db)
    const now = new Date()
    await db.insert(rateLimitBuckets).values([
      { bucketKey: "expired-1", count: 5, resetsAt: new Date(now.getTime() - 60_000) },
      { bucketKey: "expired-2", count: 3, resetsAt: new Date(now.getTime() - 1_000) },
      { bucketKey: "still-active", count: 2, resetsAt: new Date(now.getTime() + 60_000) },
    ])

    await cleanupExpiredBuckets(db)

    const remaining = await db.select().from(rateLimitBuckets)
    expect(remaining.map((r) => r.bucketKey)).toEqual(["still-active"])
  })

  it("ne plante pas si la table est déjà vide", async () => {
    await _resetRateLimitsForTests(db)
    await expect(cleanupExpiredBuckets(db)).resolves.not.toThrow()
  })
})
