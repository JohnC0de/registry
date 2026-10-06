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
import type { ProductionRun } from "@/lib/db/migrations"

function parseRun(): ProductionRun {
  const { values } = parseArgs({
    options: { "production-url": { type: "string" }, yes: { type: "boolean" } },
    strict: true,
  })
  return resolveProductionRun(values, process.env.DATABASE_URL)
}

async function main(run: ProductionRun) {
  const journal = journalSchema.parse(
    JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")),
  )
  const client = postgres(run.url, { max: 1, connect_timeout: 10 })
  try {
    const states = await client<
      { present: boolean }[]
    >`select to_regclass('drizzle.__drizzle_migrations') is not null as present`
    const applied = states.some((row) => row.present)
      ? await client<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations`
      : []
    const pending = pendingTags(
      journal,
      applied.map((row) => Number(row.created_at)),
    )
    const target = new URL(run.url)
    console.info(
      JSON.stringify({
        target: `${target.hostname}/${target.pathname.slice(1)}`,
        applied: applied.length,
        pending,
      }),
    )

    if (pending.length === 0) console.info("nothing to apply")
    else if (!run.apply) console.info("dry run: pass --yes to apply")
    else {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
      console.info(`applied ${pending.length} migration(s)`)
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}

let run: ProductionRun
try {
  run = parseRun()
} catch (error) {
  console.error(`migrate-production: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
try {
  await main(run)
} catch (error) {
  console.error(
    "migrate-production failed:",
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
}
