import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"

import { getSessionUser, type SessionUser } from "@/lib/auth/server"

export type { SessionUser }

/** Session for routes and components. Returns null when signed out - it never redirects. */
export const $getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  return getSessionUser(getRequest().headers)
})
