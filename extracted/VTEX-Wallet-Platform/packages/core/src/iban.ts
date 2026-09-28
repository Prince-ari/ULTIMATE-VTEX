import { randomInt } from "node:crypto"

import { ValidationError } from "./auth/permissions"

/** Normalise un IBAN et vérifie le checksum ISO 13616 / MOD 97. */
export function normalizeAndValidateIban(value: string): string {
  const iban = value.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban) || iban.length > 34) {
    throw new ValidationError("IBAN invalide.")
  }

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const character of rearranged) {
    const encoded = character >= "A" && character <= "Z" ? String(character.charCodeAt(0) - 55) : character
    for (const digit of encoded) remainder = (remainder * 10 + Number(digit)) % 97
  }

  if (remainder !== 1) throw new ValidationError("La clé de contrôle de l’IBAN est invalide.")
  return iban
}

export function normalizeAndValidateBic(value: string): string {
  const bic = value.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) throw new ValidationError("BIC invalide.")
  return bic
}

/** IBAN français valide (clé MOD 97 correcte), dérivé de l'identifiant du compte. Pour le provisionnement automatique. */
export function generatedIban(accountId: number, scope: "wallet" | "business" = "wallet"): string {
  const bank = scope === "business" ? "30005" : "30004"
  return ibanFromBban(`${bank}${String(accountId).padStart(5, "0")}${String(accountId * 7919).padStart(14, "0").slice(-14)}`)
}

/** « FR » + clé de contrôle MOD 97-10 (ISO 7064) calculée sur le BBAN. */
function ibanFromBban(bban: string): string {
  let remainder = 0
  for (const digit of `${bban}152700`) remainder = (remainder * 10 + Number(digit)) % 97
  return `FR${String(98 - remainder).padStart(2, "0")}${bban}`
}

/** IBAN virtuel (sous-RIB) : banque « 30006 », reste aléatoire. L'unicité est garantie par l'index aveugle de `bank_accounts` (nouvel essai en cas de collision). */
export function generatedVirtualIban(random: (max: number) => number = (max) => randomInt(0, max)): string {
  const digits = (length: number) => Array.from({ length }, () => String(random(10))).join("")
  return ibanFromBban(`30006${digits(5)}${digits(14)}`)
}

/** « FR7630006… » → « FR76 3000 6… » (groupes de quatre, lecture humaine). */
export function formatIban(iban: string): string {
  return (iban.replace(/\s+/g, "").match(/.{1,4}/g) ?? []).join(" ")
}

/** Masque un IBAN : pays + clé et quatre derniers caractères visibles. */
export function maskIbanValue(iban: string): string {
  const compact = iban.replace(/\s+/g, "")
  if (compact.length < 9) return "••••"
  return `${compact.slice(0, 4)} •••• •••• ${compact.slice(-4)}`
}
