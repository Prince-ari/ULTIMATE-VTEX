import { ForbiddenError, isAdminRole, type Actor, type Role } from "./permissions"

/**
 * RBAC central : UNE matrice rôle → permissions, vérifiée côté serveur (jamais par le frontend).
 *
 * Décision produit : un ADMIN peut ouvrir n'importe quel wallet ou utilisateur par son identifiant (console d'administration).
 * Ce n'est pas un contournement : la permission est vérifiée ici, chaque consultation d'une fiche est journalisée, et les
 * actions sensibles gardent leurs propres garde-fous (motif, idempotence, confirmation).
 * Un ACCOUNT_MANAGER n'a aucun accès transverse : il ne lit que les wallets qui lui sont attribués (`portfolio.read`) et ne leur envoie des suggestions que dans ce périmètre.
 */
export const PERMISSIONS = [
  "users.read",
  "users.create",
  "users.update",
  "users.suspend",
  "users.reset_credentials",
  "users.unlock",
  "staff.assign_role",
  "staff.assign_privileged_role",
  "wallets.read",
  "wallets.create",
  "wallets.manage",
  "companies.read",
  "companies.create",
  "companies.manage",
  "cards.read",
  "cards.manage",
  "cards.vault.write",
  "cards.reveal",
  "banking.read",
  "banking.reveal",
  "banking.manage",
  "paymentlinks.read",
  "paymentlinks.manage",
  "apikeys.read",
  "apikeys.manage",
  "managers.read",
  "managers.manage",
  "suggestions.read",
  "suggestions.send",
  "portfolio.read",
  "documents.read",
  "documents.send",
  "documents.review",
  "documents.archive",
  "audit.read",
  "system.manage",
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL: readonly Permission[] = PERMISSIONS

/**
 * Permissions réservées au SUPER_ADMIN : configuration système, comptes privilégiés et données de carte en clair
 * (saisie et révélation du numéro / CVV / PIN). Un ADMIN voit l'état masqué des cartes, jamais les valeurs.
 */
const SUPER_ADMIN_ONLY: readonly Permission[] = ["system.manage", "staff.assign_privileged_role", "cards.vault.write", "cards.reveal"]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: ALL,
  admin: ALL.filter((permission) => !SUPER_ADMIN_ONLY.includes(permission)),
  // SUPPORT : lecture seule sur les fiches.
  agent: ["users.read", "wallets.read", "companies.read", "cards.read", "banking.read", "paymentlinks.read", "apikeys.read", "managers.read", "suggestions.read", "suggestions.send", "documents.read"],
  // Périmètre = wallets attribués (table `manager_assignments`), jamais un accès transverse.
  account_manager: ["suggestions.read", "suggestions.send", "portfolio.read", "documents.read", "documents.send"],
  user: [],
}

export function can(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role].includes(permission)
}

export function requirePermission(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new ForbiddenError(`Permission requise : ${permission} (rôle « ${actor.role} »).`)
  }
}

const PRIVILEGED_ROLES: readonly Role[] = ["super_admin", "admin"]

/**
 * Règles d'attribution des rôles (anti-escalade) :
 *  - personne ne change son propre rôle ;
 *  - ADMIN ne peut attribuer que user / agent / account_manager, et seulement à des comptes qui ont déjà l'un de ces rôles ;
 *  - seul SUPER_ADMIN attribue ou retire `admin` / `super_admin`.
 */
export function assertCanAssignRole(actor: Pick<Actor, "id" | "role">, target: { id: number; role: Role }, nextRole: Role): void {
  if (actor.id === target.id) throw new ForbiddenError("Vous ne pouvez pas modifier votre propre rôle.")
  requirePermission(actor, "staff.assign_role")
  const touchesPrivileged = PRIVILEGED_ROLES.includes(target.role) || PRIVILEGED_ROLES.includes(nextRole)
  if (touchesPrivileged) requirePermission(actor, "staff.assign_privileged_role")
  else if (!isAdminRole(actor.role)) throw new ForbiddenError("Seul un administrateur peut attribuer un rôle.")
}
