import { index, pgTable, text } from "drizzle-orm/pg-core"

import { user } from "@/lib/db/schema/auth"
import { timestamps } from "@/lib/db/schema/columns"

/**
 * The ownership pattern: every user-owned table carries an indexed `userId`, and every query in
 * src/lib/notes/server.ts filters by it. Copy this file for a real domain table, then delete notes.
 */
export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    /** Owner. Never query notes without filtering on this column. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("notes_user_id_idx").on(t.userId)],
)
