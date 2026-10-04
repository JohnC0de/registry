import { createAuthClient } from "better-auth/react"

/**
 * These are only ever called from the browser, so the live origin is the correct base URL —
 * nothing about the deploy host gets baked into the bundle at build time.
 */
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
})

export const { signIn, signUp, signOut } = authClient
