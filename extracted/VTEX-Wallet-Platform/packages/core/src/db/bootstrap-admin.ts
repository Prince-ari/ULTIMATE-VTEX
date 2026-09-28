import "dotenv/config"
import { eq } from "drizzle-orm"

import { hashPassword } from "../auth/password"
import { db } from "./client"
import { users } from "./schema"

function configuredValue(name: string) {
  const value = process.env[name]?.trim()
  return value || null
}

async function bootstrapInitialAdmin() {
  const email = configuredValue("VTEX_INITIAL_ADMIN_EMAIL")?.toLowerCase()
  const password = process.env.VTEX_INITIAL_ADMIN_PASSWORD
  const firstName = configuredValue("VTEX_INITIAL_ADMIN_FIRST_NAME") ?? "Administrateur"
  const lastName = configuredValue("VTEX_INITIAL_ADMIN_LAST_NAME") ?? "VTEX"

  if (!email && !password) {
    console.info("[bootstrap-admin] Aucun compte administrateur initial configuré ; étape ignorée.")
    return
  }
  if (!email || !password) {
    throw new Error("VTEX_INITIAL_ADMIN_EMAIL et VTEX_INITIAL_ADMIN_PASSWORD doivent être définis ensemble.")
  }
  if (!email.includes("@")) throw new Error("VTEX_INITIAL_ADMIN_EMAIL est invalide.")
  if (password.length < 12) throw new Error("VTEX_INITIAL_ADMIN_PASSWORD doit contenir au moins 12 caractères.")

  // Le compte initial est le SUPER_ADMIN de la plateforme (seul rôle qui attribue admin/super_admin et gère le système).
  const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    if (existing.role !== "super_admin") {
      const [otherSuperAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1)
      // Promotion uniquement s'il n'existe encore aucun SUPER_ADMIN : jamais d'élévation de privilège silencieuse ensuite.
      if (!otherSuperAdmin) {
        await db.update(users).set({ role: "super_admin", status: "active", updatedAt: new Date() }).where(eq(users.id, existing.id))
        console.info("[bootstrap-admin] Le compte existant a reçu le rôle SUPER_ADMIN.")
      } else {
        console.info("[bootstrap-admin] Un SUPER_ADMIN existe déjà ; le rôle du compte n’est pas modifié.")
      }
    } else {
      console.info("[bootstrap-admin] Le compte SUPER_ADMIN existe déjà ; aucun mot de passe n’est remplacé.")
    }
    return
  }

  await db.insert(users).values({
    email,
    passwordHash: hashPassword(password),
    firstName,
    lastName,
    role: "super_admin",
    status: "active",
    kycVerified: true,
  })
  console.info("[bootstrap-admin] Compte SUPER_ADMIN initial créé.")
}

bootstrapInitialAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[bootstrap-admin] Échec de l’amorçage administrateur.", error)
    process.exit(1)
  })
