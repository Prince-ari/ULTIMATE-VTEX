import { describe, expect, it } from "vitest"
import { formatDate, formatDateTime, STATUS_BADGE, STATUS_LABEL } from "./adminFormat"

describe("formatDate / formatDateTime", () => {
  it("accepte une chaîne ISO", () => {
    expect(formatDate("2026-07-12T00:00:00Z")).toMatch(/2026/)
  })

  it("accepte un objet Date réel (ce que renvoie l'API via superjson)", () => {
    expect(formatDate(new Date("2026-07-12"))).toMatch(/2026/)
  })

  it("formatDateTime inclut l'heure, formatDate non", () => {
    const d = new Date("2026-07-12T14:30:00Z")
    expect(formatDateTime(d)).not.toBe(formatDate(d))
  })
})

/**
 * Toute valeur d'enum réellement utilisée par le schéma (Sprint 6, cf.
 * packages/core/src/db/schema.ts) et affichée quelque part dans le
 * Dashboard doit avoir un libellé français. Un statut oublié ici ne
 * plante rien visuellement (juste un badge/texte vide ou brut) — c'est
 * justement pour ça qu'un test explicite est nécessaire, l'absence de
 * crash ne suffit pas à détecter le trou.
 */
const SCHEMA_STATUS_VALUES = [
  // users.role
  "admin", "agent", "user",
  // users.status / wallets.status
  "active", "suspended", "deleted",
  // cards.status
  "frozen", "blocked",
  // cards.type
  "physical", "virtual",
  // transactions.type
  "transfer", "card_payment", "deposit", "adjustment",
  // transactions.status
  "pending", "validated", "rejected",
  // transactions.category
  "alimentation", "transport", "loisirs", "abonnements", "logement", "revenus", "p2p", "compte", "autres",
  // notifications.status
  "draft", "scheduled", "sent",
  // leads.status
  "new", "contacted", "qualified", "converted", "lost",
  // settings.defaultTheme
  "light", "dark",
  // support_tickets.status / priority
  "open", "in_progress", "resolved", "low", "normal", "high",
]

describe("STATUS_LABEL — complétude contre le schéma réel", () => {
  it.each(SCHEMA_STATUS_VALUES)("a un libellé français pour '%s'", (value) => {
    expect(STATUS_LABEL[value]).toBeDefined()
    expect(STATUS_LABEL[value]).not.toBe("")
  })
})

describe("STATUS_BADGE — cohérence avec STATUS_LABEL", () => {
  it("toute clé de STATUS_BADGE a aussi un libellé (un badge sans texte serait un bug visuel)", () => {
    for (const key of Object.keys(STATUS_BADGE)) {
      expect(STATUS_LABEL[key], `manque un libellé pour la clé de badge "${key}"`).toBeDefined()
    }
  })

  it("chaque variante de badge utilisée est une valeur valide du composant Badge", () => {
    const validVariants = ["default", "neutral", "success", "error", "warning"]
    for (const variant of Object.values(STATUS_BADGE)) {
      expect(validVariants).toContain(variant)
    }
  })
})
