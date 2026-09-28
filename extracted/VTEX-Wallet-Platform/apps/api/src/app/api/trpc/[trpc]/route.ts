import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { assertProductionEnv } from "@vtex/core/src/env"
import { createFetchContext } from "@vtex/core/src/api/context"
import { appRouter } from "@vtex/router"

export const runtime = "nodejs"

/**
 * CORS — même raisonnement que server.ts (déploiement VPS, Sprint 8) :
 * le Dashboard appelle l'API directement depuis le navigateur, donc
 * réellement soumis à cette restriction. ALLOWED_ORIGINS en liste
 * blanche de production ; repli sur "*" en développement.
 */
function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim())
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
  if (allowedOrigins && origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  } else if (!allowedOrigins) {
    headers["Access-Control-Allow-Origin"] = "*"
  }
  return headers
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) })
}

async function handler(req: Request) {
  // Exécutée à la requête, jamais au chargement du module : Next.js
  // importe/exécute les Route Handlers pendant `next build` lui-même
  // (collecte des métadonnées de route), avant que les variables
  // d'environnement de production ne soient nécessairement disponibles
  // — un appel en haut de fichier ferait planter le build, pas juste
  // signaler une vraie config manquante en production. Trouvé en
  // vérifiant le build réel, pas en théorie.
  assertProductionEnv()

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createFetchContext,
  })

  const withCors = new Response(response.body, response)
  for (const [key, value] of Object.entries(corsHeaders(req.headers.get("origin")))) {
    withCors.headers.set(key, value)
  }
  return withCors
}

export { handler as GET, handler as POST }
