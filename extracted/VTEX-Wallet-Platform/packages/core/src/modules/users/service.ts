import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm"

import type { Db } from "../../db/client"
import { users } from "../../db/schema"
import type { Actor, Role } from "../../auth/permissions"
import { requireRole, ValidationError, NotFoundError, ForbiddenError } from "../../auth/permissions"
import { assertCanAssignRole, requirePermission } from "../../auth/rbac"
import { assertPasswordPolicy, generateTemporaryPassword, hashPassword } from "../../auth/password"
import { revokeAllSessions } from "../../auth/session"
import { logAction } from "../journal/service"

/**
 * Colonnes sûres pour toute lecture exposée au client — exclut
 * `passwordHash` explicitement. Les lectures internes (vérification email
 * dupliqué, machine à états) peuvent utiliser `db.select()` complet
 * puisqu'elles ne renvoient jamais le résultat au client.
 */
const safeUserColumns = {
  id: users.id,
  email: users.email,
  phone: users.phone,
  firstName: users.firstName,
  lastName: users.lastName,
  avatarUrl: users.avatarUrl,
  role: users.role,
  status: users.status,
  kycVerified: users.kycVerified,
  lastActiveAt: users.lastActiveAt,
  mustChangePassword: users.mustChangePassword,
  lockedUntil: users.lockedUntil,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
}

export { safeUserColumns }

export interface CreateUserInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  temporaryPassword: string
  /** Rôle du nouveau compte (défaut `user`). Un rôle d'équipe exige la permission d'attribution correspondante. */
  role?: Role
  status?: "active" | "suspended"
  /** Défaut faux pour la création historique (`users.create`) ; les créations depuis le Dashboard passent à vrai. */
  mustChangePassword?: boolean
  /** Durée de validité du mot de passe temporaire (heures) lorsque `mustChangePassword` est vrai. Défaut : 72 h. */
  temporaryPasswordTtlHours?: number
}

const PRIVILEGED_ROLES: readonly Role[] = ["super_admin", "admin"]
export const TEMP_PASSWORD_DEFAULT_TTL_HOURS = 72

/** users.list — admin uniquement (Sprint 5 §12 matrice). */
export async function listUsers(
  db: Db,
  actor: Actor,
  filters: { search?: string; status?: string; role?: Role } = {},
) {
  requirePermission(actor, "users.read") // agent = lecture seule (Sprint 0 §3)

  const conditions = []
  if (filters.search) {
    // Chaque mot doit correspondre au préfixe d'au moins un champ. Cette
    // formulation conserve la recherche au fil de la frappe tout en restant
    // portable entre MySQL et TiDB (MATCH ... AGAINST n'est pas disponible
    // sur toutes les offres TiDB serverless utilisées en recette).
    const searchTokens = filters.search
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.replace(/[\\%_]/g, "\\$&") + "%")
    if (searchTokens.length > 0) {
      conditions.push(and(...searchTokens.map((prefix) => or(
        like(users.firstName, prefix),
        like(users.lastName, prefix),
        like(users.email, prefix),
      ))))
    }
  }
  if (filters.status) {
    conditions.push(eq(users.status, filters.status as "active" | "suspended" | "deleted"))
  }
  if (filters.role) conditions.push(eq(users.role, filters.role))

  return db
    .select(safeUserColumns)
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(2000)
}

/** users.getById — admin/agent. */
export async function getUserById(db: Db, actor: Actor, id: number) {
  requirePermission(actor, "users.read")
  const [row] = await db.select(safeUserColumns).from(users).where(eq(users.id, id)).limit(1)
  if (!row) throw new NotFoundError(`Utilisateur #${id} introuvable.`)
  return row
}

/** users.getMe — l'utilisateur connecté lit son propre profil uniquement. */
export async function getMe(db: Db, actor: Actor) {
  const [row] = await db.select(safeUserColumns).from(users).where(eq(users.id, actor.id)).limit(1)
  if (!row) throw new NotFoundError("Profil introuvable.")
  return row
}

/**
 * Vérifie qu'un acteur peut créer un compte avec ce rôle : `user` → admin ; rôles d'équipe → permission d'attribution ;
 * `admin` / `super_admin` → permission d'attribution privilégiée (SUPER_ADMIN uniquement).
 */
function assertCanCreateWithRole(actor: Actor, role: Role) {
  requirePermission(actor, "users.create")
  if (role === "user") return
  requirePermission(actor, "staff.assign_role")
  if (PRIVILEGED_ROLES.includes(role)) requirePermission(actor, "staff.assign_privileged_role")
}

/**
 * users.create — orchestre la création générique d’un utilisateur dans
 * une transaction DB. Le mot de passe temporaire est déjà haché avant
 * stockage — jamais de mot de passe en clair en base, y compris ici.
 */
