import "dotenv/config"

// Les tests HTTP importent le serveur Core, qui valide volontairement les
// prérequis de sécurité au démarrage. Ces valeurs sont des fixtures locales,
// non utilisées en production et ne remplacent jamais un secret configuré.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === "insecure-dev-secret") {
  process.env.JWT_SECRET = "vtex-audit-test-secret-with-at-least-32-chars"
}
process.env.VTEX_INITIAL_ADMIN_EMAIL ??= "audit-admin@vtex.test"
process.env.VTEX_INITIAL_ADMIN_PASSWORD ??= "AuditInitialAdmin!2026"
