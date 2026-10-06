import { useRouter } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, signUp } from "@/lib/auth/client"

type Mode = "sign-in" | "sign-up"

export function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitLabel = mode === "sign-in" ? "Sign in" : "Create account"

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: email.split("@")[0] ?? email })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "Authentication failed")
      return
    }

    await router.invalidate()
    await router.navigate({ to: "/" })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{submitLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "sign-in" ? "Email and password." : "Passwords must be at least 12 characters."}
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "…" : submitLabel}
        </Button>
      </form>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null)
          setMode(mode === "sign-in" ? "sign-up" : "sign-in")
        }}
      >
        {mode === "sign-in" ? "Need an account?" : "Already have an account?"}
      </Button>
    </main>
  )
}