export async function createUser(db: Db, actor: Actor, input: CreateUserInput) {
  requireRole(actor, "admin")
  assertCanCreateWithRole(actor, input.role ?? "user")
  return createUserInternal(db, actor.id, input)
}

/**
 * Primitive transactionnelle réutilisable — suppose que l'appelant a déjà
 * ouvert une transaction (`tx`) et valide l'email + insère la ligne
 * utilisateur, sans committer ni journaliser. Un domaine produit peut
 * composer sa propre transaction atomique avec cette primitive, sans
 * dupliquer la validation — le noyau générique ne connaît aucun effet de
 * bord métier lors d’une création utilisateur.
 */
export async function insertUserRow(tx: Db, input: CreateUserInput): Promise<number> {
  if (!input.email.includes("@")) throw new ValidationError("Email invalide.")

  const existing = await tx.select().from(users).where(eq(users.email, input.email)).limit(1)
  if (existing.length > 0) throw new ValidationError("Cet email est déjà utilisé.")

  const mustChange = input.mustChangePassword ?? false
  const ttlHours = input.temporaryPasswordTtlHours ?? TEMP_PASSWORD_DEFAULT_TTL_HOURS
  const [inserted] = await tx.insert(users).values({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ?? null,
    passwordHash: hashPassword(input.temporaryPassword),
    role: input.role ?? "user",
    status: input.status ?? "active",
    kycVerified: false,
    mustChangePassword: mustChange,
    tempPasswordExpiresAt: mustChange ? new Date(Date.now() + ttlHours * 3600 * 1000) : null,
  })
  return inserted.insertId
}

/**
 * Version interne, SANS vérification de permission — appelée uniquement
 * par du code serveur qui a déjà fait son propre contrôle d'autorisation.
 * Elle reste purement générique et ne provisionne aucune ressource métier.
 */
export async function createUserInternal(db: Db, actorIdForLog: number, input: CreateUserInput) {
  return db.transaction(async (tx) => {
    const userId = await insertUserRow(tx as unknown as Db, input)
    await logAction(tx as unknown as Db, actorIdForLog, "user.create", "user", userId, { role: input.role ?? "user" }, { walletType: "PERSONAL", holderId: userId })
    return userId
  })
}

/** Ne laisse jamais la plateforme sans administrateur actif (ni sans SUPER_ADMIN actif si l'on retire le dernier). */
async function assertNotLastPrivileged(db: Db, target: { id: number; role: Role }) {
  if (!PRIVILEGED_ROLES.includes(target.role)) return
  const [others] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(and(inArray(users.role, target.role === "super_admin" ? ["super_admin"] : ["admin", "super_admin"]), eq(users.status, "active"), ne(users.id, target.id)))
  if (Number(others?.n ?? 0) < 1) {
    throw new ForbiddenError("Action refusée : ce compte est le dernier administrateur actif de la plateforme.")
  }
}

/** Un compte privilégié (admin/super_admin) ne peut être modifié, suspendu ou réinitialisé que par un SUPER_ADMIN (ou par lui-même pour le profil). */
function assertCanManageTarget(actor: Actor, target: { id: number; role: Role }) {
  if (actor.id === target.id) return
  if (PRIVILEGED_ROLES.includes(target.role)) requirePermission(actor, "staff.assign_privileged_role")
}

/** users.update — admin, tous champs (y compris role/status). */
export async function updateUser(
  db: Db,
  actor: Actor,
  id: number,
  patch: Partial<Pick<typeof users.$inferInsert, "firstName" | "lastName" | "phone" | "avatarUrl" | "role" | "kycVerified" | "email">>,
) {
  requirePermission(actor, "users.update")
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) throw new NotFoundError(`Utilisateur #${id} introuvable.`)
  assertCanManageTarget(actor, target)
  if (patch.role !== undefined && patch.role !== target.role) {
    assertCanAssignRole(actor, target, patch.role)
    if (PRIVILEGED_ROLES.includes(target.role) && !PRIVILEGED_ROLES.includes(patch.role)) await assertNotLastPrivileged(db, target)
  }
  if (patch.email !== undefined) {
    if (!patch.email.includes("@")) throw new ValidationError("Email invalide.")
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, patch.email)).limit(1)
    if (existing.length > 0 && existing[0]!.id !== id) {
      throw new ValidationError("Cet email est déjà utilisé par un autre compte.")
    }
  }
  await db.update(users).set(patch).where(eq(users.id, id))
  if (patch.role !== undefined && patch.role !== target.role) {
    // Un changement de rôle prend effet immédiatement : les sessions ouvertes sont coupées.
    await revokeAllSessions(db, id)
    await logAction(db, actor.id, "user.role.assign", "user", id, { from: target.role, to: patch.role }, { walletType: "PERSONAL", holderId: id })
  }
  await logAction(db, actor.id, "user.update", "user", id, patch, { walletType: "PERSONAL", holderId: id })
}

