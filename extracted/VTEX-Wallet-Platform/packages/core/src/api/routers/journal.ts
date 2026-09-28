import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as journalService from "../../modules/journal/service"

export const journalRouter = router({
  list: protectedProcedure
    .input(z.object({ targetType: z.string().optional(), limit: z.number().optional() }).optional())
    .query(({ ctx, input }) => journalService.listLogs(db, ctx.actor, input ?? {})),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => journalService.getLogById(db, ctx.actor, input.id)),
})
