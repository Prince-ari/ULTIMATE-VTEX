import { describe, expect, it } from "vitest"
import { filterUsers, type FilterableUser } from "./userFilters"

const users: FilterableUser[] = [
  { firstName: "Amara", lastName: "Diallo", email: "amara@example.com", status: "active", kycVerified: true },
  { firstName: "Fadel", lastName: "Farougou", email: "fadel@example.com", status: "suspended", kycVerified: true },
  { firstName: "Chloé", lastName: "Adjovi", email: "chloe@example.com", status: "active", kycVerified: false },
]

describe("filterUsers", () => {
  it("sans filtre ni recherche, renvoie tout le monde", () => {
    expect(filterUsers(users, "", "all")).toHaveLength(3)
  })

  it("recherche insensible à la casse", () => {
    expect(filterUsers(users, "AMARA", "all")).toHaveLength(1)
    expect(filterUsers(users, "amara", "all")[0].firstName).toBe("Amara")
  })

  it("recherche avec espaces superflus ignorés", () => {
    expect(filterUsers(users, "  Fadel  ", "all")).toHaveLength(1)
  })

  it("recherche sur le nom, prénom, ou email", () => {
    expect(filterUsers(users, "Adjovi", "all")).toHaveLength(1)
    expect(filterUsers(users, "fadel@example.com", "all")).toHaveLength(1)
  })

  it("filtre 'active' ne retourne que les comptes actifs", () => {
    const result = filterUsers(users, "", "active")
    expect(result).toHaveLength(2)
    expect(result.every((u) => u.status === "active")).toBe(true)
  })

  it("filtre 'suspended'", () => {
    expect(filterUsers(users, "", "suspended")).toHaveLength(1)
  })

  it("filtre 'kyc_pending' — inverse de kycVerified, pas du statut", () => {
    const result = filterUsers(users, "", "kyc_pending")
    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe("Chloé")
  })

  it("recherche ET filtre combinés", () => {
    expect(filterUsers(users, "Chloé", "active")).toHaveLength(1)
    expect(filterUsers(users, "Chloé", "suspended")).toHaveLength(0)
  })

  it("liste vide en entrée -> liste vide en sortie, jamais d'erreur", () => {
    expect(filterUsers([], "peu importe", "active")).toEqual([])
  })
})
