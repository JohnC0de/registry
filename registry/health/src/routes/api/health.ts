import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { getDb } from "@/lib/db"

/**
 * Liveness by default: no I/O, safe as a container healthcheck.
 * `?deep=1` also pings Postgres and answers 503 when it is unreachable - that is the readiness
 * probe, and it is opt-in so a DB blip never restarts a healthy process.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = { ok: true, ts: new Date().toISOString() }
        const deep = new URL(request.url).searchParams.get("deep")
        if (deep !== "1" && deep !== "true") return Response.json(base)

        try {
          await getDb().execute(sql`select 1`)
          return Response.json({ ...base, db: "up" })
        } catch (error) {
          console.error("health deep check failed", error)
          return Response.json({ ...base, ok: false, db: "down" }, { status: 503 })
        }
      },
    },
  },
})
