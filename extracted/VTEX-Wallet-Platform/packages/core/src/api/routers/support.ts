import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as supportService from "../../modules/support/service"

export const supportRouter = router({
  list: protectedProcedure.query(({ ctx }) => supportService.listTickets(db, ctx.actor)),

  listMine: protectedProcedure.query(({ ctx }) => supportService.listMyTickets(db, ctx.actor)),

  create: protectedProcedure
    .input(z.object({ subject: z.string().min(1), message: z.string().min(1) }))
    .mutation(({ ctx, input }) => supportService.createTicket(db, ctx.actor, input.subject, input.message)),

  reply: protectedProcedure
    .input(z.object({ id: z.number(), body: z.string().min(1) }))
    .mutation(({ ctx, input }) => supportService.replyToTicket(db, ctx.actor, input.id, input.body)),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "in_progress", "resolved"]) }))
    .mutation(({ ctx, input }) => supportService.updateTicketStatus(db, ctx.actor, input.id, input.status)),

  updatePriority: protectedProcedure
    .input(z.object({ id: z.number(), priority: z.enum(["low", "normal", "high"]) }))
    .mutation(({ ctx, input }) => supportService.updateTicketPriority(db, ctx.actor, input.id, input.priority)),
})
