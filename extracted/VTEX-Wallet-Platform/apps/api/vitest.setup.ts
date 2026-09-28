process.env.DATABASE_URL ??= "mysql://vtex:vtex_dev_password@127.0.0.1:3306/vtex"

// Les tests de route appellent la validation Core réelle. Une valeur injectée
// mais trop courte doit être remplacée par une fixture locale sûre, tout comme
// une valeur absente ; les exigences du runtime restent inchangées.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === "insecure-dev-secret") {
  process.env.JWT_SECRET = "dev-only-test-secret-change-before-production-please-keep-at-least-64-characters"
}
