import "dotenv/config"
import { assertProductionEnv } from "../env"
assertProductionEnv()

import http from "node:http"
import { createHTTPHandler } from "@trpc/server/adapters/standalone"
import type { AnyRouter } from "@trpc/server"

import { createContext, type Context } from "./context"

/**
 * CORS — trouvé absent lors de l'audit de déploiement (Sprint 8, phase
 * "audit et correction des bugs bloquants"). Invisible dans tous les tests
 * précédents car aucun n'impliquait un vrai navigateur : les clients
 * serveur-à-serveur et les tests Node n'appliquent pas cette restriction —
 * seul un navigateur le fait. Toute interface web consommant l'API depuis
 * une origine distincte doit donc être autorisée explicitement.
 *
 * ALLOWED_ORIGINS : liste blanche séparée par des virgules, ex.
 * "https://admin.vtex.app,https://app.vtex.app". Sans cette variable,
 * retombe sur "*" pour ne pas bloquer le développement local — à définir
 * explicitement en production (l'API n'utilise pas de cookies pour les
 * appels Dashboard, un Bearer token explicite, donc "*" n'expose pas
 * d'identifiants ambiants, mais une liste explicite reste la bonne
 * pratique en défense en profondeur).
 */
function applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim())
  const origin = req.headers.origin

  if (allowedOrigins && origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  } else if (!allowedOrigins) {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Access-Control-Max-Age", "86400")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return true // requête déjà terminée, ne pas continuer vers le handler tRPC
  }
  return false
}

/**
 * Factory générique, paramétrée par le routeur — @vtex/core ne connaît
 * pas les domaines produit qui peuvent composer ce noyau et ne hardcode
 * donc aucun routeur applicatif. Chaque point d'entrée produit fournit son
 * propre routeur composé à cette factory ; une autre application du studio
 * peut appliquer le même pattern.
 */
export function createServer(port: number, router: AnyRouter, ctx: (opts: Parameters<typeof createContext>[0]) => Promise<Context> = createContext) {
  const trpcHandler = createHTTPHandler({ router, createContext: ctx })

  const server = http.createServer((req, res) => {
    if (applyCors(req, res)) return
    trpcHandler(req, res)
  })

  server.listen(port)
  return server
}
