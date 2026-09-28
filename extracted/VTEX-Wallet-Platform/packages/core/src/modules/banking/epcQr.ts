import QRCode from "qrcode"

import { ValidationError } from "../../auth/permissions"

/**
 * QR de réception EPC (« EPC069-12 », alias « SCT QR-code ») : le format texte que toutes les applications
 * bancaires européennes savent lire pour préremplir un virement SEPA. Norme EUR uniquement — il n'existe pas
 * d'équivalent normalisé pour USD/XPF, donc ce module ne s'applique qu'à un RIB dont la devise est EUR.
 * Référence : European Payments Council, "Quick Response Code – Guidelines to Enable Data Capture for SCT".
 */

export interface EpcQrInput {
  /** Nom du bénéficiaire tel qu'il apparaît sur le RIB. Tronqué à 70 caractères (limite du champ EPC). */
  beneficiaryName: string
  /** IBAN sans espaces. */
  iban: string
  /** BIC ; le champ peut rester vide depuis 2016 pour un virement SEPA, mais on l'inclut quand on l'a. */
  bic?: string | null
  /** Montant en centimes, optionnel : un QR sans montant laisse le payeur le saisir lui-même (cas RIB générique). */
  amountCents?: number | null
  /** Référence libre affichée au payeur (ex. numéro de commande) — jamais une donnée sensible. */
  remittanceInfo?: string | null
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/** Construit le payload texte EPC (12 lignes, séparées par \n, champs finaux vides autorisés). */
export function buildEpcPayload(input: EpcQrInput): string {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) throw new ValidationError("IBAN invalide pour la génération du QR.")
  if (!input.beneficiaryName.trim()) throw new ValidationError("Nom du bénéficiaire requis pour la génération du QR.")
  if (input.amountCents != null && (!Number.isInteger(input.amountCents) || input.amountCents <= 0)) {
    throw new ValidationError("Montant invalide pour la génération du QR.")
  }

  const amountField = input.amountCents != null ? `EUR${(input.amountCents / 100).toFixed(2)}` : ""
  const lines = [
    "BCD", // Service Tag
    "002", // Version
    "1", // Character set : 1 = UTF-8
    "SCT", // Identification : SEPA Credit Transfer
    input.bic ? input.bic.toUpperCase() : "",
    truncate(input.beneficiaryName.trim(), 70),
    iban,
    amountField,
    "", // Purpose (non utilisé)
    "", // Remittance information (structured)
    truncate((input.remittanceInfo ?? "").trim(), 140), // Remittance information (unstructured)
    "", // Beneficiary to originator information
  ]
  return lines.join("\n")
}

/** Rend le QR en SVG inline (jamais un `<img>` ni un raster — cohérent avec le protocole LEGDAY §9 : SVG uniquement). */
export async function renderEpcQrSvg(input: EpcQrInput): Promise<string> {
  const payload = buildEpcPayload(input)
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0a0d1e", light: "#00000000" } })
}
