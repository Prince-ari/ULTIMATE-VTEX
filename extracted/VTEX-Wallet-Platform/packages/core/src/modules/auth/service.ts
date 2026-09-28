import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import type { Db } from "../../db/client"
import { users, otpCodes } from "../../db/schema"
import { assertPasswordPolicy, hashPassword, verifyPassword } from "../../auth/password"
import {
  createSession,
  listActiveSessions,
  revokeAllSessions,
  revokeSession,
  verifySessionToken,
} from "../../auth/session"
import { ValidationError, type Actor } from "../../auth/permissions"
import { logAction } from "../journal/service"
import { sendOtpEmail } from "../../email/service"

const OTP_TTL_MS = 5 * 60 * 1000
/** Essais autorisés par code : au-delà, le code est détruit et il faut se reconnecter. */
export const OTP_MAX_ATTEMPTS = 5
/** Échecs consécutifs (mot de passe ou code) avant verrouillage temporaire du compte. */
export const LOGIN_MAX_FAILURES = 10
export const LOGIN_LOCK_MS = 15 * 60 * 1000

const GENERIC_LOGIN_ERROR = "Identifiants invalides ou compte temporairement verrouillé."

function otpHash(userId: number, code: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET manquant.")
  return createHmac("sha256", secret).update(`otp:${userId}:${code}`).digest("hex")
}

/** Enregistre un échec d'authentification et verrouille le compte au seuil. Atomique côté SQL (pas de lecture-puis-écriture). */
async function registerFailure(db: Db, userId: number): Promise<void> {
  await db.update(users).set({ failedLoginCount: sql`${users.failedLoginCount} + 1` }).where(eq(users.id, userId))
  const [row] = await db.select({ count: users.failedLoginCount }).from(users).where(eq(users.id, userId)).limit(1)
  if (row && row.count >= LOGIN_MAX_FAILURES) {
    await db.update(users).set({ lockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) }).where(eq(users.id, userId))
    await logAction(db, null, "auth.account.locked", "user", userId, { failures: row.count })
  }
}

/** auth.login — vérifie les identifiants, ne crée PAS de session (OTP requis avant). */
export async function login(db: Db, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) throw new ValidationError(GENERIC_LOGIN_ERROR)
  if (user.status !== "active") throw new ValidationError("Ce compte n'est pas actif.")
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new ValidationError(GENERIC_LOGIN_ERROR)
  if (!verifyPassword(password, user.passwordHash)) {
    await registerFailure(db, user.id)
    throw new ValidationError(GENERIC_LOGIN_ERROR)
  }
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() < Date.now()) {
    throw new ValidationError("Votre mot de passe temporaire a expiré : demandez une réinitialisation à un administrateur.")
  }
  return { userId: user.id, requiresOtp: true }
}

/**
 * Génère, stocke (en base — un code généré sur une instance serverless
 * doit pouvoir être vérifié depuis une autre, Sprint 8) et envoie par
 * email le code OTP d'un utilisateur déjà authentifié par mot de passe.
 *
 * Le code n'est conservé que sous forme d'empreinte HMAC. Hors production uniquement, le code en clair est aussi écrit
 * dans `code` pour `devPeekOtp` (l'interface de développement affiche alors le code sans e-mail).
 *
 * Si RESEND_API_KEY n'est pas configuré (développement local sans
 * fournisseur réel), l'envoi est sauté silencieusement — `devPeekOtp`
 * reste le chemin de test. Une erreur de fournisseur est aussi tolérée
 * uniquement hors production afin de ne jamais bloquer une recette locale.
 * En production, l'erreur remonte : mieux vaut un login qui échoue
 * clairement qu'un "vérifiez votre email" qui ne dira jamais l'email
 * n'arrivera jamais.
 */
export async function requestOtp(db: Db, userId: number): Promise<{ expiresInSeconds: number }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const plain = process.env.NODE_ENV === "production" ? "------" : code
  const codeHash = otpHash(userId, code)

  await db
    .insert(otpCodes)
    .values({ userId, code: plain, codeHash, attempts: 0, expiresAt })
    .onDuplicateKeyUpdate({ set: { code: plain, codeHash, attempts: 0, expiresAt } })

  if (process.env.RESEND_API_KEY) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (user) {
      try {
        await sendOtpEmail(user.email, code, user.firstName)
      } catch (error) {
        if (process.env.NODE_ENV === "production") throw error
        console.warn("[auth] Envoi OTP indisponible en développement ; le code reste disponible via devPeekOtp.", error)
      }
    }
  }

  return { expiresInSeconds: OTP_TTL_MS / 1000 }
}

/**
 * DEV UNIQUEMENT — lit le code actuellement stocké pour un utilisateur,
 * sans en générer un nouveau (contrairement à l'ancienne version qui
 * régénérait, invalidant potentiellement un code déjà envoyé par email).
 * Gardée par un refus en production au niveau du routeur (auth.ts).
 */
