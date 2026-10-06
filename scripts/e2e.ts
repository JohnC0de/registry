/**
 * Runs inside the scaffolded app (verify copies it there, so `seroval` resolves from the app's
 * node_modules). Drives the built app over HTTP: two Better Auth sign-ups, then the notes server fns.
 * Server fns are called with the same wire format the TanStack Start client uses.
 */
import { readFileSync } from "node:fs"
import { fromCrossJSON, toJSONAsync } from "seroval"

const base = process.env.BASE
if (!base) throw new Error("BASE is required")

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`e2e: ${message}`)
}

/** Function ids are hashes; the server manifest in the build output maps them to export names. */
function serverFnIds() {
  const source = readFileSync("dist/server/server.js", "utf8")
  const ids = new Map<string, string>()
  for (const [, id, name] of source.matchAll(/"([0-9a-f]{64})": \{\s*functionName: "(\$\w+)_createServerFn_handler"/g)) {
    ids.set(name!, id!)
  }
  for (const name of ["$listNotes", "$createNote", "$updateNote", "$deleteNote"]) check(ids.has(name), `server fn ${name} not in build manifest`)
  return ids
}
const ids = serverFnIds()

type FnResult = { status: number; body: unknown; raw: unknown; headers: Headers }

async function callFn(name: string, cookie: string | undefined, data?: unknown): Promise<FnResult> {
  // Start rejects server fn calls without a same-origin Origin header, as a browser would send.
  const headers: Record<string, string> = { "x-tsr-serverFn": "true", accept: "application/json", origin: base }
  if (cookie) headers.cookie = cookie
  let body: string | undefined
  if (data !== undefined) {
    headers["content-type"] = "application/json"
    body = JSON.stringify(await toJSONAsync({ data }))
  }
  const res = await fetch(`${base}/_serverFn/${ids.get(name)}`, { method: data === undefined ? "GET" : "POST", headers, body })
  const json: unknown = await res.json()
  const parsed = res.headers.get("x-tss-serialized") ? fromCrossJSON(json as never, { plugins: [] }) : json
  // Successful calls wrap the handler's return value as `{ result, context }`.
  const result = parsed !== null && typeof parsed === "object" && "result" in parsed ? parsed.result : parsed
  return { status: res.status, body: result, raw: parsed, headers: res.headers }
}

type Note = { id: string; userId: string; title: string }

async function ok<T>(promise: Promise<FnResult>): Promise<T> {
  const { status, body } = await promise
  check(status === 200, `expected 200, got ${status}: ${JSON.stringify(body)}`)
  return body as T
}

/** A redirect to /login is how requireUser rejects: it must never come back as data. */
function expectLoginRedirect(result: FnResult, what: string) {
  check(JSON.stringify(result.body).includes("/login"), `${what} was not rejected with a /login redirect: ${result.status} ${JSON.stringify(result.body)}`)
}

const password = "correct horse battery"

async function signUp(name: string) {
  const email = `${name}-${crypto.randomUUID()}@example.com`
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password, name }),
  })
  const text = await res.text()
  check(res.ok, `sign-up ${name} answered ${res.status}: ${text}`)
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
  check(cookie, `sign-up ${name} set no session cookie`)
  const { user } = JSON.parse(text) as { user: { id: string } }
  return { cookie, id: user.id, email }
}

const a = await signUp("alice")
const b = await signUp("bob")

// Sign-in must carry Set-Cookie: tanstackStartCookies() has to be the last Better Auth plugin (better-auth#8911).
const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: a.email, password }),
})
check(signIn.ok, `sign-in answered ${signIn.status}`)
check(signIn.headers.getSetCookie().length > 0, "sign-in response carries no Set-Cookie")

