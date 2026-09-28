/**
 * Rôles plateforme côté Dashboard. Ces règles ne servent QU'À masquer des commandes inutiles : la vérification qui fait foi est
 * faite par le serveur (packages/core/src/auth/rbac.ts) et refuse toute action non autorisée, quelle que soit l'interface.
 */
export type PlatformRole = "super_admin" | "admin" | "account_manager" | "agent" | "user"

export const ROLE_LABEL: Record<PlatformRole, string> = {
  super_admin: "Super-administrateur",
  admin: "Administrateur",
  account_manager: "Gestionnaire de compte",
  agent: "Support",
  user: "Titulaire",
}

/** Rôles qui peuvent ouvrir le Dashboard. Un ACCOUNT_MANAGER n'y voit que son portefeuille et ses suggestions (le serveur borne le reste). */
export function canUseDashboard(role: PlatformRole): boolean {
  return role === "super_admin" || role === "admin" || role === "agent" || role === "account_manager"
}

/** Page d'accueil d'un gestionnaire de compte, et seules pages qui lui sont proposées (miroir de ses permissions serveur). */
export const MANAGER_HOME = "/portefeuille"
const MANAGER_PATHS = ["/portefeuille", "/suggestions", "/documents", "/change-password"]

export function isManagerPath(pathname: string): boolean {
  return MANAGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/** Une entrée de navigation est-elle proposée à ce rôle ? `null` (aperçu local) : tout, sauf le portefeuille réservé aux gestionnaires. */
export function navVisible(role: PlatformRole | null | undefined, href: string): boolean {
  if (role === "account_manager") return isManagerPath(href)
  return href !== MANAGER_HOME
}

export function isAdmin(role: PlatformRole | undefined): boolean {
  return role === "super_admin" || role === "admin"
}

const ADMIN_ASSIGNABLE: PlatformRole[] = ["user", "agent", "account_manager"]

/** Rôles que `actor` peut attribuer à `target` (miroir de assertCanAssignRole côté serveur). */
export function assignableRoles(actor: { id: number; role: PlatformRole }, target: { id: number; role: PlatformRole }): PlatformRole[] {
  if (actor.id === target.id) return []
  if (actor.role === "super_admin") return ["super_admin", "admin", "account_manager", "agent", "user"].filter((role) => role !== target.role) as PlatformRole[]
  if (actor.role === "admin") {
    if (target.role === "admin" || target.role === "super_admin") return []
    return ADMIN_ASSIGNABLE.filter((role) => role !== target.role)
  }
  return []
}

/** Un compte privilégié n'est géré (suspension, réinitialisation…) que par un SUPER_ADMIN. */
export function canManageTarget(actor: { id: number; role: PlatformRole }, target: { id: number; role: PlatformRole }): boolean {
  if (!isAdmin(actor.role)) return false
  if (actor.id === target.id) return false
  if (target.role === "admin" || target.role === "super_admin") return actor.role === "super_admin"
  return true
}
