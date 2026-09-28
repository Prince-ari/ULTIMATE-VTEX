import "dotenv/config"
import { assertProductionEnv } from "../env"
assertProductionEnv()

import { drizzle } from "drizzle-orm/mysql2"
import { migrate } from "drizzle-orm/mysql2/migrator"
import mysql from "mysql2/promise"

import { mysqlSslOption } from "./sslOption"

/**
 * À utiliser en déploiement (CI/CD, nouvel environnement) — contrairement
 * à `drizzle-kit push` qui sert à itérer vite en développement (utilisé à
 * l'étape 5), ce runner applique des migrations SQL versionnées et
 * traçables (`src/db/migrations/`), avec suivi de ce qui a déjà été
 * appliqué (table `__drizzle_migrations_core`, gérée automatiquement).
 *
 * La table de suivi est nommée explicitement pour isoler l’historique de
 * migration du Core de celui d’éventuels domaines produit déployés
 * séparément. Chaque application de migration doit ainsi comparer ses
 * propres fichiers SQL et ne jamais mélanger deux historiques indépendants.
 */
async function runMigrations() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ...mysqlSslOption(process.env.DATABASE_URL),
  })
  const db = drizzle(connection)

  console.log("Application des migrations...")
  await migrate(db, { migrationsFolder: "./src/db/migrations", migrationsTable: "__drizzle_migrations_core" })
  console.log("Migrations appliquées avec succès.")

  await connection.end()
  process.exit(0)
}

runMigrations().catch((err) => {
  console.error("Échec des migrations :", err)
  process.exit(1)
})
