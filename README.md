# registry

Full-stack kernel recipes for TanStack Start apps, as a [shadcn registry](https://ui.shadcn.com/docs/registry).
Built for a fresh `@tanstack/cli create` scaffold (Tailwind 4, shadcn new-york) on Bun + Postgres.

## Setup

1. Make the `@/*` alias point to `./src/*` (scaffold default is `#/*`, which also ships `@/*` in `tsconfig.json`).
   Set the `components.json` aliases to `@/...` too.
2. Register the namespace in `components.json`:

```json
{
  "registries": {
    "@john": "https://raw.githubusercontent.com/JohnC0de/registry/main/public/r/{name}.json"
  }
}
```

## Items

| Item | What it adds | Depends on |
| --- | --- | --- |
| `env` | `src/env.ts`: zod `getServerEnv()` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), parsed on first use so builds need no secrets | none |
| `db` | drizzle client `getDb()`, shared `timestamps` columns, `drizzle.config.ts` (`src/lib/db/schema/*.ts`), `scripts/migrate.ts`, Postgres `docker-compose.yml` | `env` |
| `auth-gate` | Better Auth (email + password), `requireUser()`, dev origin detection (loopback + `*.localhost`, prod pinned to `BETTER_AUTH_URL`) with tests, `/api/auth/*`, `_authed` layout, `/login` | `env`, `db`, shadcn `button` `input` `label` |
| `owned-table` | The ownership pattern: `notes` table with indexed `userId`, list/create/update/delete server fns scoped by session user, zod schemas + tests, `/notes` page | `auth-gate` |
| `health` | `GET /api/health` (liveness, no I/O) and `?deep=1` (pings Postgres, 503 when down) | `db` |
| `docker` | Multi-stage `Dockerfile` for the vite build on Bun (base images pinned by digest, typecheck gates the build, non-root `bun` user), `serve.ts` (static assets + SSR handler), `.dockerignore` | `health` |

```bash
bunx shadcn@latest add @john/auth-gate      # pulls env + db + button/input/label
bunx shadcn@latest add @john/owned-table
bunx shadcn@latest add @john/health @john/docker
```

## Manual steps for the consumer

- **`package.json` scripts** cannot ship in a registry item. Add them for `db`:

  ```json
  {
    "db:start": "docker compose up -d",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run scripts/migrate.ts",
    "db:migrate:production": "bun run scripts/migrate-production.ts",
    "db:studio": "drizzle-kit studio"
  }
  ```

- **Migrations are yours.** Items add schema files (`auth.ts`, `notes-table.ts`) but no SQL. After adding
  `auth-gate` or `owned-table`: `bun run db:start`, `bun run db:generate`, `bun run db:migrate`, then commit `drizzle/`.
- **Production migrations.** `bun run db:migrate:production -- --production-url "$PRODUCTION_DATABASE_URL"` lists pending
  migrations and changes nothing. Add `--yes` to apply. It refuses to run without the flag, and when the URL equals `DATABASE_URL`
  (which must be the development database). Run the same migrations on development first.
- **Database tuning.** `DATABASE_POOL_SIZE` (8), `DB_STATEMENT_TIMEOUT_MS` (10000), `DB_LOCK_TIMEOUT_MS` (2000),
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (10000) and `DB_APPLICATION_NAME` (`app`) are optional; the defaults apply when unset.
- **Secrets stay out of logs.** `getServerEnv()` returns `DATABASE_URL` and `BETTER_AUTH_SECRET` as `Secret` values that print as
  `[redacted]` in strings, JSON and console output. Call `.reveal()` only where the value is used. Env errors name the key, never the value.
- **Locks need an owner filter.** If you add `FOR UPDATE` or any lock helper to an owned table, filter by owner in the same query
  that takes the lock. Locking by id and checking ownership afterwards lets a non-owner stall the owner. The notes demo has no lock path.
- **Secret.** `env` writes `BETTER_AUTH_SECRET=change-me` to `.env.local`. It is shorter than 32 chars on purpose,
  so the first request fails loudly. Set a real one: `openssl rand -base64 32`.
- **Production.** Set `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and the public HTTPS
  `BETTER_AUTH_URL`. Only that origin is trusted (plus optional `BETTER_AUTH_TRUSTED_ORIGINS`, comma-separated).
- **Docker.** Needs `bun.lock`. Run migrations separately, for example `bun run db:migrate` against the prod database.

## Drift checks

Compare a consumer's copy to the registry without writing anything:

```bash
bunx shadcn@latest add @john/auth-gate --diff
```

## Development

```bash
bun install
bun run build    # shadcn build -> public/r/*.json (commit the output)
bun run verify   # local end-to-end check, no CI
```

`verify` builds the registry, scaffolds a fresh app with `@tanstack/cli`, rewrites `#/` to `@/`, installs all items from a
local static server, then runs `bun install`, `vite build`, `tsc --noEmit`, `bun test`, boots `serve.ts` (page, asset,
health, path traversal), then runs the app against a real Postgres (compose project with a unique name and port, always torn
down): `db:generate`, `db:migrate`, two Better Auth sign-ups, and the notes server fns over HTTP. It asserts that user B cannot
list, update or delete user A's note, that a client-supplied `userId` is ignored, and that unauthenticated calls and `/notes`
redirect to `/login`. Last it builds the Docker image and removes it. Docker is required. Run it before every push.
`VERIFY_KEEP=1` keeps the temp app on success.
