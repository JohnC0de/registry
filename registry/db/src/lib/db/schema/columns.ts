import { timestamp } from "drizzle-orm/pg-core"

/**
 * Shared audit columns. Spread into every table: `pgTable("x", { id: ..., ...timestamps })`.
 * `updatedAt` refreshes on every drizzle update, so callers never set it by hand.
 */
export const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}
