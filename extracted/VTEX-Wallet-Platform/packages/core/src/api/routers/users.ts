import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as usersService from "../../modules/users/service"
import { avatarUrlPatchSchema } from "../../modules/users/avatarUrl"

const userRoles = ["super_admin", "admin", "account_manager", "agent", "user"] as const

export const usersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional(), role: z.enum(userRoles).optional() }).optional())
    .query(({ ctx, input }) => usersService.listUsers(db, ctx.actor, input ?? {})),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => usersService.getUserById(db, ctx.actor, input.id)),

  getMe: protectedProcedure.query(({ ctx }) => usersService.getMe(db, ctx.actor)),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        temporaryPassword: z.string().min(8),
      }),
    )
    .mutation(({ ctx, input }) => usersService.createUser(db, ctx.actor, input)),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        avatarUrl: avatarUrlPatchSchema,
        role: z.enum(userRoles).optional(),
        kycVerified: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input: { id, ...patch } }) => usersService.updateUser(db, ctx.actor, id, patch)),

  updateMe: protectedProcedure
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        avatarUrl: avatarUrlPatchSchema,
      }),
    )
    .mutation(({ ctx, input }) => usersService.updateMe(db, ctx.actor, input)),

  suspend: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => usersService.suspendUser(db, ctx.actor, input.id)),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => usersService.reactivateUser(db, ctx.actor, input.id)),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => usersService.deleteUser(db, ctx.actor, input.id)),

  /** Réinitialisation : mot de passe temporaire généré côté serveur, renvoyé UNE fois à l'administrateur. */
  resetPassword: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => usersService.adminResetPassword(db, ctx.actor, input.id)),

  unlock: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => usersService.adminUnlockUser(db, ctx.actor, input.id)),
})
