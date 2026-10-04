/**
 * Apply the committed migrations in ./drizzle to production, after the same migrations ran on the
 * development database (DATABASE_URL). Without `--yes` it only lists what is pending.
 *
 *   bun run scripts/migrate-production.ts --production-url "$PRODUCTION_DATABASE_URL"        # dry listing
 *   bun run scripts/migrate-production.ts --production-url "$PRODUCTION_DATABASE_URL" --yes  # apply
 */
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import { journalSchema, pendingTags, resolveProductionRun } from "@/lib/db/migrations"

let run
try {
  const { values } = parseArgs({
    options: { "production-url": { type: "string" }, yes: { type: "boolean" } },
    strict: true,
  })
  run = resolveProductionRun(values, process.env.DATABASE_URL)
} catch (error) {
  console.error(`migrate-production: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

const journal = journalSchema.parse(JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")))
const client = postgres(run.url, { max: 1, connect_timeout: 10 })

try {
  const [{ present }] = await client<{ present: boolean }[]>`select to_regclass('drizzle.__drizzle_migrations') is not null as present`
  const applied = present ? await client<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations` : []
  const pending = pendingTags(journal, new Set(applied.map((row) => Number(row.created_at))))
  const target = new URL(run.url)
  console.log(JSON.stringify({ target: `${target.hostname}/${target.pathname.slice(1)}`, applied: applied.length, pending }))

  if (pending.length === 0) console.log("nothing to apply")
  else if (!run.apply) console.log("dry run: pass --yes to apply")
  else {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
    console.log(`applied ${pending.length} migration(s)`)
  }
} catch (error) {
  console.error("migrate-production failed:", error instanceof Error ? error.message : error)
  process.exit(1)
} finally {
  await client.end({ timeout: 5 })
}
