import { z } from "zod"

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
})

type ServerEnv = z.infer<typeof serverSchema>

/** Names every offending key instead of dumping a raw ZodError — the reader has to fix a .env. */
function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
  return `Invalid environment variables:\n${lines.join("\n")}`
}

let cached: ServerEnv | undefined

/**
 * Server-only, parsed on first use rather than at import: `vite build` never executes this, so a
 * build (CI, image) needs no secrets. A misconfigured host fails on its first request, loudly.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached
  const result = serverSchema.safeParse(process.env)
  if (!result.success) throw new Error(formatIssues(result.error))
  cached = result.data
  return cached
}