/**
 * users.updateMe — champs volontairement limités, jamais role/status.
 * Deux procédures séparées plutôt qu'une seule conditionnelle : évite tout
 * risque d'escalade de privilège par erreur de logique (Sprint 5 §2).
 */
export async function updateMe(
  db: Db,
  actor: Actor,
  patch: Partial<Pick<typeof users.$inferInsert, "firstName" | "lastName" | "phone" | "avatarUrl">>,
) {
  await db.update(users).set(patch).where(eq(users.id, actor.id))
  await logAction(db, actor.id, "user.profile.update", "user", actor.id, { changedFields: Object.keys(patch) })
}

async function setStatus(db: Db, actor: Actor, id: number, status: "active" | "suspended" | "deleted") {
  requirePermission(actor, "users.suspend")
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!row) throw new NotFoundError(`Utilisateur #${id} introuvable.`)
  if (actor.id === id && status !== "active") throw new ForbiddenError("Vous ne pouvez pas suspendre ou supprimer votre propre compte.")
  assertCanManageTarget(actor, row)

  // Machine à états stricte (Sprint 5 §2) : pas de transition arbitraire.
  const allowed: Record<string, string[]> = {
    active: ["suspended", "deleted"],
    suspended: ["active", "deleted"],
    deleted: [],
  }
  if (!allowed[row.status].includes(status)) {
    throw new ValidationError(`Transition "${row.status}" -> "${status}" non autorisée.`)
  }
  if (status !== "active") await assertNotLastPrivileged(db, row)

  await db.update(users).set({ status, deletedAt: status === "deleted" ? new Date() : null }).where(eq(users.id, id))
  if (status !== "active") await revokeAllSessions(db, id)
  await logAction(db, actor.id, `user.${status === "deleted" ? "delete" : status}`, "user", id, undefined, { walletType: "PERSONAL", holderId: id })
}

/** users.suspend */
export async function suspendUser(db: Db, actor: Actor, id: number) {
  await setStatus(db, actor, id, "suspended")
}

/** users.reactivate */
export async function reactivateUser(db: Db, actor: Actor, id: number) {
  await setStatus(db, actor, id, "active")
}

/** users.delete — soft-delete uniquement, jamais de suppression physique (Sprint 6 §1). */
export async function deleteUser(db: Db, actor: Actor, id: number) {
  await setStatus(db, actor, id, "deleted")
}

export interface CredentialReset {
  userId: number
  /** Affiché UNE seule fois à l'administrateur ; jamais stocké en clair ni journalisé. */
  temporaryPassword: string
  expiresAt: Date
}

/**
 * users.resetPassword — réinitialisation par un administrateur : génération d'un mot de passe temporaire aléatoire,
 * expiration (72 h), obligation de le remplacer à la première connexion, coupure de toutes les sessions et levée d'un éventuel verrou.
 * Le mot de passe existant n'est jamais lu ni affiché (il n'est stocké que haché).
 */
export async function adminResetPassword(db: Db, actor: Actor, id: number): Promise<CredentialReset> {
  requirePermission(actor, "users.reset_credentials")
  if (actor.id === id) throw new ForbiddenError("Utilisez « changer mon mot de passe » pour votre propre compte.")
  const [target] = await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.id, id)).limit(1)
  if (!target || target.status === "deleted") throw new NotFoundError(`Utilisateur #${id} introuvable.`)
  assertCanManageTarget(actor, target)

  const temporaryPassword = generateTemporaryPassword()
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DEFAULT_TTL_HOURS * 3600 * 1000)
  await db.update(users).set({ passwordHash: hashPassword(temporaryPassword), mustChangePassword: true, tempPasswordExpiresAt: expiresAt, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, id))
  const revoked = await revokeAllSessions(db, id)
  await logAction(db, actor.id, "user.password.reset", "user", id, { sessionsRevoked: revoked, expiresAt: expiresAt.toISOString() }, { walletType: "PERSONAL", holderId: id })
  return { userId: id, temporaryPassword, expiresAt }
}

/** users.unlock — lève le verrouillage temporaire (échecs de connexion répétés). */
export async function adminUnlockUser(db: Db, actor: Actor, id: number) {
  requirePermission(actor, "users.unlock")
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) throw new NotFoundError(`Utilisateur #${id} introuvable.`)
  assertCanManageTarget(actor, target)
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, id))
  await logAction(db, actor.id, "user.unlock", "user", id, undefined, { walletType: "PERSONAL", holderId: id })
}

/** Validation d'un mot de passe initial choisi par un administrateur (mêmes règles que le changement de mot de passe). */
export function assertInitialPassword(password: string, email: string) {
  assertPasswordPolicy(password, email)
}
