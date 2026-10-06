# Database

## Rules

- Get the client with `getDb()` from `src/lib/db`. Never create a second pool.
- Keep the server-only marker in `src/lib/db/index.ts`. Import the db only from server code.
- One schema file per feature in `src/lib/db/schema/`. Items add files and never edit one.
- Change the schema, then run `db:generate`, then `db:migrate`. Commit `drizzle/`. Never use `drizzle-kit push` on a shared database.
- Production migrations go through `db:migrate:production` or the `migrate` service in `docker-compose.coolify.yml`.
- Size the pool: `DATABASE_POOL_SIZE` x replicas must stay below `max_connections`.

## Commands

- `bun run db:start`: local Postgres from `docker-compose.yml`.
- `bun run db:generate` and `bun run db:migrate`: create and apply SQL migrations.
- `bun run db:migrate:production -- --production-url "$URL"`: dry listing. Add `--yes` to apply.
- `bun run db:studio`: browse data.

## Pitfalls

- `db:migrate:production` refuses `DATABASE_URL` as the target. `DATABASE_URL` must be the development database.
- Statement, lock and idle-in-transaction timeouts are on by default. A long query fails fast on purpose.
  Raise the `DB_*_MS` keys only for a job that needs it.
- Behind PgBouncer in transaction mode, add `prepare: false` to the client options.
- Official `drizzle` and `better-auth` TanStack add-ons are demos. They do not compose with this item. Source:
  https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist
