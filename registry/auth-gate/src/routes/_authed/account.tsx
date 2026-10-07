import { createFileRoute } from "@tanstack/react-router"

import { AccountPage } from "@/features/auth/account-page"

/** The smallest protected page. Keep it (or another route under `_authed/`): without a child, the layout clashes with `/`. */
export const Route = createFileRoute("/_authed/account")({
  headers: () => ({ "Cache-Control": "no-store" }),
  component: AccountPage,
})
