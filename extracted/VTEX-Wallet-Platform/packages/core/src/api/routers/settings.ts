import { z } from "zod"

import { publicProcedure, protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as settingsService from "../../modules/settings/service"

export const settingsRouter = router({
  // Public : le client produit doit pouvoir afficher logo/nom/mode
  // maintenance avant même qu'un utilisateur soit connecté (Sprint 5 §9).
  // le même sous-ensemble de champs, quel que soit l'appelant — plus de
  // comportement conditionnel selon le rôle (audit de dette technique).
  get: publicProcedure.query(() => settingsService.getPublicSettings(db)),

  // Admin uniquement — configuration complète, type de retour propre
  // (pas d'union), utilisé par le Dashboard.
  getAdmin: protectedProcedure.query(({ ctx }) => settingsService.getAdminSettings(db, ctx.actor)),

  update: protectedProcedure
    .input(
      z.object({
        platformName: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        defaultTheme: z.enum(["light", "dark"]).optional(),
        maintenanceMode: z.boolean().optional(),
        maintenanceMessage: z.string().nullable().optional(),
        supportEmail: z.string().email().optional(),
        statsActiveUsersOverride: z.number().int().nullable().optional(),
        statsPlatformBalanceCentsOverride: z.number().int().nullable().optional(),
        statsTransactionsThisMonthOverride: z.number().int().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => settingsService.updateSettings(db, ctx.actor, input)),
})
