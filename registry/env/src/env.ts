import "@tanstack/react-start/server-only"

import { inspect } from "node:util"
import { z } from "zod"

/**
 * Holds a secret so it cannot leak by accident: string conversion, JSON and console/inspect all
 * print `[redacted]`. The only way to the value is the explicit `reveal()` at the point of use.
 */
export class Secret {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  reveal() {
    return this.#value
  }

  toString() {
    return "[redacted]"
  }

  toJSON() {
    return "[redacted]"
  }

  [inspect.custom]() {
    return "[redacted]"
  }
}

const secret = (schema: z.ZodString) => schema.transform((value) => new Secret(value))
const positiveInt = z.coerce.number().int().positive()

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: secret(z.string().min(1)),
  BETTER_AUTH_SECRET: secret(z.string().min(32)),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  // Postgres client tuning, read by src/lib/db/index.ts. Timeouts are in milliseconds.
  DATABASE_POOL_SIZE: positiveInt.default(8),
  DB_STATEMENT_TIMEOUT_MS: positiveInt.default(10_000),
  DB_LOCK_TIMEOUT_MS: positiveInt.default(2_000),
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: positiveInt.default(10_000),
  DB_APPLICATION_NAME: z.string().min(1).default("app"),
  // Better Auth host allowlist inputs, read by src/lib/auth/server.ts. Comma-separated origins.
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1).optional(),
  PORTLESS_URL: z.url().optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

/**
 * Names every offending key and the rule it broke, never the value: the reader has to fix a .env,
 * and the message ends up in logs. Zod issue messages describe the rule only.
 */
function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
  return `Invalid environment variables:\n${lines.join("\n")}`
}

/** Pure parse of a variable map, so tests and tools do not depend on process state. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source)
  if (!result.success) throw new Error(formatIssues(result.error))
  return result.data
}

let cached: ServerEnv | undefined

/**
 * Server-only, parsed on first use rather than at import: `vite build` never executes this, so a
 * build (CI, image) needs no secrets. A misconfigured host fails on its first request, loudly.
 * Never log or serialize the result: secrets are `Secret` values and print as `[redacted]`.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
