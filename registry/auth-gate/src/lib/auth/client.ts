import { createAuthClient } from "better-auth/react"

/**
 * Called from the browser only. Without a `baseURL` the client uses the page origin, so nothing
 * about the deploy host is baked into the bundle at build time.
 */
export const authClient = createAuthClient()

export const { signIn, signUp, signOut } = authClient
