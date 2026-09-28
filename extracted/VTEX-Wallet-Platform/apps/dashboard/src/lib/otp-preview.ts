/**
 * Le code OTP de recette n’est jamais demandé ni rendu en production.
 * L’argument rend le garde-fou facilement testable sans modifier l’environnement global.
 */
export function canRevealDevelopmentOtp(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production"
}
