import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { getServerEnv } from "@/env"

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> }

/**
 * Pool size and the server-side guards come from `env` (DATABASE_POOL_SIZE, DB_*_MS,
 * DB_APPLICATION_NAME). The timeouts are the point: a runaway query, a lock wait or a transaction
 * left open by a crashed request fails fast instead of stalling every other request.
 * Pool size is per process: real usage is size x replicas, so size it against the server's
 * `max_connections`. Behind a transaction-mode pooler (PgBouncer, Supavisor) add `prepare: false`;
 * prepared statements do not survive pooled transactions.
 */
function createDb() {
  const env = getServerEnv()
  const client = postgres(env.DATABASE_URL.reveal(), {
    max: env.DATABASE_POOL_SIZE,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 1800,
    connection: {
      application_name: env.DB_APPLICATION_NAME,
      statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
      lock_timeout: env.DB_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
  })
  return drizzle(client, { casing: "snake_case" })
}

/** Cached on globalThis so Vite's dev HMR reuses one pool instead of leaking one per reload. */
export function getDb() {
  globalForDb.__db ??= createDb()
  return globalForDb.__db
}

export type Db = ReturnType<typeof getDb>
