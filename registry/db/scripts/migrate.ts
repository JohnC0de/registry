/**
 * Apply the versioned SQL migrations in ./drizzle.
 * Prefer this over `drizzle-kit push` for anything shared or long-lived.
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL missing: add it to .env first")
  process.exit(1)
}

console.log("migrate:", url.replace(/:[^:@/]+@/, ":***@"))

const client = postgres(url, { max: 1, connect_timeout: 20 })
const db = drizzle(client)

try {
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("migrate ok")
} catch (error) {
  console.error("migrate failed:", error instanceof Error ? error.message : error)
  process.exit(1)
} finally {
  await client.end({ timeout: 5 })
}
