/// <reference types="bun" />
import { join, normalize, sep } from "node:path"

/**
 * Production entry for the `vite build` output. `dist/server/server.js` only renders requests, it
 * does not serve `dist/client` (hashed assets, public/ files), so this adds static serving in front.
 */
const clientDir = join(import.meta.dir, "dist", "client")
const serverEntry = join(import.meta.dir, "dist", "server", "server.js")

const { default: app } = (await import(serverEntry)) as {
  default: { fetch: (request: Request) => Response | Promise<Response> }
}

/** The file under dist/client for this URL path, or undefined when none exists or it escapes the dir. */
async function staticFile(pathname: string) {
  const path = normalize(join(clientDir, decodeURIComponent(pathname)))
  if (!path.startsWith(clientDir + sep)) return undefined
  const file = Bun.file(path)
  return (await file.exists()) ? file : undefined
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(request) {
    if (request.method === "GET" || request.method === "HEAD") {
      const { pathname } = new URL(request.url)
      const file = await staticFile(pathname)
      if (file) {
        // Vite hashes everything under /assets/, so it is safe to cache forever.
        const cache = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
        return new Response(file, { headers: { "cache-control": cache } })
      }
    }
    return app.fetch(request)
  },
})

console.log(`listening on ${server.url}`)
