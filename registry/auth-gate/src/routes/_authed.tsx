import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/auth/client"
import { $getSessionUser } from "@/lib/auth/session"

/**
 * Everything under src/routes/_authed/ requires a session. The gate runs in `beforeLoad`, so a
 * signed-out visitor never renders the page - and server fns gate again via `requireUser()`.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const user = await $getSessionUser()
    if (!user) throw redirect({ to: "/login" })
    return { user }
  },
  // The page HTML names the signed-in user: no shared or browser cache may keep it.
  headers: () => ({ "Cache-Control": "no-store" }),
  component: AuthedLayout,
})

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    await router.invalidate()
    await router.navigate({ to: "/login" })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <Link to="/" className="text-sm font-medium">
          Home
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
