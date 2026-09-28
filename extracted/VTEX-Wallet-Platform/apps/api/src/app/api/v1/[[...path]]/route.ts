import { assertProductionEnv } from "@vtex/core/src/env"
import { handleApiV1 } from "@vtex/router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * API publique `/api/v1` (Wallet Pro), authentifiée par clé d'API. Toute la logique (authentification, droits, limites, routes) vit dans
 * `@vtex/business` (`handleApiV1`) : ce fichier ne fait que la brancher.
 *
 * Volontairement AUCUN en-tête CORS : les clés sont secrètes et réservées aux serveurs de l'entreprise ; un navigateur ne doit pas pouvoir
 * les utiliser depuis une page tierce. La réponse à OPTIONS est donc vide et sans `Access-Control-Allow-Origin`.
 */
async function handler(req: Request) {
  assertProductionEnv()
  return handleApiV1(req)
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, OPTIONS" } })
}

// PUT / PATCH / DELETE aboutissent au même gestionnaire pour obtenir la même erreur JSON 405 (avec `Allow`) que les autres routes.
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
