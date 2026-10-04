import { z } from "zod"

import type { notes } from "@/lib/db/schema/notes-table"

/** Inferred from the table - import this instead of redeclaring the row shape. */
export type Note = typeof notes.$inferSelect

export const createNoteInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(10_000).optional(),
})

export const deleteNoteInput = z.object({
  id: z.string().min(1),
})

export type CreateNoteInput = z.infer<typeof createNoteInput>
