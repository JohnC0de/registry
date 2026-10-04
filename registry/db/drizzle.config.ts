import { defineConfig } from "drizzle-kit"

export default defineConfig({
  out: "./drizzle",
  // One file per feature under schema/ (columns.ts, auth.ts, notes.ts, ...): items add files, never edit one.
  schema: "./src/lib/db/schema/*.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