export async function devPeekOtp(db: Db, userId: number): Promise<{ code: string } | null> {
  const [entry] = await db.select().from(otpCodes).where(eq(otpCodes.userId, userId)).limit(1)
  if (!entry || entry.expiresAt.getTime() < Date.now() || entry.code === "------") return null
  return { code: entry.code }
}

/** auth.verifyOtp — valide le code (empreinte, comparaison à temps constant, essais bornés), crée la session (jti + JWT) si correct. */
export async function verifyOtp(
  db: Db,
  userId: number,
  code: string,
  meta: { device?: string; ip?: string } = {},
): Promise<string> {
  const [entry] = await db.select().from(otpCodes).where(eq(otpCodes.userId, userId)).limit(1)
  if (!entry || entry.expiresAt.getTime() < Date.now() || !entry.codeHash) {
    throw new ValidationError("Code expiré, veuillez recommencer.")
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || user.status !== "active" || (user.lockedUntil && user.lockedUntil.getTime() > Date.now())) {
    throw new ValidationError(GENERIC_LOGIN_ERROR)
  }

  // Comptage atomique AVANT la comparaison : deux tentatives concurrentes ne peuvent pas dépasser la limite.
  await db.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` }).where(eq(otpCodes.userId, userId))
  const [counted] = await db.select({ attempts: otpCodes.attempts }).from(otpCodes).where(eq(otpCodes.userId, userId)).limit(1)
  if (!counted || counted.attempts > OTP_MAX_ATTEMPTS) {
    await db.delete(otpCodes).where(eq(otpCodes.userId, userId))
    await registerFailure(db, userId)
    throw new ValidationError("Trop d'essais : le code a été annulé, veuillez vous reconnecter.")
  }

  const expected = Buffer.from(entry.codeHash, "hex")
  const candidate = Buffer.from(otpHash(userId, code), "hex")
  if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
    await registerFailure(db, userId)
    throw new ValidationError("Code incorrect.")
  }

  await db.delete(otpCodes).where(eq(otpCodes.userId, userId))
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastActiveAt: new Date() }).where(eq(users.id, userId))
  return createSession(db, userId, meta)
}

/** auth.logout */
export async function logout(db: Db, jti: string): Promise<void> {
  await revokeSession(db, jti)
}

/** auth.listSessions */
export async function listSessions(db: Db, userId: number) {
  return listActiveSessions(db, userId)
}

/** auth.revokeSession — déconnexion à distance (Wallet Paramètres, Sprint 3). */
export async function revokeSessionById(db: Db, userId: number, jti: string): Promise<void> {
  // Un utilisateur ne peut révoquer que ses propres sessions.
  const sessions = await listActiveSessions(db, userId)
  const owns = sessions.some((s) => s.jti === jti)
  if (!owns) throw new ValidationError("Session introuvable pour cet utilisateur.")
  await revokeSession(db, jti)
}

/**
 * auth.changePassword — l'utilisateur remplace son mot de passe (obligatoire après un mot de passe temporaire).
 * Exige le mot de passe actuel, applique la politique, coupe toutes les AUTRES sessions et lève l'obligation de changement.
 */
export async function changePassword(db: Db, actor: Actor, jti: string | null, input: { currentPassword: string; newPassword: string }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1)
  if (!user) throw new ValidationError("Compte introuvable.")
  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    await registerFailure(db, user.id)
    throw new ValidationError("Mot de passe actuel incorrect.")
  }
  if (input.currentPassword === input.newPassword) throw new ValidationError("Le nouveau mot de passe doit être différent de l'actuel.")
  assertPasswordPolicy(input.newPassword, user.email)

  await db
    .update(users)
    .set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false, tempPasswordExpiresAt: null, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id))
  const revoked = await revokeAllSessions(db, user.id, jti ?? undefined)
  await logAction(db, actor.id, "auth.password.change", "user", user.id, { otherSessionsRevoked: revoked, wasTemporary: user.mustChangePassword })
}

/** auth.resetPasswordRequest — génère un jeton, ne révèle jamais si l'email existe. */
const resetTokens = new Map<string, { userId: number; expiresAt: number }>()

export async function resetPasswordRequest(db: Db, email: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return // silencieux, comportement volontaire (pas d'énumération de comptes)
  const token = randomBytes(32).toString("hex")
  resetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 30 * 60 * 1000 })
}

/** auth.resetPasswordConfirm */
export async function resetPasswordConfirm(
  db: Db,
  token: string,
  newPassword: string,
): Promise<void> {
  const entry = resetTokens.get(token)
  if (!entry || entry.expiresAt < Date.now()) {
    throw new ValidationError("Lien de réinitialisation invalide ou expiré.")
  }
  if (newPassword.length < 8) {
    throw new ValidationError("Le mot de passe doit contenir au moins 8 caractères.")
  }
  resetTokens.delete(token)
  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false, tempPasswordExpiresAt: null, passwordChangedAt: new Date() })
    .where(eq(users.id, entry.userId))
  await revokeAllSessions(db, entry.userId)
  await logAction(db, entry.userId, "auth.resetPassword", "user", entry.userId)
}

export { verifySessionToken, hashPassword }
