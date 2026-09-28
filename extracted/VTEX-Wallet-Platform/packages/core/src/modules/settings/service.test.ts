import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { makeUser } from "../../test/fixtures"
import { getPublicSettings, getAdminSettings, updateSettings } from "./service"
import { ForbiddenError, ValidationError } from "../../auth/permissions"

describe("settings", () => {
  it("getPublicSettings ne renvoie que les champs publics", async () => {
    const view = await getPublicSettings(db)
    expect(view).toHaveProperty("platformName")
    expect(view).not.toHaveProperty("supportEmail") // pas dans PUBLIC_FIELDS
  })

  it("getAdminSettings renvoie tous les champs pour un admin", async () => {
    const admin = await makeUser({ role: "admin" })
    const view = await getAdminSettings(db, admin.actor)
    expect(view).toHaveProperty("supportEmail")
    expect(view).toHaveProperty("platformName")
  })

  it("getAdminSettings refuse un non-admin (nouvelle fonction dédiée — l'ancienne version unique dégradait silencieusement vers la vue publique plutôt que de refuser)", async () => {
    const u = await makeUser()
    await expect(getAdminSettings(db, u.actor)).rejects.toThrow(ForbiddenError)
  })

  it("update refusé pour un non-admin", async () => {
    const u = await makeUser()
    await expect(updateSettings(db, u.actor, { platformName: "Hack" })).rejects.toThrow(ForbiddenError)
  })

  it("activer le mode maintenance sans message échoue si aucun message existant", async () => {
    const admin = await makeUser({ role: "admin" })
    // Remet à un état connu d'abord (pas de message).
    await updateSettings(db, admin.actor, { maintenanceMode: false, maintenanceMessage: null })
    await expect(updateSettings(db, admin.actor, { maintenanceMode: true })).rejects.toThrow(ValidationError)
    // Nettoyage : on repasse en mode normal.
    await updateSettings(db, admin.actor, { maintenanceMode: false })
  })
})
