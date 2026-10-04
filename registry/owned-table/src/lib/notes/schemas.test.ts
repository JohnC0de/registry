/// <reference types="bun" />
import { describe, expect, test } from "bun:test"

import { createNoteInput, deleteNoteInput, updateNoteInput } from "@/lib/notes/schemas"

describe("createNoteInput", () => {
  test("trims the title and keeps the body optional", () => {
    const result = createNoteInput.parse({ title: "  first note  " })
    expect(result.title).toBe("first note")
    expect(result.body).toBeUndefined()
  })

  test("rejects a title that is only whitespace", () => {
    const result = createNoteInput.safeParse({ title: "   " })
    expect(result.success).toBe(false)
  })

  test("rejects a title over 200 chars", () => {
    const result = createNoteInput.safeParse({ title: "x".repeat(201) })
    expect(result.success).toBe(false)
  })
})

describe("updateNoteInput", () => {
  test("requires an id and applies the create rules to the title", () => {
    expect(updateNoteInput.safeParse({ title: "ok" }).success).toBe(false)
    expect(updateNoteInput.safeParse({ id: "abc", title: "   " }).success).toBe(false)
    expect(updateNoteInput.parse({ id: "abc", title: " ok " }).title).toBe("ok")
  })
})

describe("deleteNoteInput", () => {
  test("requires a non-empty id", () => {
    expect(deleteNoteInput.safeParse({ id: "" }).success).toBe(false)
    expect(deleteNoteInput.safeParse({ id: "abc" }).success).toBe(true)
  })
})
