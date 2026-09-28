import { getStripeGateway, stripePublicConfig, ValidationError } from "@vtex/core"
import { handleStripeEvent } from "@vtex/router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RELEVANT = new Set(["payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.processing", "payment_intent.canceled", "payment_intent.requires_action"])

/**
 * Webhook Stripe. Le corps brut est indispensable à la vérification de la
 * signature : on ne le parse jamais avant. Un événement authentique ne sert
 * que de déclencheur — le service relit le paiement auprès de Stripe avant
 * tout crédit.
 */
export async function POST(req: Request) {
  const config = stripePublicConfig()
  if (!config.enabled || config.mode === "sim") return new Response("Webhook indisponible.", { status: 501 })

  const rawBody = await req.text()
  let event
  try {
    event = getStripeGateway().parseWebhook(rawBody, req.headers.get("stripe-signature"))
  } catch {
    return new Response("Signature invalide.", { status: 400 })
  }

  if (!RELEVANT.has(event.type)) return new Response("Ignoré.", { status: 200 })
  try {
    await handleStripeEvent(event)
  } catch (error) {
    console.error("[stripe-webhook] traitement impossible", event.type, error instanceof Error ? error.message : error)
    // Refus métier définitif (ex. montant discordant) : inutile de faire rejouer l'événement.
    if (error instanceof ValidationError) return new Response("Refusé.", { status: 200 })
    return new Response("Traitement différé.", { status: 500 })
  }
  return new Response("OK", { status: 200 })
}
