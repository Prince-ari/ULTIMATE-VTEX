import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import { WALLET_TYPES } from "../../db/schema"
import * as accessSessionsService from "../../modules/support/accessSessions"

const walletType = z.enum(WALLET_TYPES)

export const accessSessionsRouter = router({
  mine: protectedProcedure.query(({ ctx }) => accessSessionsService.getMyActiveAccessSession(db, ctx.actor)),

  start: protectedProcedure
    .input(z.object({ walletType, holderId: z.number().int().positive(), mode: z.enum(["read_only", "operator"]), reason: z.string().min(1).max(250), durationMinutes: z.number().int().min(1).max(120).optional() }))
    .mutation(({ ctx, input }) => accessSessionsService.startAccessSession(db, ctx.actor, input)),

  end: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => accessSessionsService.endAccessSession(db, ctx.actor, input.sessionId)),

  listForHolder: protectedProcedure
    .input(z.object({ walletType, holderId: z.number().int().positive(), limit: z.number().int().min(1).max(200).optional() }))
    .query(({ ctx, input }) => accessSessionsService.listAccessSessionsForHolder(db, ctx.actor, input.walletType, input.holderId, input.limit)),
})
