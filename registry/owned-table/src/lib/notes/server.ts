import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"

import { requireUser } from "@/lib/auth/server"
import { getDb } from "@/lib/db"
import { notes } from "@/lib/db/schema/notes-table"
import { createNoteInput, deleteNoteInput, updateNoteInput } from "@/lib/notes/schemas"

/**
 * Ownership pattern - copy this for every user-owned table. Reads and writes are scoped by
 * `notes.userId`, never by id alone, and the owner comes from the session, never from the client.
 *
 * Locks follow the same rule (membership before lock): if a path ever takes `FOR UPDATE` or any lock
 * helper, it must filter by owner in that same query (`where id = ? and user_id = ?`). Locking by id
 * and checking ownership afterwards lets a non-owner take the lock and stall the owner. Notes has no
 * locking path, so there is nothing to test here; add a test with the first one.
 */

export const $listNotes = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return getDb()
    .select()
    .from(notes)
    .where(eq(notes.userId, user.id))
    .orderBy(desc(notes.createdAt))
})

export const $createNote = createServerFn({ method: "POST" })
  .validator(createNoteInput)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [row] = await getDb()
      .insert(notes)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        title: data.title,
        body: data.body ?? "",
      })
      .returning()
    return row
  })

export const $updateNote = createServerFn({ method: "POST" })
  .validator(updateNoteInput)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [row] = await getDb()
      .update(notes)
      .set({ title: data.title, body: data.body ?? "" })
      .where(and(eq(notes.id, data.id), eq(notes.userId, user.id)))
      .returning()
    // Someone else's id matches no row, which is indistinguishable from a missing one.
    if (!row) throw notFound()
    return row
  })

export const $deleteNote = createServerFn({ method: "POST" })
  .validator(deleteNoteInput)
  .handler(async ({ data }) => {
    const user = await requireUser()
    // The owner check lives in the WHERE clause: someone else's id simply matches no row.
    await getDb()
      .delete(notes)
      .where(and(eq(notes.id, data.id), eq(notes.userId, user.id)))
    return { ok: true as const }
  })
