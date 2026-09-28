import { eq } from "drizzle-orm"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server"
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server"

import type { Db } from "../../db/client"
import { users, webauthnCredentials, webauthnChallenges } from "../../db/schema"
import { ValidationError, NotFoundError } from "../../auth/permissions"
import { createSession } from "../../auth/session"

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes — assez pour une cérémonie WebAuthn, jamais réutilisable après

/**
 * RP_ID = domaine sur lequel les Passkeys sont valides (sans le
 * protocole). ORIGIN = URL complète attendue dans la réponse du
 * navigateur. Pas de valeur en dur pour la production — un mauvais
 * RP_ID en prod ne casse pas la sécurité (contrairement à JWT_SECRET),
 * juste la fonctionnalité, donc valeur de repli en développement
 * uniquement, jamais silencieuse en production.
 */
function rpConfig(): { rpID: string; rpName: string; origin: string } {
  const rpID = process.env.WEBAUTHN_RP_ID ?? "localhost"
  const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000"
  if (process.env.NODE_ENV === "production" && (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN)) {
    throw new Error("WEBAUTHN_RP_ID et WEBAUTHN_ORIGIN doivent être définis en production.")
  }
  return { rpID, rpName: "VTEX", origin }
}

async function storeChallenge(db: Db, userId: number, challenge: string, purpose: "register" | "login") {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  await db
    .insert(webauthnChallenges)
    .values({ userId, challenge, purpose, expiresAt })
    .onDuplicateKeyUpdate({ set: { challenge, purpose, expiresAt } })
}

async function consumeChallenge(db: Db, userId: number, purpose: "register" | "login"): Promise<string> {
  const [row] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.userId, userId)).limit(1)
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.userId, userId))
  if (!row || row.purpose !== purpose || row.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("Challenge expiré ou invalide, veuillez recommencer.")
  }
  return row.challenge
}

/**
 * webauthn.registerOptions — utilisateur déjà authentifié (mot de passe
 * + OTP), ajoute un nouvel appareil Passkey à son compte.
 */
export async function registerOptions(db: Db, userId: number): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw new NotFoundError("Utilisateur introuvable.")

  const existing = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId))
  const { rpID, rpName } = rpConfig()

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: `${user.firstName} ${user.lastName}`,
    attestationType: "none", // pas besoin de vérifier le fabricant de l'appareil pour ce cas d'usage
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  })

  await storeChallenge(db, userId, options.challenge, "register")
  return options
}

export async function registerVerify(
  db: Db,
  userId: number,
  response: RegistrationResponseJSON,
  deviceName: string,
): Promise<{ verified: boolean }> {
  const expectedChallenge = await consumeChallenge(db, userId, "register")
  const { rpID, origin } = rpConfig()

  let result: VerifiedRegistrationResponse
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID })
  } catch {
    throw new ValidationError("Vérification Passkey échouée.")
  }
  if (!result.verified || !result.registrationInfo) {
    throw new ValidationError("Vérification Passkey échouée.")
  }

  const { credential } = result.registrationInfo
  await db.insert(webauthnCredentials).values({
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    deviceName: deviceName.slice(0, 100) || "Appareil",
  })

  return { verified: true }
}

/**
 * webauthn.loginOptions — utilisateur PAS ENCORE authentifié, identifié
 * par email uniquement. Ne révèle jamais si l'email existe ou non dans
 * sa réponse (même raisonnement que resetPasswordRequest) — renvoie
 * des options valides mais sans allowCredentials si l'email est inconnu
 * ou n'a aucune Passkey, le navigateur échouera naturellement côté
 * client sans que le serveur n'ait rien révélé explicitement.
 */
export async function loginOptions(db: Db, email: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = rpConfig()
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!user) {
    return generateAuthenticationOptions({ rpID, userVerification: "preferred" })
  }

  const credentials = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id))
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({ id: c.credentialId })),
  })

  await storeChallenge(db, user.id, options.challenge, "login")
  return options
}

export async function loginVerify(
  db: Db,
  email: string,
  response: AuthenticationResponseJSON,
  meta: { device?: string; ip?: string } = {},
): Promise<{ token: string }> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) throw new ValidationError("Identifiants invalides.")
  if (user.status !== "active") throw new ValidationError("Ce compte n'est pas actif.")

  const expectedChallenge = await consumeChallenge(db, user.id, "login")
  const [stored] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, response.id))
    .limit(1)
  if (!stored || stored.userId !== user.id) {
    throw new ValidationError("Identifiants invalides.")
  }

  const { rpID, origin } = rpConfig()
  let result: VerifiedAuthenticationResponse
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, "base64"),
        counter: stored.counter,
      },
    })
  } catch {
    throw new ValidationError("Vérification Passkey échouée.")
  }
  if (!result.verified) throw new ValidationError("Vérification Passkey échouée.")

  // Protection contre le rejeu — le compteur doit toujours progresser
  // (RFC 8809 §7.2 étape 17). Une régression signale un clonage possible
  // de l'authentificateur.
  await db
    .update(webauthnCredentials)
    .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.credentialId, response.id))

  const token = await createSession(db, user.id, meta)
  return { token }
}

export async function listCredentials(db: Db, userId: number) {
  return db
    .select({
      id: webauthnCredentials.id,
      deviceName: webauthnCredentials.deviceName,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId))
}

export async function deleteCredential(db: Db, userId: number, credentialRowId: number) {
  const [row] = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, credentialRowId)).limit(1)
  if (!row || row.userId !== userId) throw new NotFoundError("Passkey introuvable.")
  await db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, credentialRowId))
}