// Unauthenticated: server fns and the protected page must reject.
expectLoginRedirect(await callFn("$listNotes", undefined), "unauthenticated $listNotes")
expectLoginRedirect(await callFn("$createNote", undefined, { title: "nope" }), "unauthenticated $createNote")
expectLoginRedirect(await callFn("$deleteNote", undefined, { id: "x" }), "unauthenticated $deleteNote")
const page = await fetch(`${base}/notes`, { redirect: "manual" })
check(page.status >= 300 && page.status < 400 && page.headers.get("location")?.includes("/login"), `unauthenticated /notes answered ${page.status} location=${page.headers.get("location")}`)

// Session-dependent responses must not be cached: a server fn answer and the protected page.
const noStoreFn = await callFn("$listNotes", a.cookie)
check(noStoreFn.headers.get("cache-control")?.includes("no-store"), `authed server fn cache-control is ${noStoreFn.headers.get("cache-control")}`)
const authedPage = await fetch(`${base}/notes`, { redirect: "manual", headers: { cookie: a.cookie } })
check(authedPage.status === 200, `signed-in /notes answered ${authedPage.status}`)
check(authedPage.headers.get("cache-control")?.includes("no-store"), `signed-in /notes cache-control is ${authedPage.headers.get("cache-control")}`)

// CSRF: Start rejects a cross-site POST to a server fn even with a valid session cookie.
const csrf = await fetch(`${base}/_serverFn/${ids.get("$createNote")}`, {
  method: "POST",
  headers: { "x-tsr-serverFn": "true", accept: "application/json", origin: base, cookie: a.cookie, "content-type": "application/json", "sec-fetch-site": "cross-site" },
  body: JSON.stringify(await toJSONAsync({ data: { title: "csrf" } })),
})
check(csrf.status === 403, `cross-site POST to a server fn answered ${csrf.status}, expected 403`)
check((await ok<Note[]>(callFn("$listNotes", a.cookie))).length === 0, "the cross-site POST created a note")

// Alice creates a note. A client-supplied userId must not decide the owner.
const created = await ok<Note>(callFn("$createNote", a.cookie, { title: "alice secret", userId: b.id }))
check(created.userId === a.id, `note owner is ${created.userId}, expected the session user ${a.id}: ${JSON.stringify(created)}`)

const aliceList = await ok<Note[]>(callFn("$listNotes", a.cookie))
check(aliceList.some((n) => n.id === created.id), "alice cannot list her own note")

// Bob: cannot list it, and deleting it by id changes nothing.
const bobList = await ok<Note[]>(callFn("$listNotes", b.cookie))
check(bobList.length === 0, `bob sees ${bobList.length} notes, expected 0`)
await ok(callFn("$deleteNote", b.cookie, { id: created.id }))
const afterBobDelete = await ok<Note[]>(callFn("$listNotes", a.cookie))
check(afterBobDelete.some((n) => n.id === created.id), "bob deleted alice's note")

// Bob: updating it by id is rejected and the title stays.
const bobUpdate = await callFn("$updateNote", b.cookie, { id: created.id, title: "hijacked" })
// Start serializes a thrown notFound() into a 200 response carrying `error.isNotFound`.
check(JSON.stringify(bobUpdate.raw).includes('"isNotFound":true'), `bob's update of alice's note was not rejected as not found: ${JSON.stringify(bobUpdate.raw)}`)
const afterBobUpdate = await ok<Note[]>(callFn("$listNotes", a.cookie))
check(afterBobUpdate.find((n) => n.id === created.id)?.title === "alice secret", "bob changed alice's note")
const aliceUpdate = await ok<Note>(callFn("$updateNote", a.cookie, { id: created.id, title: "alice edited" }))
check(aliceUpdate.title === "alice edited", "alice cannot update her own note")

// Alice can delete her own note: the owner check does not over-block.
await ok(callFn("$deleteNote", a.cookie, { id: created.id }))
check((await ok<Note[]>(callFn("$listNotes", a.cookie))).length === 0, "alice cannot delete her own note")

console.log("e2e: ownership, auth gate, no-store, CSRF and Set-Cookie OK")
