import { defineConfig } from "drizzle-kit"

export default defineConfig({
  out: "./drizzle",
  // One file per feature under schema/ (columns.ts, auth.ts, notes.ts, ...): items add files, never edit one.
  schema: "./src/lib/db/schema/*.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- `drizzle-kit generate` needs no connection; commands that do fail with drizzle-kit's own error when this is unset.
    url: process.env.DATABASE_URL!,
  },
})
