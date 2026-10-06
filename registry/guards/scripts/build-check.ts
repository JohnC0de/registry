/**
 * Build with a unique canary in every server-side env key, then fail when a canary shows up in
 * dist/client (server code reached the browser) or when the build changed a tracked route tree.
 * Keys come from `.env.example`; `VITE_*` keys are public by design and skipped.
 */
import { existsSync, readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

function serverKeys(): string[] {
  const file = join(root, ".env.example")
  if (!existsSync(file)) return []
  const keys = [...readFileSync(file, "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gmu)].map((m) => m[1])
  return keys.filter((key) => !key.startsWith("VITE_"))
}

async function git(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code > 1) throw new Error(`git ${args.join(" ")} failed (exit ${code}): ${err}`)
  return { code, out }
}

async function buildWithCanaries(canaries: Record<string, string>) {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: root,
    env: { ...process.env, ...canaries },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`build:check: bun run build failed with exit code ${code}`)
}

async function scanClient(canaries: Record<string, string>) {
  const dir = join(root, "dist", "client")
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const files = entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name))
  await Promise.all(
    files.map(async (path) => {
      // latin1 keeps every byte, so a canary inside a binary file still matches.
      const text = await readFile(path, "latin1")
      for (const [key, value] of Object.entries(canaries)) {
        if (text.includes(value)) throw new Error(`build:check: the value of ${key} is in ${path}`)
      }
    }),
  )
}

async function main() {
  const keys = serverKeys()
  const canaries: Record<string, string> = {}
  for (const key of keys) canaries[key] = `canary-${key}-${crypto.randomUUID()}`

  await buildWithCanaries(canaries)
  await scanClient(canaries)

  const tree = "src/routeTree.gen.ts"
  const listed = await git(["ls-files", "-z", "--", tree])
  if (listed.out !== "") {
    const diff = await git(["diff", "--quiet", "--", tree])
    if (diff.code !== 0) throw new Error(`build:check: the build changed ${tree}; commit it`)
  }
  console.info(`build:check ok: ${keys.length} server keys, none in dist/client`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
