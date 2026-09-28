import { eq } from "drizzle-orm"

import type { Db } from "../../db/client"
import { settings } from "../../db/schema"
import type { Actor } from "../../auth/permissions"
import { requireRole, ValidationError, NotFoundError } from "../../auth/permissions"
import { logAction } from "../journal/service"

const PUBLIC_FIELDS = ["platformName", "logoUrl", "defaultTheme", "maintenanceMode", "maintenanceMessage"] as const

/**
 * settings.get — champs publics uniquement, aucune authentification
 * requise (nécessaire au Wallet avant connexion, pour afficher le nom
 * de la plateforme et le mode maintenance).
 */
export async function getPublicSettings(db: Db) {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  if (!row) throw new NotFoundError("Configuration plateforme non initialisée.")

  const publicView: Record<(typeof PUBLIC_FIELDS)[number], unknown> = {} as never
  for (const field of PUBLIC_FIELDS) publicView[field] = row[field]
  return publicView
}

/**
 * settings.getAdmin — configuration complète, admin uniquement.
 *
 * Séparée de `getPublicSettings` plutôt qu'une seule fonction au
 * comportement conditionnel selon le rôle : cette dernière approche
 * (une version antérieure) renvoyait un type union selon l'acteur,
 * forçant les appelants typés (le Dashboard) à un cast non sûr
 * (`as PlatformSettings`) qui contournait la vérification TypeScript —
 * trouvé lors d'un audit de dette technique. Deux fonctions au type de
 * retour propre valent mieux qu'une avec un type conditionnel.
 */
export async function getAdminSettings(db: Db, actor: Actor) {
  requireRole(actor, "admin")
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  if (!row) throw new NotFoundError("Configuration plateforme non initialisée.")
  return row
}

/** settings.update — admin uniquement. */
export async function updateSettings(
  db: Db,
  actor: Actor,
  patch: Partial<{
    platformName: string
    logoUrl: string | null
    defaultTheme: "light" | "dark"
    maintenanceMode: boolean
    maintenanceMessage: string | null
    supportEmail: string
    statsActiveUsersOverride: number | null
    statsPlatformBalanceCentsOverride: number | null
    statsTransactionsThisMonthOverride: number | null
  }>,
) {
  requireRole(actor, "admin")
  if (patch.maintenanceMode && !patch.maintenanceMessage) {
    const [current] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
    if (!current?.maintenanceMessage) {
      throw new ValidationError("Un message de maintenance est obligatoire si le mode maintenance est activé.")
    }
  }
  await db.update(settings).set(patch).where(eq(settings.id, 1))
  await logAction(db, actor.id, "settings.update", "settings", 1, patch)
}
