/// <reference types="bun" />
import { describe, expect, test } from "bun:test"

import { createNoteInput, deleteNoteInput } from "@/lib/notes/schemas"

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

describe("deleteNoteInput", () => {
  test("requires a non-empty id", () => {
    expect(deleteNoteInput.safeParse({ id: "" }).success).toBe(false)
    expect(deleteNoteInput.safeParse({ id: "abc" }).success).toBe(true)
  })
})
