import {
  ForbiddenError,
  NotFoundError,
  TEMP_PASSWORD_DEFAULT_TTL_HOURS,
  ValidationError,
  checkRateLimit,
  db,
  deleteAssignment,
  generateTemporaryPassword,
  insertAssignment,
  insertUserRow,
  listAssignments,
  listAssignmentsOfMany,
  listManagersOfWallet,
  logAction,
  notifications,
  protectedProcedure,
  reactivateUser,
  requirePermission,
  router,
  suspendUser,
  users,
  type Actor,
  type Db,
  type WalletType,
} from "@vtex/core"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { z } from "zod"

import { likeContains } from "./sqlLike"
import { holderKey, loadHolders, searchHolders, type HolderRef } from "./walletHolders"

/**
 * Support / gestionnaires de compte (Dashboard).
 *
 *  - lecture : `managers.read` (SUPPORT compris) ; créer, désactiver, attribuer, retirer : `managers.manage` (ADMIN) ;
 *  - un gestionnaire est un compte de rôle `agent` (support) ou `account_manager` ; son périmètre = ses attributions (`manager_assignments`) ;
 *  - chaque attribution / retrait est journalisé sur le wallet concerné (`manager.assign`, `manager.unassign`), avec le motif ;
 *  - le mot de passe temporaire d'un nouveau gestionnaire n'est renvoyé qu'une fois, haché en base, à changer à la première connexion.
 */

const MANAGER_ROLES = ["agent", "account_manager"] as const
type ManagerRole = (typeof MANAGER_ROLES)[number]
const walletTypeSchema = z.enum(["PERSONAL", "PROFESSIONAL"])
const id = z.number().int().positive()
const reasonSchema = z.string().trim().min(8, "Le motif doit contenir au moins huit caractères.").max(250)

const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await checkRateLimit(db, `admin:write:${ctx.actor.id}:${ctx.ip}`, 30, 60_000)
  return next()
})

const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim()
const isManagerRole = (role: string): role is ManagerRole => (MANAGER_ROLES as readonly string[]).includes(role)

async function loadManager(executor: Db, managerId: number) {
  const [row] = await executor
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role, status: users.status, lastActiveAt: users.lastActiveAt, createdAt: users.createdAt, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, managerId))
    .limit(1)
  if (!row || !isManagerRole(row.role)) throw new NotFoundError("Gestionnaire introuvable.")
  return row as typeof row & { role: ManagerRole }
}

async function notifyManager(executor: Db, targetUserId: number, actorId: number, title: string, body: string) {
  await executor.insert(notifications).values({ targetUserId, title, body, status: "sent", sentAt: new Date(), createdBy: actorId })
}

/** Portefeuille d'un gestionnaire : ses wallets avec le nom du titulaire, le plus récemment attribué d'abord. */
async function walletsOf(executor: Db, managerId: number) {
  const assignments = await listAssignments(executor, managerId)
  const holders = await loadHolders(executor, assignments)
  return assignments.map((assignment) => {
    const holder = holders.get(holderKey(assignment))
    return { walletType: assignment.walletType, holderId: assignment.holderId, name: holder?.name ?? `Titulaire #${assignment.holderId} (introuvable)`, subtitle: holder?.subtitle ?? null, status: holder?.status ?? "unknown", currencies: holder?.currencies ?? [], assignedAt: assignment.createdAt }
  })
}

export async function listManagers(actor: Actor, input: { search?: string; role?: ManagerRole; status?: "active" | "suspended" } = {}) {
  requirePermission(actor, "managers.read")
  const term = input.search?.trim() ? likeContains(input.search) : null
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role, status: users.status, lastActiveAt: users.lastActiveAt, createdAt: users.createdAt, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(and(
      input.role ? eq(users.role, input.role) : inArray(users.role, [...MANAGER_ROLES]),
      input.status ? eq(users.status, input.status) : inArray(users.status, ["active", "suspended"]),
      term ? or(like(users.email, term), like(users.firstName, term), like(users.lastName, term)) : undefined,
    ))
    .orderBy(desc(users.createdAt))
    .limit(500)
  const assignments = await listAssignmentsOfMany(db, rows.map((row) => row.id))
  const holders = await loadHolders(db, assignments)
  return rows.map((row) => {
    const mine = assignments.filter((assignment) => assignment.managerUserId === row.id)
    return {
      id: row.id,
      name: fullName(row),
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: row.role as ManagerRole,
      status: row.status,
      lastActiveAt: row.lastActiveAt,
      createdAt: row.createdAt,
      mustChangePassword: row.mustChangePassword,
      walletCount: mine.length,
      wallets: mine.slice(0, 3).map((assignment) => ({ walletType: assignment.walletType, holderId: assignment.holderId, name: holders.get(holderKey(assignment))?.name ?? `#${assignment.holderId}` })),
    }
  })
}

export async function getManager(actor: Actor, managerId: number) {
  requirePermission(actor, "managers.read")
  const manager = await loadManager(db, managerId)
  return { ...manager, name: fullName(manager), wallets: await walletsOf(db, managerId) }
}

const createInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(MANAGER_ROLES),
})

/**
 * Création atomique d'un gestionnaire : le compte (mot de passe temporaire aléatoire, haché, changement obligatoire) et son audit, ou rien.
 * Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois, jamais stocké en clair ni journalisé.
 */
export async function createManager(actor: Actor, input: z.infer<typeof createInput>) {
  requirePermission(actor, "managers.manage")
  requirePermission(actor, "staff.assign_role")
  const temporaryPassword = generateTemporaryPassword()
  const userId = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const created = await insertUserRow(executor, { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone, temporaryPassword, role: input.role, status: "active", mustChangePassword: true })
    await logAction(executor, actor.id, "manager.create", "user", created, { role: input.role, email: input.email })
    return created
  })
  return { id: userId, expiresAt: new Date(Date.now() + TEMP_PASSWORD_DEFAULT_TTL_HOURS * 3_600_000), temporaryPassword }
}

