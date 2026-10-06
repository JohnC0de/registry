/**
 * Apply the versioned SQL migrations in ./drizzle.
 * Prefer this over `drizzle-kit push` for anything shared or long-lived.
 * It reads only DATABASE_URL, so the production image can run it (Coolify `migrate` service).
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

async function main(url: string) {
  console.info("migrate:", url.replace(/:[^:@/]+@/, ":***@"))
  const client = postgres(url, { max: 1, connect_timeout: 20 })
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
    console.info("migrate ok")
  } finally {
    await client.end({ timeout: 5 })
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL missing: add it to .env first")
  process.exit(1)
}
try {
  await main(url)
} catch (error) {
  console.error("migrate failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
}
