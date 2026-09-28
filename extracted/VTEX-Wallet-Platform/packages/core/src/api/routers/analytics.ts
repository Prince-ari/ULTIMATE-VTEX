import { protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as analyticsService from "../../modules/analytics/service"

/**
 * Analytics générique du Core. Les domaines produit peuvent exposer leurs
 * propres métriques dans un routeur composé, sans élargir le contrat du
 * noyau ni lui ajouter une dépendance métier.
 */
export const analyticsRouter = router({
  leadsFunnel: protectedProcedure.query(({ ctx }) => analyticsService.leadsFunnel(db, ctx.actor)),
})
