/// <reference types="bun" />
import { describe, expect, test } from "bun:test"

import {
  hostFromUrlOrPattern,
  isHostAllowed,
  resolveAllowedHosts,
} from "@/lib/auth/origins"

const prodUrl = "https://app.example.com"
const localFallback = "https://myapp.localhost"

describe("hostFromUrlOrPattern", () => {
  test("extracts host from absolute URLs", () => {
    expect(hostFromUrlOrPattern("https://myapp.localhost")).toBe("myapp.localhost")
    expect(hostFromUrlOrPattern("http://localhost:4308")).toBe("localhost:4308")
  })

  test("keeps bare host and wildcard patterns", () => {
    expect(hostFromUrlOrPattern("*.localhost")).toBe("*.localhost")
    expect(hostFromUrlOrPattern("  app.example.com  ")).toBe("app.example.com")
  })
})

describe("resolveAllowedHosts (development)", () => {
  test("allows any loopback port via class patterns, not a fixed port list", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "development",
      // Fallback host may include a port; wildcards still cover other ports.
      betterAuthUrl: "http://localhost:3000",
    })

    expect(isHostAllowed("localhost:4308", hosts)).toBe(true)
    expect(isHostAllowed("localhost:5173", hosts)).toBe(true)
    expect(isHostAllowed("127.0.0.1:9999", hosts)).toBe(true)
    expect(isHostAllowed("localhost", hosts)).toBe(true)
    // Dual-mode mechanism is class wildcards - not app-name or fixed-port entries.
    expect(hosts).toContain("localhost:*")
    expect(hosts).toContain("*.localhost")
    expect(hosts.some((h) => h === "localhost:4308")).toBe(false)
    expect(hosts.some((h) => h.includes("myapp"))).toBe(false)
  })

  test("allows Portless-style .localhost and nested worktree hosts without naming the app", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "development",
      betterAuthUrl: localFallback,
    })

    expect(isHostAllowed("myapp.localhost", hosts)).toBe(true)
    expect(isHostAllowed("feature.myapp.localhost", hosts)).toBe(true)
    expect(isHostAllowed("other-app.localhost", hosts)).toBe(true)
  })

  test("includes PORTLESS_URL host when present", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "development",
      betterAuthUrl: localFallback,
      portlessUrl: "https://myapp.localhost",
    })

    expect(hosts).toContain("myapp.localhost")
    expect(isHostAllowed("myapp.localhost", hosts)).toBe(true)
  })

  test("merges explicit extra trusted origins as hosts", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "development",
      betterAuthUrl: localFallback,
      extraTrustedOrigins: ["https://preview.example.com", "staging.example.com"],
    })

    expect(isHostAllowed("preview.example.com", hosts)).toBe(true)
    expect(isHostAllowed("staging.example.com", hosts)).toBe(true)
  })
})

describe("resolveAllowedHosts (production)", () => {
  test("only allows BETTER_AUTH_URL host and optional extras", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "production",
      betterAuthUrl: prodUrl,
    })

    expect(hosts).toEqual(["app.example.com"])
    expect(isHostAllowed("app.example.com", hosts)).toBe(true)
    expect(isHostAllowed("evil.com", hosts)).toBe(false)
    expect(isHostAllowed("localhost:4308", hosts)).toBe(false)
    expect(isHostAllowed("myapp.localhost", hosts)).toBe(false)
    expect(isHostAllowed("feature.myapp.localhost", hosts)).toBe(false)
  })

  test("PORTLESS_URL alone does not open production to loopback wildcards", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "production",
      betterAuthUrl: prodUrl,
      portlessUrl: "https://myapp.localhost",
    })

    expect(hosts).toContain("app.example.com")
    expect(hosts).toContain("myapp.localhost")
    expect(hosts.some((h) => h === "localhost:*" || h === "*.localhost")).toBe(false)
    expect(isHostAllowed("evil.com", hosts)).toBe(false)
    expect(isHostAllowed("other-app.localhost", hosts)).toBe(false)
  })

  test("optional extras expand production allowlist only for listed hosts", () => {
    const hosts = resolveAllowedHosts({
      nodeEnv: "production",
      betterAuthUrl: prodUrl,
      extraTrustedOrigins: ["https://cdn.example.com"],
    })

    expect(isHostAllowed("cdn.example.com", hosts)).toBe(true)
    expect(isHostAllowed("evil.com", hosts)).toBe(false)
  })
})
