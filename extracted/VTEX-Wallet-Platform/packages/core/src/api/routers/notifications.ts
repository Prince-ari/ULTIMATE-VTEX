import { z } from "zod"

import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as notifService from "../../modules/notifications/service"

export const notificationsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        targetUserId: z.number().nullable(),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(500),
        scheduledAt: z.date().optional(),
      }),
    )
    .mutation(({ ctx, input }) => notifService.createNotification(db, ctx.actor, input)),

  list: protectedProcedure.query(({ ctx }) => notifService.listNotifications(db, ctx.actor)),

  listMine: protectedProcedure.query(({ ctx }) => notifService.listMyNotifications(db, ctx.actor)),

  unreadCount: protectedProcedure.query(({ ctx }) => notifService.unreadCount(db, ctx.actor)),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(({ ctx, input }) => notifService.markRead(db, ctx.actor, input.notificationId)),

  markAllRead: protectedProcedure.mutation(({ ctx }) => notifService.markAllRead(db, ctx.actor)),
})
