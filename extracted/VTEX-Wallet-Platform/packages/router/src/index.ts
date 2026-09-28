import { coreRouter, mergeRouters, type GatewayEvent } from "@vtex/core"
import { handleWalletStripeEvent, walletRouter } from "@vtex/wallet"
import { businessRouter, handleBusinessStripeEvent } from "@vtex/business"

import { adminRouter } from "./admin"
export { backfillBankAccounts } from "./backfillBankAccounts"
export { handleApiV1 } from "@vtex/business"

/**
 * Routeur public du socle VTEX.
 *
 * Cette façade compose le socle transverse, le domaine financier Wallet
 * (personnel), le domaine Business (Wallet Pro) et l'administration transverse (branche « admin »). Le Core reste
 * indépendant : seul ce package d’orchestration dépend des produits
 * Wallet/Business et expose le contrat final aux applications.
 */
export const appRouter = mergeRouters(coreRouter, walletRouter, businessRouter, adminRouter)
export type AppRouter = typeof appRouter

/**
 * Événement Stripe vérifié : chaque domaine relit lui-même le paiement auprès
 * de Stripe et ne traite que les recharges qui lui appartiennent.
 */
export async function handleStripeEvent(event: GatewayEvent): Promise<boolean> {
  return (await handleWalletStripeEvent(event)) || (await handleBusinessStripeEvent(event))
}
