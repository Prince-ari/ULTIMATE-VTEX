import "dotenv/config"
import mysql from "mysql2/promise"
import { drizzle } from "drizzle-orm/mysql2"

import * as schema from "./schema"
import { mysqlSslOption } from "./sslOption"

/**
 * Pool MySQL explicite pour un runtime Node persistant sur VPS.
 * DB_CONNECTION_LIMIT est plafonné afin d’éviter qu’une configuration
 * accidentelle ne sature la base Hostinger.
 */
const parsedLimit = Number(process.env.DB_CONNECTION_LIMIT ?? 10)
const connectionLimit = Number.isFinite(parsedLimit) && parsedLimit >= 1
  ? Math.min(Math.floor(parsedLimit), 20)
  : 10

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit,
  ...mysqlSslOption(process.env.DATABASE_URL),
})

export const db = drizzle(pool, { schema, mode: "default" })
export { schema }
export type Db = typeof db
