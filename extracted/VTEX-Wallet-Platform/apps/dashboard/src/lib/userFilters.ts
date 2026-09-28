export interface FilterableUser {
  firstName: string
  lastName: string
  email: string
  status: "active" | "suspended" | "deleted"
  kycVerified: boolean
}

/**
 * Logique de filtrage du module Utilisateurs, extraite du composant pour
 * être testable en isolation — le même patron (recherche texte + pill de
 * statut) se retrouve dans les 11 modules du Dashboard (Sprint 2 §0).
 */
export function filterUsers<T extends FilterableUser>(
  users: T[],
  search: string,
  filter: string,
): T[] {
  const term = search.trim().toLowerCase()

  return users.filter((u) => {
    const matchesSearch =
      term === "" || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term)

    const matchesFilter =
      filter === "all"
        ? true
        : filter === "active"
          ? u.status === "active"
          : filter === "suspended"
            ? u.status === "suspended"
            : filter === "kyc_pending"
              ? !u.kycVerified
              : true

    return matchesSearch && matchesFilter
  })
}
