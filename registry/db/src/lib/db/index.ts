import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { getServerEnv } from "@/env"

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> }

/**
 * `max` is per process: real usage is max x replicas, so size it against the server's
 * `max_connections`. Behind a transaction-mode pooler (PgBouncer, Supavisor) add `prepare: false`;
 * prepared statements do not survive pooled transactions.
 */
function createDb() {
  const { DATABASE_URL } = getServerEnv()
  const client = postgres(DATABASE_URL, { max: 8 })
  return drizzle(client, { casing: "snake_case" })
}

/** Cached on globalThis so Vite's dev HMR reuses one pool instead of leaking one per reload. */
export function getDb() {
  globalForDb.__db ??= createDb()
  return globalForDb.__db
}

export type Db = ReturnType<typeof getDb>
