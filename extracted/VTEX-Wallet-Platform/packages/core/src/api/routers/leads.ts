import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as leadsService from "../../modules/leads/service"

export const leadsRouter = router({
  list: protectedProcedure.query(({ ctx }) => leadsService.listLeads(db, ctx.actor)),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => leadsService.getLeadById(db, ctx.actor, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => leadsService.createLead(db, ctx.actor, input)),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
        source: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input: { id, ...patch } }) => leadsService.updateLead(db, ctx.actor, id, patch)),

  addNote: protectedProcedure
    .input(z.object({ id: z.number(), body: z.string().min(1) }))
    .mutation(({ ctx, input }) => leadsService.addLeadNote(db, ctx.actor, input.id, input.body)),

  convertToUser: protectedProcedure
    .input(z.object({ id: z.number(), temporaryPassword: z.string().min(8) }))
    .mutation(({ ctx, input }) => leadsService.convertLeadToUser(db, ctx.actor, input.id, input.temporaryPassword)),
})
