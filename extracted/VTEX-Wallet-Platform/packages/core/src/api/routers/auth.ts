import { z } from "zod"
import { TRPCError } from "@trpc/server"

import { publicProcedure, protectedProcedure, router } from "../trpc"
import { db } from "../../db/client"
import * as authService from "../../modules/auth/service"
import * as webauthnService from "../../modules/auth/webauthn"
import { checkRateLimit } from "../rateLimit"

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit(db, `login:${ctx.ip}`, 5, 60_000)
      const { userId } = await authService.login(db, input.email, input.password)
      await authService.requestOtp(db, userId) // envoie le vrai email si RESEND_API_KEY est configuré
      return { userId, requiresOtp: true as const }
    }),

  /**
   * DEV UNIQUEMENT — lit le code déjà généré par `login`, sans en
   * regénérer un nouveau (ne casse pas un code déjà envoyé par email).
   * Utile en développement sans RESEND_API_KEY configuré. Refuse de
   * répondre si NODE_ENV=production : ne doit jamais atteindre un
   * environnement réel, signalé explicitement plutôt que laissé comme
   * trou de sécurité silencieux.
   */
  devPeekOtp: publicProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    if (process.env.NODE_ENV === "production") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Indisponible en production." })
    }
    const entry = await authService.devPeekOtp(db, input.userId)
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun code actif pour cet utilisateur." })
    return entry
  }),

  verifyOtp: publicProcedure
    .input(z.object({ userId: z.number(), code: z.string().length(6), device: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit(db, `verifyOtp:${ctx.ip}`, 8, 60_000)
      const token = await authService.verifyOtp(db, input.userId, input.code, {
        device: input.device,
      })
      return { token }
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.jti) await authService.logout(db, ctx.jti)
    return { success: true }
  }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    return authService.listSessions(db, ctx.actor.id)
  }),

  revokeSession: protectedProcedure
    .input(z.object({ jti: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await authService.revokeSessionById(db, ctx.actor.id, input.jti)
      return { success: true }
    }),

  /** Remplacement du mot de passe (obligatoire après un mot de passe temporaire) : exige le mot de passe actuel, coupe les autres sessions. */
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(db, `changePassword:${ctx.actor.id}`, 5, 60_000)
      await authService.changePassword(db, ctx.actor, ctx.jti, input)
      return { success: true }
    }),

  resetPasswordRequest: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit(db, `resetPassword:${ctx.ip}`, 3, 60_000)
      await authService.resetPasswordRequest(db, input.email)
      return { success: true } // toujours true, jamais d'énumération de comptes
    }),

  resetPasswordConfirm: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ input }) => {
      await authService.resetPasswordConfirm(db, input.token, input.newPassword)
      return { success: true }
    }),

  // ===== Passkey (WebAuthn) — option supplémentaire, le flux mot de
  // passe + OTP ci-dessus reste inchangé et fonctionnel en parallèle. =====

  /** Utilisateur déjà authentifié — étape 1 pour ajouter un nouvel appareil Passkey. */
  webauthnRegisterOptions: protectedProcedure.mutation(async ({ ctx }): Promise<unknown> => {
    return webauthnService.registerOptions(db, ctx.actor.id)
  }),

  webauthnRegisterVerify: protectedProcedure
    .input(z.object({ response: z.unknown(), deviceName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return webauthnService.registerVerify(
        db,
        ctx.actor.id,
        input.response as Parameters<typeof webauthnService.registerVerify>[2],
        input.deviceName,
      )
    }),

  /** Pas encore authentifié — identifié par email seul, étape 1 de la connexion Passkey. */
  webauthnLoginOptions: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }): Promise<unknown> => {
      await checkRateLimit(db, `webauthnLoginOptions:${ctx.ip}`, 8, 60_000)
      return webauthnService.loginOptions(db, input.email)
    }),

  webauthnLoginVerify: publicProcedure
    .input(z.object({ email: z.string().email(), response: z.unknown(), device: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit(db, `webauthnLoginVerify:${ctx.ip}`, 8, 60_000)
      return webauthnService.loginVerify(
        db,
        input.email,
        input.response as Parameters<typeof webauthnService.loginVerify>[2],
        { device: input.device, ip: ctx.ip },
      )
    }),

  webauthnListCredentials: protectedProcedure.query(async ({ ctx }) => {
    return webauthnService.listCredentials(db, ctx.actor.id)
  }),

  webauthnDeleteCredential: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await webauthnService.deleteCredential(db, ctx.actor.id, input.id)
      return { success: true }
    }),
})
