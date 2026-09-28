/**
 * Rôles plateforme (colonne `users.role`). Correspondance avec le RBAC métier (auth/rbac.ts) :
 *   super_admin → SUPER_ADMIN · admin → ADMIN · account_manager → ACCOUNT_MANAGER · agent → SUPPORT · user → titulaire de wallet.
 * `agent` garde son nom en base : renommer la valeur casserait les données existantes et 90 appels sans bénéfice.
 */
export type Role = "super_admin" | "admin" | "account_manager" | "agent" | "user"

export const STAFF_ROLES: readonly Role[] = ["super_admin", "admin", "account_manager", "agent"]

/** Vrai pour ADMIN et SUPER_ADMIN : les administrateurs plateforme. */
export function isAdminRole(role: Role): boolean {
  return role === "admin" || role === "super_admin"
}

/** Vrai pour tout membre de l'équipe (tout sauf un titulaire de wallet). */
export function isStaffRole(role: Role): boolean {
  return role !== "user"
}

/**
 * Ce que la future couche API (tRPC, étape 7) injectera dans chaque appel
 * de service, déduit du token vérifié — jamais un paramètre libre fourni
 * par le client (Sprint 4 §5 : « toujours déduit du token »).
 */
export interface Actor {
  id: number
  role: Role
  /** Vrai tant que l'utilisateur n'a pas remplacé son mot de passe temporaire : seul `auth.changePassword` reste permis. */
  mustChangePassword?: boolean
}

export class ForbiddenError extends Error {
  constructor(message = "Action non autorisée pour ce rôle.") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends Error {
  constructor(message = "Ressource introuvable.") {
    super(message)
    this.name = "NotFoundError"
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Lève ForbiddenError si l'acteur n'a pas un rôle autorisé.
 * Hiérarchie : SUPER_ADMIN satisfait toute exigence « admin » (il est un administrateur avec des droits système en plus).
 * Aucune autre équivalence : `account_manager` ne satisfait ni « admin » ni « agent » (son accès dépend des wallets qui lui sont attribués).
 */
export function requireRole(actor: Actor, ...roles: Role[]): void {
  if (roles.includes(actor.role)) return
  if (actor.role === "super_admin" && roles.includes("admin")) return
  throw new ForbiddenError(`Rôle "${actor.role}" non autorisé — requiert : ${roles.join(", ")}.`)
}

/**
 * Autorise si l'acteur est admin, OU un rôle listé, OU si l'acteur EST la
 * ressource ciblée (ownerId). C'est la garde utilisée par tout `*Mine`/
 * `getMe` — ex: un utilisateur peut lire son propre wallet, jamais celui
 * d'un autre (Sprint 5 §12, dernière ligne de la matrice).
 */
export function requireSelfOrRole(actor: Actor, ownerId: number, ...roles: Role[]): void {
  if (actor.id === ownerId) return
  requireRole(actor, ...roles)
}
