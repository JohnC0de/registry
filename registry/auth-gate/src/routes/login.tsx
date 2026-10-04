import { createFileRoute, redirect } from "@tanstack/react-router"

import { LoginPage } from "@/features/auth/login-page"
import { $getSessionUser } from "@/lib/auth/session"

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const user = await $getSessionUser()
    if (user) throw redirect({ to: "/" })
  },
  component: LoginPage,
})
