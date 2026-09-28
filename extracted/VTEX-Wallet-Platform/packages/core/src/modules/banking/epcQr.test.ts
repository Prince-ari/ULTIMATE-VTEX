import { describe, expect, it } from "vitest"
import QRCode from "qrcode"
import jsQR from "jsqr"
import { Jimp } from "jimp"

import { buildEpcPayload, renderEpcQrSvg } from "./epcQr"
import { ValidationError } from "../../auth/permissions"

/** Décode un QR PNG généré à partir du même payload que renderEpcQrSvg, pour vérifier qu'un vrai lecteur
 *  (pas seulement notre propre code) retrouve exactement le texte encodé — un QR SEPA cassé est invisible
 *  à l'œil (il "a l'air" d'un QR) mais inutilisable par une application bancaire réelle. */
async function decodePayload(payload: string): Promise<string> {
  const png = await QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2 })
  const image = await Jimp.read(png)
  const decoded = jsQR(new Uint8ClampedArray(image.bitmap.data), image.bitmap.width, image.bitmap.height)
  if (!decoded) throw new Error("QR généré illisible par un décodeur indépendant.")
  return decoded.data
}

describe("epcQr.buildEpcPayload", () => {
  it("produit les 12 lignes BCD/SCT dans l'ordre attendu, avec montant", () => {
    const payload = buildEpcPayload({ beneficiaryName: "Ariel Kouadio", iban: "FR76 3000 4028 3200 0123 4567 890", bic: "vtexfrpp", amountCents: 15000, remittanceInfo: "Loyer janvier" })
    expect(payload.split("\n")).toEqual(["BCD", "002", "1", "SCT", "VTEXFRPP", "Ariel Kouadio", "FR7630004028320001234567890", "EUR150.00", "", "", "Loyer janvier", ""])
  })

  it("laisse le champ montant vide quand aucun montant n'est fourni (RIB générique)", () => {
    const payload = buildEpcPayload({ beneficiaryName: "Ariel Kouadio", iban: "FR7630004028320001234567890" })
    expect(payload.split("\n")[7]).toBe("")
  })

  it("rejette un IBAN invalide", () => {
    expect(() => buildEpcPayload({ beneficiaryName: "X", iban: "PAS-UN-IBAN" })).toThrow(ValidationError)
  })

  it("rejette un montant nul ou négatif", () => {
    expect(() => buildEpcPayload({ beneficiaryName: "X", iban: "FR7630004028320001234567890", amountCents: 0 })).toThrow(ValidationError)
    expect(() => buildEpcPayload({ beneficiaryName: "X", iban: "FR7630004028320001234567890", amountCents: -500 })).toThrow(ValidationError)
  })

  it("tronque le nom du bénéficiaire à 70 caractères (limite du champ EPC)", () => {
    const longName = "A".repeat(120)
    const payload = buildEpcPayload({ beneficiaryName: longName, iban: "FR7630004028320001234567890" })
    expect(payload.split("\n")[5]).toHaveLength(70)
  })

  it("round-trip réel via un décodeur QR indépendant (jsQR) : le texte décodé est identique au payload encodé", async () => {
    const payload = buildEpcPayload({ beneficiaryName: "Ariel Kouadio", iban: "FR7630004028320001234567890", bic: "VTEXFRPP", amountCents: 4250, remittanceInfo: "Ref-482" })
    const decoded = await decodePayload(payload)
    expect(decoded).toBe(payload)
  })

  it("round-trip réel sans montant ni BIC (cas RIB générique du Wallet)", async () => {
    const payload = buildEpcPayload({ beneficiaryName: "Espace personnel", iban: "FR7630004028320001234567890" })
    const decoded = await decodePayload(payload)
    expect(decoded).toBe(payload)
  })
})

describe("epcQr.renderEpcQrSvg", () => {
  it("rend un SVG inline (jamais un raster) contenant le payload complet", async () => {
    const svg = await renderEpcQrSvg({ beneficiaryName: "Ariel Kouadio", iban: "FR7630004028320001234567890" })
    expect(svg.trimStart()).toMatch(/^<svg/)
    expect(svg).toContain("</svg>")
  })
})
