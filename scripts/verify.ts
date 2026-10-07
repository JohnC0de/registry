/**
 * Local end-to-end check (no CI): build the registry, scaffold a fresh @tanstack/cli app the way
 * `p new --template web` does (same flags, `p adopt`, pinned shadcn), install every item from the
 * built files, then lint, typecheck, build, test, boot the production entry and run it against Postgres.
 * Any failing step throws and exits non-zero.
 */
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const items = ["env", "db", "auth-gate", "owned-table", "health", "docker", "guards"] as const
const bun = process.execPath
const TANSTACK_CLI = "@tanstack/cli@0.71.1"
const SHADCN = "shadcn@4.21.1"

type RegistryJson = { items: { name: string; envVars?: Record<string, string>; files: { target: string }[] }[] }
const registryJson = JSON.parse(await readFile(join(root, "registry.json"), "utf8")) as RegistryJson
/** Files the registry ships, as paths inside a consumer app. Lint and format findings here fail verify. */
const shippedFiles = new Set(registryJson.items.flatMap((item) => item.files.map((file) => file.target.replace(/^~\//, ""))))

async function run(label: string, argv: string[], cwd: string, env: Record<string, string> = {}) {
  console.log(`\n=== ${label}: ${argv.join(" ")}`)
  const proc = Bun.spawn(argv, {
    cwd,
    env: { ...process.env, CI: "1", ...env },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`)
}


async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name)).map((e) => join(e.parentPath, e.name))
}

// Drops block comments but leaves strings alone: tsconfig globs contain comment-like markers.
function stripBlockComments(jsonc: string) {
  return jsonc.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\//g, (m) => (m.startsWith('"') ? m : ""))
}

/** The scaffold ships `#/` as its alias; the registry code uses `@/`. */
async function rewriteAlias(app: string) {
  const tsconfigPath = join(app, "tsconfig.json")
  const tsconfig = JSON.parse(stripBlockComments(await readFile(tsconfigPath, "utf8")))
  if (!tsconfig.compilerOptions?.paths?.["#/*"]) throw new Error("scaffold changed: tsconfig #/* path not found")
  tsconfig.compilerOptions.paths = { "@/*": ["./src/*"] }
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2))

  const pkgPath = join(app, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
  if (!pkg.imports?.["#/*"]) throw new Error("scaffold changed: package.json imports #/* not found")
  delete pkg.imports
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2))

  let rewritten = 0
  for (const file of await sourceFiles(join(app, "src"))) {
    const text = await readFile(file, "utf8")
    const next = text.replace(/(['"])#\//g, "$1@/")
    if (next !== text) {
      await writeFile(file, next)
      rewritten++
    }
  }
  console.log(`alias: #/ to @/ in ${rewritten} source files`)
}

async function configureComponents(app: string, registryUrl: string) {
  const path = join(app, "components.json")
  const text = await readFile(path, "utf8")
  if (!text.includes("#/")) throw new Error("scaffold changed: components.json has no #/ alias")
  const components = JSON.parse(text.replaceAll("#/", "@/"))
  components.registries = { "@john": `${registryUrl}/{name}.json` }
  await writeFile(path, JSON.stringify(components, null, 2))
}

async function expectOk(url: string, check: (res: Response) => Promise<void> | void) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  await check(res)
}

async function freePort() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const { port } = probe
  await probe.stop(true)
  return port
}

/** Boot the docker item's serve.ts on the build output, wait until `/api/health{query}` answers, run `fn`, stop it. */
async function withApp(app: string, env: Record<string, string>, query: string, fn: (base: string) => Promise<void>) {
  const port = await freePort()
  const base = `http://localhost:${port}`
  console.log(`
=== app: bun serve.ts on ${base}`)
  const proc = Bun.spawn([bun, "serve.ts"], {
    cwd: app,
    env: { ...process.env, ...env, PORT: String(port), NODE_ENV: "production", BETTER_AUTH_URL: base },
    stdout: "inherit",
    stderr: "inherit",
  })
  try {
    let up = false
    for (let i = 0; i < 50 && !up; i++) {
      up = await fetch(`${base}/api/health${query}`).then((r) => r.ok, () => false)
      if (!up) await Bun.sleep(200)
    }
    if (!up) throw new Error(`serve.ts did not become healthy at /api/health${query}`)
    await fn(base)
  } finally {
    proc.kill()
    await proc.exited
  }
}

/** serve.ts against the real build output: page, asset, health and path traversal. */
async function smokeServe(app: string) {
  await withApp(app, {}, "", async (base) => {
    await expectOk(`${base}/api/health`, async (res) => {
      if ((await res.json()).ok !== true) throw new Error("/api/health body is not ok:true")
    })
    await expectOk(`${base}/`, () => {})
    const [asset] = (await readdir(join(app, "dist", "client", "assets"))).filter((f) => f.endsWith(".css"))
    if (!asset) throw new Error("no css asset in dist/client/assets")
    await expectOk(`${base}/assets/${asset}`, (res) => {
      if (!res.headers.get("content-type")?.includes("css")) throw new Error("css asset has wrong content-type")
    })
    const traversal = await fetch(`${base}/..%2f..%2fpackage.json`)
    if (traversal.headers.get("content-type")?.includes("json")) throw new Error("serve.ts leaked a file outside dist/client")
  })
}

async function capture(argv: string[], cwd: string, env: Record<string, string>) {
  const proc = Bun.spawn(argv, { cwd, env: { ...process.env, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { code, output: out + err, stdout: out }
}

/** The way `p new` leaves an app: p adopt (lint/format/fallow presets), then a clean install. */
async function adoptAndInstall(app: string) {
  await run("git init", ["git", "init", "-q", "-b", "main"], app)
  await run("p adopt", ["p", "adopt", app], app)
  await run("install (adopted)", [bun, "install"], app)
}

/** A fresh app the way `p new` builds it: scaffold, alias, `p adopt`, then `shadcn add` for `names`. */
async function scaffoldApp(parent: string, name: string, names: readonly string[], registryUrl: string) {
  const dir = join(parent, name)
  await run(
    `scaffold ${name}`,
    [bun, "x", TANSTACK_CLI, "create", name, "--non-interactive", "--no-git", "--no-install", "--no-intent", "--blank", "--no-toolchain", "--package-manager", "bun", "--add-ons", "shadcn,tanstack-query"],
    parent,
  )
  await rewriteAlias(dir)
  await configureComponents(dir, registryUrl)
  await adoptAndInstall(dir)
  await run(`shadcn add (${name})`, [bun, "x", SHADCN, "add", ...names.map((i) => `@john/${i}`), "--yes"], dir)
  await run(`install (${name})`, [bun, "install"], dir)
  if (existsSync(join(dir, "package-lock.json"))) throw new Error("shadcn add used npm: package-lock.json exists")
  await addPNewFiles(dir)
  return dir
}

/** Kit `auth` has no owned-table: the `_authed` layout must still build (it needs a child route). */
async function authKitSubset(parent: string, registryUrl: string) {
  const kit = ["env", "db", "auth-gate", "health", "docker", "guards"]
  const dir = await scaffoldApp(parent, "subset", kit, registryUrl)
  await run("subset vite build", [bun, "x", "vite", "build"], dir)
  await run("subset typecheck", [bun, "x", "tsc", "--noEmit"], dir)
}

/** What `p new` adds because a registry item cannot ship package.json scripts or .env.example. */
async function addPNewFiles(app: string) {
  const pkgPath = join(app, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { scripts: Record<string, string> }
  pkg.scripts = {
    ...pkg.scripts,
    test: "bun test --pass-with-no-tests",
    "build:check": "bun scripts/build-check.ts",
    "db:start": "docker compose up -d",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run scripts/migrate.ts",
    "db:migrate:production": "bun run scripts/migrate-production.ts",
    "db:studio": "drizzle-kit studio",
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
  const envVars = registryJson.items.flatMap((item) => Object.entries(item.envVars ?? {}))
  await writeFile(join(app, ".env.example"), `${envVars.map(([key, value]) => `${key}=${value}`).join("\n")}\n`)
}

/**
 * Lint and format the way p does it. Findings in starter files (integrations, router, ui/button) are
 * allowed; any finding in a file the registry ships fails verify.
 */
async function lintAndFormat(app: string) {
  console.log("\n=== lint and format:check (registry-shipped files must be clean)")
  const lint = await capture([bun, "run", "lint", "--format", "json"], app, {})
  let diagnostics: { filename: string; code: string; message: string; labels?: { span?: { line?: number } }[] }[]
  try {
    diagnostics = (JSON.parse(lint.stdout) as { diagnostics: typeof diagnostics }).diagnostics
  } catch {
    throw new Error(`lint did not print JSON (exit ${lint.code}): ${lint.output.slice(0, 2000)}`)
  }
  if (!Array.isArray(diagnostics)) throw new Error("lint JSON has no diagnostics array")
  const ours = diagnostics.filter((d) => shippedFiles.has(d.filename.replaceAll("\\", "/")))
  console.log(`lint: ${diagnostics.length} findings, ${ours.length} in registry files, ${diagnostics.length - ours.length} in starter files (allowed)`)
  if (ours.length > 0) {
    const lines = ours.map((d) => `  ${d.filename}:${d.labels?.[0]?.span?.line ?? "?"} ${d.code} ${d.message.split("\n")[0]}`)
    throw new Error(`lint findings in registry files:\n${lines.join("\n")}`)
  }

  const format = await capture([bun, "run", "format:check"], app, {})
  const unformatted = [...format.output.matchAll(/^(\S.*?) \(\d+ms\)$/gmu)].map((m) => (m[1] ?? "").replaceAll("\\", "/"))
  if (unformatted.length === 0 && format.code !== 0) throw new Error(`format:check failed with no file list: ${format.output.slice(0, 2000)}`)
  const badOurs = unformatted.filter((file) => shippedFiles.has(file))
  console.log(`format: ${unformatted.length} unformatted files, ${badOurs.length} in registry files`)
  if (badOurs.length > 0) throw new Error(`unformatted registry files: ${badOurs.join(", ")}`)
}

/** File paths named by a fallow JSON report: every `path` and `files` entry of every finding list. */
function fallowPaths(report: Record<string, unknown>): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(report)) {
    if (!Array.isArray(value) || key === "next_steps" || key === "file_scores") continue
    for (const finding of value as { path?: unknown; files?: unknown }[]) {
      if (typeof finding.path === "string") paths.push(finding.path)
      if (Array.isArray(finding.files)) paths.push(...finding.files.filter((f): f is string => typeof f === "string"))
    }
  }
  return paths.map((path) => path.replaceAll("\\", "/"))
}

/**
 * fallow as p's scaffold runs it (pinned by `p adopt`): `dead-code` (unused exports and files, cycles) and
 * `health` (complexity). A finding in a registry-shipped file fails verify; starter and dependency findings are allowed.
 */
async function fallowGate(app: string) {
  console.log("\n=== fallow dead-code and health (registry-shipped files must be clean)")
  for (const command of ["dead-code", "health"]) {
    const result = await capture([bun, "x", "fallow", command, "--format", "json"], app, {})
    let report: Record<string, unknown>
    try {
      report = JSON.parse(result.stdout) as Record<string, unknown>
    } catch {
      throw new Error(`fallow ${command} did not print JSON (exit ${result.code}): ${result.output.slice(0, 2000)}`)
    }
    if (report.kind === undefined) throw new Error(`fallow ${command} JSON has no kind: ${result.stdout.slice(0, 500)}`)
    const all = fallowPaths(report)
    const ours = all.filter((path) => shippedFiles.has(path))
    console.log(`fallow ${command}: ${all.length} findings, ${ours.length} in registry files`)
    if (ours.length > 0) throw new Error(`fallow ${command} findings in registry files: ${[...new Set(ours)].join(", ")}\n${result.stdout.slice(0, 3000)}`)
  }
}

/**
 * Import protection: a client route that imports getServerEnv must fail `vite build`. Without the
 * server-only marker in src/env.ts the build would pass and ship server code to dist/client.
 */
async function serverOnlyProof(app: string) {
  console.log("\n=== server-only: a client import of getServerEnv must fail the build")
  const probe = join(app, "src", "routes", "leak-probe.tsx")
  await writeFile(
    probe,
    `import { createFileRoute } from "@tanstack/react-router"\nimport { getServerEnv } from "@/env"\n\nexport const Route = createFileRoute("/leak-probe")({\n  component: () => <p>{getServerEnv().NODE_ENV}</p>,\n})\n`,
  )
  try {
    const build = await capture([bun, "x", "vite", "build"], app, {})
    if (build.code === 0) throw new Error("vite build passed although a client route imports getServerEnv")
    if (!/import-protection|Import denied/iu.test(build.output)) throw new Error(`build failed, but not with import-protection: ${build.output.slice(-1500)}`)
    console.log("server-only: build failed with import-protection, as required")
  } finally {
    await rm(probe, { force: true })
  }
  await rm(join(app, "dist"), { recursive: true, force: true })
}

/** build:check must fail on a leaked secret and on a build that changes the tracked route tree. */
async function buildCheckProof(app: string) {
  console.log("\n=== build:check: it must catch a leaked secret and a changed route tree")
  const viteConfig = join(app, "vite.config.ts")
  const indexRoute = join(app, "src", "routes", "index.tsx")
  const [viteOriginal, indexOriginal] = await Promise.all([readFile(viteConfig, "utf8"), readFile(indexRoute, "utf8")])
  try {
    // A `define` of a server env var puts its value into the client bundle: the exact leak the canary scan exists for.
    if (!viteOriginal.includes("plugins:")) throw new Error("scaffold changed: vite.config.ts has no plugins key")
    await writeFile(viteConfig, viteOriginal.replace("plugins:", "define: { __LEAK__: JSON.stringify(process.env.BETTER_AUTH_SECRET) },\n  plugins:"))
    await writeFile(indexRoute, `declare const __LEAK__: string\n${indexOriginal.replace("<h1>", "<h1 title={__LEAK__}>")}`)
    const leak = await capture([bun, "run", "build:check"], app, {})
    if (leak.code === 0 || !leak.output.includes("BETTER_AUTH_SECRET")) throw new Error(`build:check missed a leaked secret (exit ${leak.code}): ${leak.output.slice(-800)}`)
  } finally {
    await writeFile(viteConfig, viteOriginal)
    await writeFile(indexRoute, indexOriginal)
  }

  const probe = join(app, "src", "routes", "tree-probe.tsx")
  await writeFile(probe, `import { createFileRoute } from "@tanstack/react-router"\n\nexport const Route = createFileRoute("/tree-probe")({ component: () => <p>probe</p> })\n`)
  try {
    const stale = await capture([bun, "run", "build:check"], app, {})
    if (stale.code === 0 || !stale.output.includes("routeTree.gen.ts")) throw new Error(`build:check missed a changed route tree (exit ${stale.code}): ${stale.output.slice(-800)}`)
  } finally {
    await rm(probe, { force: true })
  }
  await run("restore the route tree", [bun, "x", "vite", "build"], app)
}

/** The Coolify compose file: one-shot migrate, app waits for it, no secret baked into the image. */
async function coolifyCompose(app: string) {
  console.log("\n=== coolify compose and image secrets")
  const text = await readFile(join(app, "docker-compose.coolify.yml"), "utf8")
  for (const needle of ['restart: "no"', "exclude_from_hc: true", "condition: service_completed_successfully", "scripts/migrate.ts"]) {
    if (!text.includes(needle)) throw new Error(`docker-compose.coolify.yml lacks ${needle}`)
  }
  // `exclude_from_hc` is a Coolify key: plain docker compose rejects it, so validate a copy without it.
  const plain = join(app, "docker-compose.plain.yml")
  await writeFile(plain, text.replace(/^\s*exclude_from_hc: true\n/mu, ""))
  try {
    const env = { DATABASE_URL: "postgresql://x", BETTER_AUTH_SECRET: "x", BETTER_AUTH_URL: "http://x" }
    await run("compose config", ["docker", "compose", "-f", plain, "config", "--quiet"], app, env)
  } finally {
    await rm(plain, { force: true })
  }
  const dockerfile = await readFile(join(app, "Dockerfile"), "utf8")
  if (/^\s*(?:ARG|ENV)\s+\w*(?:SECRET|PASSWORD|DATABASE_URL|TOKEN)/imu.test(dockerfile)) throw new Error("Dockerfile bakes a secret as ARG or ENV")
  if (/^\s*ARG\s+(?!VITE_)/mu.test(dockerfile)) throw new Error("Dockerfile has a build ARG that is not VITE_*")
}

/** The image runs migrations against a fresh database: the tables must exist afterwards. */
async function imageMigrate(app: string, compose: string[], dbPort: number, env: Record<string, string>, image: string) {
  console.log("\n=== image migrate (fresh database)")
  const psql = (db: string, sql: string) => capture([...compose, "exec", "-T", "db", "psql", "-U", "postgres", "-d", db, "-tA", "-c", sql], app, env)
  const created = await psql("postgres", "create database migrate_probe")
  if (created.code !== 0) throw new Error(`could not create the probe database: ${created.output}`)
  const url = `postgresql://postgres:postgres@host.docker.internal:${dbPort}/migrate_probe`
  await run(
    "docker run migrate",
    ["docker", "run", "--rm", "--add-host", "host.docker.internal:host-gateway", "-e", `DATABASE_URL=${url}`, image, "bun", "run", "scripts/migrate.ts"],
    app,
  )
  const tables = await psql("migrate_probe", "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('user', 'session', 'account', 'verification', 'notes')")
  if (tables.stdout.trim() !== "5") throw new Error(`the image migration made ${tables.stdout.trim()} of 5 tables`)
}

/** The production migration guard: refuses without a URL or on the dev URL, lists pending without --yes, applies with it. */
async function migrationGuard(app: string, env: { DATABASE_URL: string }) {
  console.log("\n=== migrate-production guard")
  const script = [bun, "run", "db:migrate:production", "--"]
  const mustRefuse = async (args: string[], what: string) => {
    const { code, output } = await capture([...script, ...args], app, env)
    if (code === 0 || !output.includes("refusing")) throw new Error(`migrate-production did not refuse ${what} (exit ${code}): ${output}`)
  }
  await mustRefuse([], "to run without --production-url")
  await mustRefuse(["--production-url", env.DATABASE_URL, "--yes"], "the development URL")

  // The server's default `postgres` database stands in for production: it has no migration history.
  const prodUrl = env.DATABASE_URL.replace(/\/app$/, "/postgres")
  if (prodUrl === env.DATABASE_URL) throw new Error("could not derive the stand-in production URL")
  const listed = async (args: string[]) => {
    const { code, output } = await capture([...script, "--production-url", prodUrl, ...args], app, env)
    if (code !== 0) throw new Error(`migrate-production failed (exit ${code}): ${output}`)
    return output
  }
  const dry = await listed([])
  if (!dry.includes('"pending":["0000_') || !dry.includes("dry run")) throw new Error(`dry run did not list pending migrations: ${dry}`)
  const applied = await listed(["--yes"])
  if (!applied.includes("applied 1 migration")) throw new Error(`--yes did not apply: ${applied}`)
  if (!(await listed([])).includes("nothing to apply")) throw new Error("applied migrations still show as pending")
}

/**
 * The db item's compose file, migrations from drizzle-kit, then the app over HTTP (scripts/e2e.ts):
 * auth gate and ownership against a real Postgres. Compose project and port are unique, and it is always torn down.
 */
async function e2eWithPostgres(app: string, image: string) {
  const project = `registry-verify-${crypto.randomUUID().slice(0, 8)}`
  const dbPort = await freePort()
  const env = {
    DB_PORT: String(dbPort),
    DATABASE_URL: `postgresql://postgres:postgres@localhost:${dbPort}/app`,
    BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  }
  const compose = ["docker", "compose", "-p", project]

  try {
    await run("postgres up", [...compose, "up", "-d", "--wait"], app, env)
    await run("db:generate", [bun, "run", "db:generate"], app, env)
    await run("db:migrate", [bun, "run", "db:migrate"], app, env)
    await migrationGuard(app, env)
    // Copied in only for the run: the Docker build typechecks the whole app and must not see it.
    const e2eFile = join(app, "e2e.verify.ts")
    await writeFile(e2eFile, await readFile(join(root, "scripts", "e2e.ts"), "utf8"))
    try {
      await withApp(app, env, "?deep=1", (base) => run("e2e", [bun, "e2e.verify.ts"], app, { BASE: base }))
    } finally {
      await rm(e2eFile, { force: true })
    }
    imageBuilt = true
    await run("docker build", ["docker", "build", "-t", image, "."], app)
    await imageMigrate(app, compose, dbPort, env, image)
  } finally {
    await run("postgres down", [...compose, "down", "-v"], app, env)
  }
}

const work = await mkdtemp(join(tmpdir(), "registry-verify-"))
const app = join(work, "app")
const imageTag = "registry-verify"
let imageBuilt = false
let server: ReturnType<typeof Bun.serve> | undefined
try {
  await run("build registry", [bun, "run", "build"], root)
  // CRLF checked out on Windows would be baked (JSON-escaped) into every shipped file.
  for (const file of await readdir(join(root, "public", "r"))) {
    if ((await readFile(join(root, "public", "r", file), "utf8")).includes("\\r\\n")) throw new Error(`public/r/${file} contains CRLF line endings`)
  }

  server = Bun.serve({ port: 0, fetch: (req) => new Response(Bun.file(join(root, "public", "r", new URL(req.url).pathname))) })
  const registryUrl = `http://localhost:${server.port}`

  await scaffoldApp(work, "app", items, registryUrl)
  await authKitSubset(work, registryUrl)

  await run("vite build (generates the route tree)", [bun, "x", "vite", "build"], app)
  await run("track the route tree", ["git", "add", "src/routeTree.gen.ts"], app)
  await serverOnlyProof(app)
  await buildCheckProof(app)
  await lintAndFormat(app)
  await fallowGate(app)
  await run("typecheck", [bun, "x", "tsc", "--noEmit"], app)
  await run("test (includes deps.test.ts)", [bun, "run", "test"], app)
  await run("build:check", [bun, "run", "build:check"], app)
  await coolifyCompose(app)
  await smokeServe(app)

  await e2eWithPostgres(app, imageTag)

  console.log("\nverify: OK")
  if (process.env.VERIFY_KEEP) console.log(`workdir kept: ${work}`)
  else await rm(work, { recursive: true, force: true })
} catch (error) {
  console.error(`\nverify: FAILED\n${error instanceof Error ? error.message : error}\nworkdir kept: ${work}`)
  process.exitCode = 1
} finally {
  await server?.stop(true)
  if (imageBuilt) await run("remove image", ["docker", "image", "rm", "-f", imageTag], root).catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
}
