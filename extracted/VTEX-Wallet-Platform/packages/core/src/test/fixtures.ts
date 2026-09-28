import { randomUUID } from "node:crypto"

import { db } from "../db/client"
import { users } from "../db/schema"
import { hashPassword } from "../auth/password"
import type { Actor, Role } from "../auth/permissions"

/**
 * Fixture générique — crée uniquement un utilisateur transverse. Les tests
 * d’un domaine produit doivent fournir leurs propres fixtures complémentaires
 * afin que le noyau reste indépendant de leurs données métier.
 */
export async function makeUser(overrides: Partial<{ role: Role }> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const [inserted] = await db.insert(users).values({
    firstName: "Test",
    lastName: suffix,
    email: `test-${suffix}@test.local`,
    passwordHash: hashPassword("testpass123"),
    role: overrides.role ?? "user",
    status: "active",
    kycVerified: true,
  })
  const userId = inserted.insertId
  const actor: Actor = { id: userId, role: overrides.role ?? "user" }
  return { userId, actor }
}
