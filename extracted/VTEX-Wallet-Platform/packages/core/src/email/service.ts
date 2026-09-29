import { Resend } from "resend"
import { otpEmailHtml, otpEmailText } from "./otpTemplate"
import { transferCodeEmailHtml, transferCodeEmailText, type TransferCodePurpose } from "./transferCodeTemplate"

let cachedClient: Resend | null = null

/**
 * Client Resend paresseux — construit à la première utilisation, pas au
 * chargement du module (même raisonnement que assertProductionEnv dans
 * apps/api/route.ts, Sprint 8 : ne pas exiger RESEND_API_KEY pendant le
 * build, seulement à l'exécution réelle).
 */
function getClient(): Resend {
  if (!cachedClient) cachedClient = new Resend(process.env.RESEND_API_KEY)
  return cachedClient
}

export class EmailError extends Error {}

/**
 * Envoie le code OTP par email. Lève EmailError en cas d'échec — appelé
 * par auth.service.ts, qui décide comment réagir (Sprint 8 : ne bloque
 * pas la génération du code, juste l'envoi, cf. requestOtp).
 */
export async function sendOtpEmail(to: string, code: string, firstName: string): Promise<void> {
  const resend = getClient()
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "VTEX <onboarding@resend.dev>",
    to,
    subject: "Votre code de connexion VTEX",
    html: otpEmailHtml(code, firstName),
    text: otpEmailText(code, firstName),
  })

  if (error) {
    throw new EmailError(`Envoi de l'email OTP échoué : ${error.message}`)
  }
}

/** Envoie le code de déblocage ou de validation de virement par email. Lève EmailError en cas d'échec (même contrat que sendOtpEmail). */
export async function sendTransferCodeEmail(to: string, code: string, firstName: string, purpose: TransferCodePurpose): Promise<void> {
  const resend = getClient()
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "VTEX <onboarding@resend.dev>",
    to,
    subject: purpose === "unlock" ? "Votre code de déblocage des virements VTEX" : "Votre code de validation de virement VTEX",
    html: transferCodeEmailHtml(code, firstName, purpose),
    text: transferCodeEmailText(code, firstName, purpose),
  })

  if (error) {
    throw new EmailError(`Envoi de l'email de code de virement échoué : ${error.message}`)
  }
}
