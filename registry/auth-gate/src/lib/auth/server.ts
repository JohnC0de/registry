import "@tanstack/react-start/server-only"

import { redirect } from "@tanstack/react-router"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { getServerEnv } from "@/env"
import type { ServerEnv } from "@/env"
import { resolveAllowedHosts } from "@/lib/auth/origins"
import { getDb } from "@/lib/db"
import * as schema from "@/lib/db/schema/auth"

export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

/**
 * Local dev works without flipping .env: plain Vite (loopback Host) and Portless (`*.localhost`,
 * public URL in PORTLESS_URL). Production stays pinned to BETTER_AUTH_URL plus the optional
 * BETTER_AUTH_TRUSTED_ORIGINS. Do not hard-code a hostname or port; see `origins.ts`.
 */
function resolveBaseURL(env: ServerEnv) {
  const extra = env.BETTER_AUTH_TRUSTED_ORIGINS
  return {
    allowedHosts: resolveAllowedHosts({
      nodeEnv: env.NODE_ENV,
      betterAuthUrl: env.BETTER_AUTH_URL,
      portlessUrl: env.PORTLESS_URL,
      extraTrustedOrigins: extra
        ? extra
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    }),
    fallback: env.BETTER_AUTH_URL,
    protocol: "auto" as const,
  }
}

function createAuth() {
  const env = getServerEnv()
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET.reveal(),
    baseURL: resolveBaseURL(env),
    // Portless (and real reverse proxies) set x-forwarded-*; honor them so
    // protocol=auto and cookie Secure match the browser origin.
    advanced: {
      trustedProxyHeaders: true,
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    session: {
      // Signed cookie avoids a DB read per request; revocation lags by up to maxAge.
      cookieCache: { enabled: true, maxAge: 300 },
    },
    emailAndPassword: {
      enabled: true,
      // Above the 8-char default. Turn on `requireEmailVerification` once an email
      // transport exists - enabling it before that locks every new signup out.
      minPasswordLength: 12,
    },
    // tanstackStartCookies() MUST stay the LAST plugin: any plugin after it loses its Set-Cookie
    // headers without an error (TanStack/router#8911). Add new plugins above it.
    plugins: [tanstackStartCookies()],
  })
}

// oxlint-disable-next-line anti-slop/no-return-type-utility -- Better Auth's generic return type has no writable name; the plugin list shapes it.
export type Auth = ReturnType<typeof createAuth>

let authInstance: Auth | undefined

export function getAuth() {
  authInstance ??= createAuth()
  return authInstance
}

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  try {
    const session = await getAuth().api.getSession({ headers })
    const user = session?.user
    if (!user) return null
    return { id: user.id, name: user.name, email: user.email, image: user.image }
  } catch (error) {
    console.error("getSessionUser failed", error)
    return null
  }
}

/**
 * The auth gate for every server fn: call it first. A thrown `redirect()` is the only error Start
 * turns into navigation; a custom Error becomes an opaque 500. It also marks the response
 * `no-store`, so no proxy or browser cache keeps a per-user answer.
 */
export async function requireUser(): Promise<SessionUser> {
  setResponseHeader("Cache-Control", "no-store")
  const user = await getSessionUser(getRequest().headers)
  if (!user) throw redirect({ to: "/login" })
  return user
}
