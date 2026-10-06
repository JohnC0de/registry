import { matchesHostPattern } from "better-auth"

export type ResolveAllowedHostsInput = {
  /** `development` | `test` | `production` - loopback patterns only when not production. */
  nodeEnv: string | undefined
  /** Canonical fallback origin (e.g. `BETTER_AUTH_URL`). */
  betterAuthUrl: string
  /** Public URL injected by Portless (`PORTLESS_URL`), if present. */
  portlessUrl?: string | undefined
  /**
   * Extra full origins or host patterns (e.g. from `BETTER_AUTH_TRUSTED_ORIGINS`).
   * Hosts are extracted so dynamic `baseURL` can resolve them; Better Auth also
   * appends the raw env CSV to trustedOrigins natively.
   */
  extraTrustedOrigins?: string[] | undefined
}

/** Extract `host[:port]` from a URL or return a host/pattern as-is. */
export function hostFromUrlOrPattern(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    if (trimmed.includes("://")) return new URL(trimmed).host
  } catch {
    // fall through - treat as host or wildcard pattern
  }
  return trimmed.replace(/^https?:\/\//, "").split("/")[0] ?? ""
}

/**
 * Better Auth `baseURL.allowedHosts` from env signals, with no hard-coded hostname or port.
 * Development and test add `.localhost` and loopback on any port. Production allows only
 * `betterAuthUrl` and the optional extras.
 */
export function resolveAllowedHosts(input: ResolveAllowedHostsInput): string[] {
  const hosts = new Set<string>()

  const fallbackHost = hostFromUrlOrPattern(input.betterAuthUrl)
  if (fallbackHost) hosts.add(fallbackHost)

  if (input.portlessUrl) {
    const portlessHost = hostFromUrlOrPattern(input.portlessUrl)
    if (portlessHost) hosts.add(portlessHost)
  }

  for (const extra of input.extraTrustedOrigins ?? []) {
    const host = hostFromUrlOrPattern(extra)
    if (host) hosts.add(host)
  }

  if (input.nodeEnv !== "production") {
    // Plain Vite / loopback - Host may be bare or include any port.
    hosts.add("localhost")
    hosts.add("localhost:*")
    hosts.add("127.0.0.1")
    hosts.add("127.0.0.1:*")
    // Portless (and any named local HTTPS): app name and nested worktrees.
    // Better Auth wildcards match multi-label names (`feature.app.localhost`).
    hosts.add("*.localhost")
    hosts.add("*.localhost:*")
  }

  return [...hosts]
}

/** True when `host` matches any allowed host pattern (Better Auth rules). */
export function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((pattern) => matchesHostPattern(host, pattern))
}
