import "@tanstack/react-start/server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { Sql } from "postgres"

import { getServerEnv } from "@/env"

export type Db = PostgresJsDatabase & { $client: Sql }

declare global {
  // Dev HMR re-evaluates this module; the global slot keeps one pool across reloads.
  var appDb: Db | undefined
}

/**
 * Pool size and the server-side guards come from `env`. The timeouts make a runaway query, a lock
 * wait or a transaction left open fail fast. Pool size is per process: size it against
 * `max_connections` / replicas. Behind a transaction-mode pooler add `prepare: false`.
 */
function createDb(): Db {
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
export function getDb(): Db {
  globalThis.appDb ??= createDb()
  return globalThis.appDb
}
