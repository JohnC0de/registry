/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { inspect } from "node:util"

import { parseServerEnv } from "@/env"

const databaseSecret = "postgresql://app:db-password-9f3a@db.internal:5432/app"
const authSecret = "auth-secret-0123456789-0123456789-abcdef"
const valid = { DATABASE_URL: databaseSecret, BETTER_AUTH_SECRET: authSecret }

describe("parseServerEnv", () => {
  test("applies defaults for the optional keys", () => {
    const env = parseServerEnv(valid)
    expect(env.DATABASE_POOL_SIZE).toBe(8)
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(10_000)
    expect(env.DB_LOCK_TIMEOUT_MS).toBe(2_000)
    expect(env.DB_APPLICATION_NAME).toBe("app")
    expect(env.NODE_ENV).toBe("development")
  })

  test("coerces numeric overrides and rejects zero or garbage", () => {
    expect(parseServerEnv({ ...valid, DATABASE_POOL_SIZE: "20" }).DATABASE_POOL_SIZE).toBe(20)
    expect(() => parseServerEnv({ ...valid, DATABASE_POOL_SIZE: "0" })).toThrow("DATABASE_POOL_SIZE")
    expect(() => parseServerEnv({ ...valid, DB_LOCK_TIMEOUT_MS: "soon" })).toThrow("DB_LOCK_TIMEOUT_MS")
  })

  test("an invalid env throws an error that names the key but never contains a secret value", () => {
    const tooShort = "short-but-secret-value"
    const cases = [
      { DATABASE_URL: databaseSecret, BETTER_AUTH_SECRET: tooShort },
      { DATABASE_URL: databaseSecret, BETTER_AUTH_SECRET: authSecret, BETTER_AUTH_URL: "not a url, db-password-9f3a" },
      { DATABASE_URL: databaseSecret, BETTER_AUTH_SECRET: authSecret, DATABASE_POOL_SIZE: databaseSecret },
    ]
    for (const source of cases) {
      let message = ""
      try {
        parseServerEnv(source)
      } catch (error) {
        message = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
      }
      expect(message).toContain("Invalid environment variables")
      for (const value of [tooShort, databaseSecret, authSecret, "db-password-9f3a"]) {
        expect(message).not.toContain(value)
      }
    }
  })

  test("a missing secret is reported by name", () => {
    expect(() => parseServerEnv({ DATABASE_URL: databaseSecret })).toThrow("BETTER_AUTH_SECRET")
  })

  test("secrets stay reachable through reveal() but never through string, JSON or inspect", () => {
    const env = parseServerEnv(valid)
    expect(env.BETTER_AUTH_SECRET.reveal()).toBe(authSecret)
    expect(env.DATABASE_URL.reveal()).toBe(databaseSecret)
    const printed = [String(env.BETTER_AUTH_SECRET), JSON.stringify(env), inspect(env, { depth: 5 }), `${env.DATABASE_URL}`]
    for (const text of printed) {
      expect(text).not.toContain(authSecret)
      expect(text).not.toContain("db-password-9f3a")
    }
    expect(JSON.stringify(env)).toContain("[redacted]")
  })
})
