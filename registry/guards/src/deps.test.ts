/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const SERVER_CORE_FLOOR = "1.169.39"

/** Every resolved version of `name` in bun.lock text: the `"name@x.y.z"` ids, not dependency ranges. */
function resolvedVersions(lock: string, name: string): string[] {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`)
  const ids = lock.matchAll(new RegExp(`"${escaped}@([^"]+)"`, "gu"))
  return [...new Set([...ids].map((m) => m[1] ?? ""))]
}

function routerCoreVersions(lock: string) {
  return resolvedVersions(lock, "@tanstack/router-core")
}

function serverCoreBelowFloor(lock: string) {
  return resolvedVersions(lock, "@tanstack/start-server-core").filter(
    (version) => Bun.semver.order(version, SERVER_CORE_FLOOR) < 0,
  )
}

/** A bun.lock package line. A nested copy has a path key but the same `name@version` id. */
function lockEntry(name: string, version: string, key = name) {
  const id = `${name}@${version}`
  return `    "${key}": ["${id}", "", {}, "sha512-x"],\n`
}

describe("bun.lock", () => {
  test("keeps one @tanstack/router-core version", async () => {
    const lock = await Bun.file(join(import.meta.dir, "..", "bun.lock")).text()
    expect(routerCoreVersions(lock).length).toBeGreaterThan(0)
    expect(routerCoreVersions(lock)).toHaveLength(1)
  })

  test("keeps @tanstack/start-server-core at or above the CVE-2026-102989 fix", async () => {
    const lock = await Bun.file(join(import.meta.dir, "..", "bun.lock")).text()
    expect(resolvedVersions(lock, "@tanstack/start-server-core").length).toBeGreaterThan(0)
    expect(serverCoreBelowFloor(lock)).toEqual([])
  })
})

describe("the lock checks catch the real bugs", () => {
  test("two router-core versions are reported", () => {
    const lock =
      lockEntry("@tanstack/router-core", "1.171.34") +
      lockEntry("@tanstack/router-core", "1.170.0", "@tanstack/react-router/@tanstack/router-core")
    expect(routerCoreVersions(lock)).toEqual(["1.171.34", "1.170.0"])
    expect(routerCoreVersions(lockEntry("@tanstack/router-core", "1.171.34"))).toHaveLength(1)
  })

  test("a dependency range is not a resolved version", () => {
    const lock = `"@tanstack/router-core": "1.170.0",\n${lockEntry("@tanstack/router-core", "1.171.34")}`
    expect(routerCoreVersions(lock)).toEqual(["1.171.34"])
  })

  test("start-server-core below the floor is reported, the floor and above are not", () => {
    expect(serverCoreBelowFloor(lockEntry("@tanstack/start-server-core", "1.169.38"))).toEqual([
      "1.169.38",
    ])
    expect(serverCoreBelowFloor(lockEntry("@tanstack/start-server-core", "1.168.99"))).toEqual([
      "1.168.99",
    ])
    expect(
      serverCoreBelowFloor(lockEntry("@tanstack/start-server-core", SERVER_CORE_FLOOR)),
    ).toEqual([])
    expect(serverCoreBelowFloor(lockEntry("@tanstack/start-server-core", "1.170.1"))).toEqual([])
  })
})
