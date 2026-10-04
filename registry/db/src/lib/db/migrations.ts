import { z } from "zod"

/** The part of drizzle's `meta/_journal.json` this guard reads. */
export const journalSchema = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
})

export type Journal = z.infer<typeof journalSchema>

/** Journal entries whose timestamp is not in `drizzle.__drizzle_migrations` yet, in journal order. */
export function pendingTags(journal: Journal, appliedAt: ReadonlySet<number>): string[] {
  return journal.entries.filter((entry) => !appliedAt.has(entry.when)).map((entry) => entry.tag)
}

export type ProductionRun = { url: string; apply: boolean }

/**
 * The production guard. Production is never implied by the environment: it takes an explicit
 * `--production-url <url>` that must differ from DATABASE_URL (the development database), and it
 * only applies migrations with `--yes`. Anything else is a dry listing.
 */
export function resolveProductionRun(
  args: { "production-url"?: string | undefined; yes?: boolean | undefined },
  developmentUrl: string | undefined,
): ProductionRun {
  const url = args["production-url"]
  if (!url) throw new Error("refusing to run: pass --production-url <url> to name the production database")
  if (!/^postgres(?:ql)?:\/\/.+/u.test(url)) throw new Error("--production-url must be a postgres:// or postgresql:// URL")
  if (url === developmentUrl) {
    throw new Error("refusing to run: --production-url equals DATABASE_URL, which must be the development database")
  }
  return { url, apply: args.yes === true }
}
