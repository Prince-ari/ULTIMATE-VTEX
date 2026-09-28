import { CURRENCY_CATALOG, CURRENCY_CODES } from "@vtex/money"

import { publicProcedure, router } from "../trpc"

/**
 * Configuration publique servie aux interfaces (aucun secret, aucune donnée d'utilisateur) : les clients — dont l'application
 * Wallet statique, qui ne peut pas importer de module TypeScript — lisent ici la même liste de devises que le serveur.
 */
export const configRouter = router({
  currencies: publicProcedure.query(() => CURRENCY_CODES.map((code) => CURRENCY_CATALOG[code])),
})
