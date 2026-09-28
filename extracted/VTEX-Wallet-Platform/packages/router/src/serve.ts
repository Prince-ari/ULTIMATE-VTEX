import "dotenv/config"
import { createServer } from "@vtex/core/dist/api/server"

import { appRouter } from "./index"

/**
 * Déploiement VPS classique (serveur Node persistant) — équivalent, pour
 * le routeur composé de VTEX, du serveur générique fourni par
 * @vtex/core. Un futur produit du studio écrirait son propre `serve.ts`
 * à côté de son propre point de composition, sur ce même modèle.
 */
const port = Number(process.env.API_PORT ?? 4000)
createServer(port, appRouter)
console.log(`API VTEX à l'écoute sur http://localhost:${port}`)
