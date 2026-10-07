import { useRouter } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, signUp } from "@/lib/auth/client"

type Mode = "sign-in" | "sign-up"

const COPY = {
  "sign-in": {
    title: "Sign in",
    hint: "Email and password.",
    toggle: "Need an account?",
    autoComplete: "current-password",
  },
  "sign-up": {
    title: "Create account",
    hint: "Passwords must be at least 12 characters.",
    toggle: "Already have an account?",
    autoComplete: "new-password",
  },
} as const

function authenticate(mode: Mode, email: string, password: string) {
  if (mode === "sign-in") return signIn.email({ email, password })
  return signUp.email({ email, password, name: email.split("@")[0] ?? email })
}

/** Form state and the submit flow: call the auth client, then refresh the router and go home. */
function useAuthForm(mode: Mode) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const result = await authenticate(mode, email, password)
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? "Authentication failed")
      return
    }
    await router.invalidate()
    await router.navigate({ to: "/" })
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    clearError: () => setError(null),
    pending,
    submit,
  }
}

type FieldProps = {
  id: string
  label: string
  type: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  minLength?: number
}

function Field({ id, label, onChange, ...input }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required onChange={(e) => onChange(e.target.value)} {...input} />
    </div>
  )
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("sign-in")
  const form = useAuthForm(mode)
  const copy = COPY[mode]

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.hint}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => void form.submit(e)}>
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={form.setEmail}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={copy.autoComplete}
          minLength={12}
          value={form.password}
          onChange={form.setPassword}
        />
        {form.error ? (
          <p role="alert" className="text-sm text-destructive">
            {form.error}
          </p>
        ) : null}
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "…" : copy.title}
        </Button>
      </form>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          form.clearError()
          setMode(mode === "sign-in" ? "sign-up" : "sign-in")
        }}
      >
        {copy.toggle}
      </Button>
    </main>
  )
}
