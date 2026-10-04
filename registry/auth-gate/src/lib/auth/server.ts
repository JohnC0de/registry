import { redirect } from "@tanstack/react-router"
import { getRequest } from "@tanstack/react-start/server"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { getServerEnv } from "@/env"
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
 * Dual local modes without flipping .env:
 * - plain Vite: Host is loopback (+ port) to dev wildcard patterns
 * - Portless: Host is `*.localhost`, public URL in `PORTLESS_URL`, plus
 *   x-forwarded-host / x-forwarded-proto for protocol=auto
 *
 * Production stays pinned to BETTER_AUTH_URL (+ optional trusted-origins env).
 * Do not hard-code project hostname or port here - see `origins.ts`.
 */
function resolveBaseURL(env: ReturnType<typeof getServerEnv>) {
  const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  return {
    allowedHosts: resolveAllowedHosts({
      nodeEnv: env.NODE_ENV,
      betterAuthUrl: env.BETTER_AUTH_URL,
      portlessUrl: process.env.PORTLESS_URL,
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
    plugins: [tanstackStartCookies()],
  })
}

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
 * The auth gate for every server fn - call it first, do not invent an error class.
 * A thrown `redirect()` is the only thing Start maps to real navigation: the handler serializes it
 * and the client (`useServerFn`, loaders, `beforeLoad`) follows it. A custom Error would serialize
 * as an opaque 500 and land in the catch boundary instead.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser(getRequest().headers)
  if (!user) throw redirect({ to: "/login" })
  return user
}
