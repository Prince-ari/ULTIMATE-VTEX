import { TRPCError, initTRPC } from "@trpc/server"
import superjson from "superjson"

import { toRequestContext, type Context } from "./context"
import { runWithRequestContext } from "./requestContext"
import { ForbiddenError, NotFoundError, ValidationError } from "../auth/permissions"
import { RateLimitError } from "./rateLimit"

/**
 * Remappe les erreurs métier vers un code TRPCError standard. Fait via
 * `errorFormatter` plutôt qu'un middleware try/catch : c'est le mécanisme
 * garanti par tRPC pour intercepter TOUTE erreur (resolver ou middleware),
 * `error.cause` porte toujours l'erreur d'origine.
 */
function mapCode(cause: unknown): TRPCError["code"] | null {
  if (cause instanceof ForbiddenError) return "FORBIDDEN"
  if (cause instanceof NotFoundError) return "NOT_FOUND"
  if (cause instanceof ValidationError) return "BAD_REQUEST"
  if (cause instanceof RateLimitError) return "TOO_MANY_REQUESTS"
  return null
}

const HTTP_STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  TOO_MANY_REQUESTS: 429,
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const mapped = mapCode(error.cause)
    if (!mapped) return shape
    return {
      ...shape,
      data: { ...shape.data, code: mapped, httpStatus: HTTP_STATUS[mapped] },
      message: error.cause instanceof Error ? error.cause.message : shape.message,
    }
  },
})

export const router = t.router
export const mergeRouters = t.mergeRouters

/**
 * Toute procédure (publique ou protégée) s'exécute dans le contexte d'audit de la requête : `logAction` y lit le rôle de l'acteur,
 * la session, l'IP et l'identifiant de requête (api/requestContext.ts).
 */
const withRequestContext = t.middleware(({ ctx, next }) => runWithRequestContext(toRequestContext(ctx), () => next()))

export const publicProcedure = t.procedure.use(withRequestContext)

/** Seules procédures utilisables tant que le mot de passe temporaire n'a pas été remplacé. */
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = new Set(["auth.changePassword", "auth.logout", "users.getMe"])

/**
 * Exige un acteur authentifié (token Bearer valide, cf. context.ts). La
 * vérification du RÔLE reste dans les services (défense en profondeur,
 * Sprint 4 §5) — cette procédure garantit seulement qu'un acteur existe.
 * Tant que `mustChangePassword` est vrai, tout est refusé sauf le changement de mot de passe (vérifié ici, côté serveur).
 */
export const protectedProcedure = publicProcedure.use(async ({ ctx, path, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise." })
  }
  if (ctx.actor.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.has(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PASSWORD_CHANGE_REQUIRED : remplacez votre mot de passe temporaire pour continuer." })
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})
