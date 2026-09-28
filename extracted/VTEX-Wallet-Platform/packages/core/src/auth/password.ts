import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto"

import { ValidationError } from "./permissions"

/**
 * scrypt (node:crypto natif) plutôt que bcrypt : évite une dépendance native
 * compilée supplémentaire pour un besoin déjà couvert par la stdlib Node,
 * cohérent avec « aucune dépendance inutile » (Sprint 0 §6).
 */

const KEY_LENGTH = 64

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex")
  return `${salt}:${derived}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, derived] = stored.split(":")
  if (!salt || !derived) return false
  const candidate = scryptSync(plain, salt, KEY_LENGTH)
  const expected = Buffer.from(derived, "hex")
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

/**
 * Politique appliquée à tout NOUVEAU mot de passe (changement, création par un administrateur) :
 * 10 à 128 caractères, au moins une lettre et un chiffre, sans la partie locale de l'e-mail.
 */
export function assertPasswordPolicy(password: string, email?: string): void {
  if (password.length < 10) throw new ValidationError("Le mot de passe doit contenir au moins 10 caractères.")
  if (password.length > 128) throw new ValidationError("Le mot de passe ne doit pas dépasser 128 caractères.")
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ValidationError("Le mot de passe doit contenir au moins une lettre et un chiffre.")
  const local = email?.split("@")[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
    throw new ValidationError("Le mot de passe ne doit pas contenir votre identifiant e-mail.")
  }
}

const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" // sans 0/O/1/l/I

/**
 * Mot de passe temporaire (réinitialisation ou création par un administrateur) : 16 caractères aléatoires
 * (~93 bits), avec au moins une lettre et un chiffre. Il n'est affiché qu'UNE fois à l'administrateur, jamais stocké en clair.
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = []
  for (let i = 0; i < 16; i += 1) chars.push(TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]!)
  // Garantit un chiffre et une lettre, à deux positions distinctes tirées au hasard.
  const digitAt = randomInt(16)
  let letterAt = randomInt(15)
  if (letterAt >= digitAt) letterAt += 1
  chars[digitAt] = "23456789"[randomInt(8)]!
  chars[letterAt] = "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]!
  return chars.join("")
}
