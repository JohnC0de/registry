/**
 * Local end-to-end check (no CI): build the registry, scaffold a fresh @tanstack/cli app, install every
 * item from the built files, then typecheck, build, test and boot the production entry.
 * Any failing step throws and exits non-zero.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const items = ["env", "db", "auth-gate", "owned-table", "health", "docker"] as const
const bun = process.execPath

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

/** Boot the docker item's serve.ts against the real build output and hit page, asset and health. */
async function smokeServe(app: string) {
  const port = 3900 + Math.floor(Math.random() * 90)
  const base = `http://localhost:${port}`
  console.log(`\n=== smoke: bun serve.ts on ${base}`)
  const proc = Bun.spawn([bun, "serve.ts"], {
    cwd: app,
    env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
    stdout: "inherit",
    stderr: "inherit",
  })
  try {
    let up = false
    for (let i = 0; i < 50 && !up; i++) {
      up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false)
      if (!up) await Bun.sleep(200)
    }
    if (!up) throw new Error("serve.ts did not become healthy")
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
  } finally {
    proc.kill()
    await proc.exited
  }
}

async function dockerAvailable() {
  const proc = Bun.spawn(["docker", "info"], { stdout: "ignore", stderr: "ignore" })
  return (await proc.exited.catch(() => 1)) === 0
}

const work = await mkdtemp(join(tmpdir(), "registry-verify-"))
const app = join(work, "app")
let server: ReturnType<typeof Bun.serve> | undefined
try {
  await run("build registry", [bun, "run", "build"], root)

  server = Bun.serve({ port: 0, fetch: (req) => new Response(Bun.file(join(root, "public", "r", new URL(req.url).pathname))) })
  const registryUrl = `http://localhost:${server.port}`

  await run(
    "scaffold",
    [bun, "x", "@tanstack/cli", "create", "app", "--non-interactive", "--no-git", "--no-install", "--package-manager", "bun", "--add-ons", "shadcn,tanstack-query"],
    work,
  )
  await rewriteAlias(app)
  await configureComponents(app, registryUrl)

  await run("shadcn add", [bun, "x", "shadcn@latest", "add", ...items.map((i) => `@john/${i}`), "--yes"], app)
  await run("install", [bun, "install"], app)
  await run("vite build (generates the route tree)", [bun, "x", "vite", "build"], app)
  await run("typecheck", [bun, "x", "tsc", "--noEmit"], app)
  await run("test", [bun, "test"], app)
  await smokeServe(app)

  if (await dockerAvailable()) await run("docker build", ["docker", "build", "-t", "registry-verify", "."], app)
  else console.log("\n=== docker build: SKIPPED (docker daemon not available)")

  console.log("\nverify: OK")
  await rm(work, { recursive: true, force: true })
} catch (error) {
  console.error(`\nverify: FAILED\n${error instanceof Error ? error.message : error}\nworkdir kept: ${work}`)
  process.exitCode = 1
} finally {
  await server?.stop(true)
}