export async function setManagerStatus(actor: Actor, input: { id: number; status: "active" | "suspended"; reason: string }) {
  requirePermission(actor, "managers.manage")
  const manager = await loadManager(db, input.id)
  if (manager.id === actor.id) throw new ForbiddenError("Vous ne pouvez pas suspendre votre propre compte.")
  if (manager.status === input.status) throw new ValidationError(input.status === "suspended" ? "Ce compte est déjà suspendu." : "Ce compte est déjà actif.")
  if (input.status === "suspended") await suspendUser(db, actor, manager.id)
  else await reactivateUser(db, actor, manager.id)
  await logAction(db, actor.id, input.status === "suspended" ? "manager.suspend" : "manager.reactivate", "user", manager.id, { reason: input.reason, role: manager.role })
  return getManager(actor, manager.id)
}

async function assertHolder(executor: Db, ref: HolderRef) {
  const holder = (await loadHolders(executor, [ref])).get(holderKey(ref))
  if (!holder) throw new NotFoundError("Titulaire de wallet introuvable.")
  return holder
}

export async function assignWallet(actor: Actor, input: { managerId: number; walletType: WalletType; holderId: number; reason?: string }) {
  requirePermission(actor, "managers.manage")
  const manager = await loadManager(db, input.managerId)
  if (manager.status !== "active") throw new ValidationError("Ce gestionnaire est suspendu : réactivez-le avant de lui attribuer un wallet.")
  const holder = await assertHolder(db, input)
  const { created } = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const outcome = await insertAssignment(executor, { managerUserId: manager.id, walletType: input.walletType, holderId: input.holderId, assignedBy: actor.id })
    if (outcome.created) {
      await logAction(executor, actor.id, "manager.assign", "user", manager.id, { managerName: fullName(manager), managerRole: manager.role, holderName: holder.name, reason: input.reason ?? null }, { walletType: input.walletType, holderId: input.holderId })
      await notifyManager(executor, manager.id, actor.id, "Nouveau wallet attribué", `Le wallet « ${holder.name} » a été ajouté à votre portefeuille.`)
    }
    return outcome
  })
  return { created, wallets: await walletsOf(db, manager.id) }
}

export async function unassignWallet(actor: Actor, input: { managerId: number; walletType: WalletType; holderId: number; reason?: string }) {
  requirePermission(actor, "managers.manage")
  const manager = await loadManager(db, input.managerId)
  const holder = (await loadHolders(db, [input])).get(holderKey(input))
  const { removed } = await db.transaction(async (tx) => {
    const executor = tx as unknown as Db
    const outcome = await deleteAssignment(executor, { managerUserId: manager.id, walletType: input.walletType, holderId: input.holderId })
    if (outcome.removed) {
      await logAction(executor, actor.id, "manager.unassign", "user", manager.id, { managerName: fullName(manager), managerRole: manager.role, holderName: holder?.name ?? null, reason: input.reason ?? null }, { walletType: input.walletType, holderId: input.holderId })
      await notifyManager(executor, manager.id, actor.id, "Wallet retiré de votre portefeuille", `Le wallet « ${holder?.name ?? `#${input.holderId}`} » n'est plus dans votre portefeuille.`)
    }
    return outcome
  })
  return { removed, wallets: await walletsOf(db, manager.id) }
}

/** Gestionnaires d'un wallet (fiche du titulaire) : identité et date d'attribution, jamais d'e-mail de titulaire ni de secret. */
export async function managersOfWallet(actor: Actor, ref: HolderRef) {
  requirePermission(actor, "managers.read")
  const rows = await listManagersOfWallet(db, ref.walletType, ref.holderId)
  return rows.map((row) => ({ id: row.id, name: fullName(row), email: row.email, role: row.role, status: row.status, assignedAt: row.assignedAt }))
}

export const adminManagersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(100).optional(), role: z.enum(MANAGER_ROLES).optional(), status: z.enum(["active", "suspended"]).optional() }).optional())
    .query(({ ctx, input }) => listManagers(ctx.actor, input ?? {})),
  get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => getManager(ctx.actor, input.id)),
  create: writeProcedure.input(createInput).mutation(({ ctx, input }) => createManager(ctx.actor, input)),
  setStatus: writeProcedure
    .input(z.object({ id, status: z.enum(["active", "suspended"]), reason: reasonSchema }))
    .mutation(({ ctx, input }) => setManagerStatus(ctx.actor, input)),
  assign: writeProcedure
    .input(z.object({ managerId: id, walletType: walletTypeSchema, holderId: id, reason: reasonSchema.optional() }))
    .mutation(({ ctx, input }) => assignWallet(ctx.actor, input)),
  unassign: writeProcedure
    .input(z.object({ managerId: id, walletType: walletTypeSchema, holderId: id, reason: reasonSchema.optional() }))
    .mutation(({ ctx, input }) => unassignWallet(ctx.actor, input)),
  forWallet: protectedProcedure.input(z.object({ walletType: walletTypeSchema, holderId: id })).query(({ ctx, input }) => managersOfWallet(ctx.actor, input)),
  /** Sélecteur de wallets (attribution) : réservé à qui peut attribuer. */
  holders: protectedProcedure.input(z.object({ query: z.string().max(100).default("") })).query(({ ctx, input }) => {
    requirePermission(ctx.actor, "managers.manage")
    return searchHolders(input.query)
  }),
})
