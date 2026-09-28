import "dotenv/config"
import { drizzle } from "drizzle-orm/mysql2"
import { migrate } from "drizzle-orm/mysql2/migrator"
import mysql from "mysql2/promise"
import { mysqlSslOption } from "@vtex/core"

async function runMigrations() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ...mysqlSslOption(process.env.DATABASE_URL),
  })
  const db = drizzle(connection)
  await migrate(db, {
    migrationsFolder: "./src/db/migrations",
    migrationsTable: "__drizzle_migrations_business",
  })
  await connection.end()
}

runMigrations().catch((error) => {
  console.error("Échec des migrations Business", error)
  process.exit(1)
})
