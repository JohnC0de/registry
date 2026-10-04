import { createFileRoute } from "@tanstack/react-router"

/** Better Auth owns every /api/auth/* route. Imported lazily so the client bundle never pulls it. */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuth } = await import("@/lib/auth/server")
        return getAuth().handler(request)
      },
      POST: async ({ request }) => {
        const { getAuth } = await import("@/lib/auth/server")
        return getAuth().handler(request)
      },
    },
  },
})
