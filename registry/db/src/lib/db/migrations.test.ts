/// <reference types="bun" />
import { describe, expect, test } from "bun:test"

import { pendingTags, resolveProductionRun } from "@/lib/db/migrations"

const prod = "postgresql://app:pw@prod.example.com:5432/app"
const dev = "postgresql://postgres:postgres@localhost:5432/app"

describe("resolveProductionRun", () => {
  test("refuses without an explicit production url", () => {
    expect(() => resolveProductionRun({}, dev)).toThrow("--production-url")
    expect(() => resolveProductionRun({ yes: true }, dev)).toThrow("--production-url")
  })

  test("refuses a url that is not postgres", () => {
    expect(() => resolveProductionRun({ "production-url": "mysql://x/y" }, dev)).toThrow("postgres")
  })

  test("refuses the development database even with --yes", () => {
    expect(() => resolveProductionRun({ "production-url": dev, yes: true }, dev)).toThrow(
      "development database",
    )
  })

  test("defaults to a dry run and applies only with --yes", () => {
    expect(resolveProductionRun({ "production-url": prod }, dev)).toEqual({
      url: prod,
      apply: false,
    })
    expect(resolveProductionRun({ "production-url": prod, yes: true }, dev).apply).toBe(true)
  })
})

describe("pendingTags", () => {
  const journal = {
    entries: [
      { tag: "0000_a", when: 100 },
      { tag: "0001_b", when: 200 },
      { tag: "0002_c", when: 300 },
    ],
  }

  test("lists entries not applied yet, in journal order", () => {
    expect(pendingTags(journal, [100])).toEqual(["0001_b", "0002_c"])
  })

  test("is empty when everything is applied", () => {
    expect(pendingTags(journal, [100, 200, 300])).toEqual([])
  })

  test("lists everything for a database with no history", () => {
    expect(pendingTags(journal, [])).toEqual(["0000_a", "0001_b", "0002_c"])
  })
})
