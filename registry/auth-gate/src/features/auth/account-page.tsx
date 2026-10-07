import { getRouteApi } from "@tanstack/react-router"

const route = getRouteApi("/_authed/account")

export function AccountPage() {
  const { user } = route.useRouteContext()

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}.</p>
    </section>
  )
}
