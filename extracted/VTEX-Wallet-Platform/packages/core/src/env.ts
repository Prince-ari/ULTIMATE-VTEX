import { activeVaultKeyId } from "./modules/vault/crypto"

/**
 * Validation au démarrage — échoue fort et clairement plutôt que de
 * dégrader silencieusement vers une valeur par défaut non sécurisée.
 */
export function assertProductionEnv(): void {
  const errors: string[] = []
  const isProduction = process.env.NODE_ENV === "production"

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    errors.push("JWT_SECRET manquant.")
  } else if (jwtSecret.length < 32) {
    errors.push("JWT_SECRET trop court (minimum 32 caractères) — pas assez d'entropie pour signer des sessions.")
  } else if (jwtSecret === "insecure-dev-secret") {
    errors.push("JWT_SECRET utilise la valeur de développement par défaut — jamais en production.")
  }

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL manquant.")
  }

  if (isProduction && process.env.STRIPE_MODE?.trim().toLowerCase() === "sim") {
    errors.push("STRIPE_MODE=sim est interdit en production — le simulateur ne doit jamais accepter de recharge.")
  }

  if (isProduction) {
    if (!process.env.RESEND_API_KEY) {
      errors.push("RESEND_API_KEY manquant — aucun utilisateur ne pourra recevoir de code de connexion.")
    }
    if (!process.env.EMAIL_FROM) {
      errors.push("EMAIL_FROM manquant — configurez un expéditeur Resend vérifié pour les codes de connexion.")
    }

    const origins = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []
    if (origins.length === 0) {
      errors.push("ALLOWED_ORIGINS manquant — le CORS wildcard est interdit en production.")
    } else if (origins.some((origin) => origin === "*" || !origin.startsWith("https://"))) {
      errors.push("ALLOWED_ORIGINS doit contenir uniquement des origines HTTPS explicites en production.")
    }

    if (!process.env.WEBAUTHN_ORIGIN?.startsWith("https://")) {
      errors.push("WEBAUTHN_ORIGIN doit être une URL HTTPS en production.")
    }
    if (!process.env.WEBAUTHN_RP_ID || process.env.WEBAUTHN_RP_ID.includes("/")) {
      errors.push("WEBAUTHN_RP_ID doit contenir uniquement le domaine sans protocole ni chemin.")
    }

    // Coffre de données sensibles (numéro / CVV / PIN de carte, RIB) : sans clé, rien ne peut être chiffré — échec fermé, pas de clé de repli.
    if (!process.env.VTEX_VAULT_KEYS?.trim() && !process.env.VTEX_VAULT_KEY?.trim()) {
      errors.push("VTEX_VAULT_KEYS manquant — les données de carte ne peuvent pas être chiffrées (générez une clé : openssl rand -base64 32).")
    } else {
      try {
        activeVaultKeyId()
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Configuration du coffre invalide.")
      }
    }

    const mediaVars = ["VTEX_MEDIA_S3_ENDPOINT", "VTEX_MEDIA_S3_ACCESS_KEY", "VTEX_MEDIA_S3_SECRET_KEY", "VTEX_MEDIA_S3_BUCKET"]
    if (mediaVars.some((key) => !process.env[key])) errors.push("Configuration de stockage média incomplète (VTEX_MEDIA_S3_*).")
  }

  if (errors.length > 0) {
    const context = isProduction ? "PRODUCTION" : "développement"
    throw new Error(
      `Configuration invalide (${context}) :\n` + errors.map((e) => `  - ${e}`).join("\n"),
    )
  }
}
