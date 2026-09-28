import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as documentsService from "../../modules/documents/service"

export const documentsRouter = router({
  listMine: protectedProcedure.query(({ ctx }) => documentsService.listMine(db, ctx.actor)),
  getMine: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => documentsService.getMine(db, ctx.actor, input.id)),
  list: protectedProcedure.query(({ ctx }) => documentsService.listAll(db, ctx.actor)),
  assignPdf: protectedProcedure
    .input(z.object({ userId: z.number().int().positive(), title: z.string().min(1).max(180), fileName: z.string().min(1).max(180), storageKey: z.string().min(1).max(512), sizeBytes: z.number().int().positive().max(8 * 1024 * 1024) }))
    .mutation(({ ctx, input }) => documentsService.assignPdf(db, ctx.actor, input)),
  submitTransferProof: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(180), fileName: z.string().min(1).max(180), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]), storageKey: z.string().min(1).max(512), sizeBytes: z.number().int().positive().max(8 * 1024 * 1024), transactionReference: z.string().max(120).optional() }))
    .mutation(({ ctx, input }) => documentsService.submitTransferProof(db, ctx.actor, input)),
  revoke: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => documentsService.revokeDocument(db, ctx.actor, input.id)),
})
