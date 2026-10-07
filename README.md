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

| Item | What it adds | Agent doc | Depends on |
| --- | --- | --- | --- |
| `env` | `src/env.ts`: zod `getServerEnv()` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, optional `BETTER_AUTH_TRUSTED_ORIGINS`, `PORTLESS_URL`), parsed on first use so builds need no secrets; server-only marker | `.agents/env.md` | none |
| `db` | drizzle client `getDb()` (server-only), shared `timestamps` columns, `drizzle.config.ts`, `scripts/migrate.ts`, `scripts/migrate-production.ts` (guarded), Postgres `docker-compose.yml` | `.agents/database.md` | `env` |
| `auth-gate` | Better Auth (email + password, `tanstackStartCookies()` last), `requireUser()` (sets `no-store`), dev origin detection with tests, `/api/auth/*`, `_authed` layout (`no-store`), `/account` (minimal protected page; the layout needs a child route), `/login` | `.agents/auth.md` | `env`, `db`, shadcn `button` `input` `label` |
| `owned-table` | Ownership pattern: `notes` table with indexed `userId`, server fns scoped by session user, schemas + tests, `/notes` page, lock ownership rule | `.agents/data-access.md` | `auth-gate` |
| `health` | `GET /api/health` (liveness, no I/O) and `?deep=1` (pings Postgres, 503 when down) | none | `db` |
| `docker` | Multi-stage `Dockerfile` (digest-pinned bases, typecheck gate, non-root, ships `drizzle/` and `scripts/migrate.ts`), `serve.ts`, `.dockerignore`, `docker-compose.coolify.yml` | `.agents/deploy.md` | `health` |
| `guards` | `scripts/build-check.ts` (canary secrets must not reach `dist/client`; build must not change a tracked route tree), `src/deps.test.ts` (one `router-core`, `start-server-core` >= 1.169.39) | `.agents/checks.md` | none |

```bash
bunx shadcn@latest add @john/auth-gate      # pulls env + db + button/input/label
bunx shadcn@latest add @john/owned-table
bunx shadcn@latest add @john/health @john/docker @john/guards
```

## Kits (what `p new --template web` installs)

| Kit | Items |
| --- | --- |
| `none` | `@john/guards` |
| `auth` | `@john/env` `@john/db` `@john/auth-gate` `@john/health` `@john/docker` `@john/guards` |
| `full` | `auth` + `@john/owned-table` |

## What `p new` adds (a registry cannot ship these)

`p new` scaffolds with `bunx @tanstack/cli@0.71.1 create <name> --non-interactive --no-git --no-install --no-intent --blank --no-toolchain
--package-manager bun --add-ons shadcn,tanstack-query`, rewrites `#/` to `@/`, runs `p adopt` (lint, format and fallow presets),
then `bunx shadcn@4.21.1 add` for the kit. Then it adds:

- `package.json` scripts: `test` (`bun test --pass-with-no-tests`), `build:check` (`bun scripts/build-check.ts`, inside `check`) and, when `db`
  is present, `db:start`, `db:generate`, `db:migrate`, `db:migrate:production`, `db:studio` (the commands are in the `db` item description).
- `.env.example` (the keys in the item `envVars`) and a random `BETTER_AUTH_SECRET` in `.env.local`.
- `AGENTS.md` that tells agents to read the `.agents/*.md` topic docs first.

## Manual steps for the consumer

- **Migrations are yours.** Items add schema files (`auth.ts`, `notes-table.ts`) but no SQL. After adding
  `auth-gate` or `owned-table`: `bun run db:start`, `bun run db:generate`, `bun run db:migrate`, then commit `drizzle/`.
- **Commit the route tree.** Commit `src/routeTree.gen.ts`. `build:check` fails when a build changes it.
- **Production migrations (manual).** `bun run db:migrate:production -- --production-url "$PRODUCTION_DATABASE_URL"` lists pending
  migrations and changes nothing. Add `--yes` to apply. It refuses to run without the flag, and when the URL equals `DATABASE_URL`.
- **Database tuning.** `DATABASE_POOL_SIZE` (8), `DB_STATEMENT_TIMEOUT_MS` (10000), `DB_LOCK_TIMEOUT_MS` (2000),
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (10000) and `DB_APPLICATION_NAME` (`app`) are optional.
- **Secrets stay out of logs.** `getServerEnv()` returns `DATABASE_URL` and `BETTER_AUTH_SECRET` as `Secret` values that print as
  `[redacted]`. Call `.reveal()` only where the value is used. Env errors name the key, never the value.
- **Server-only modules.** `env.ts`, `db/index.ts` and `auth/server.ts` start with `import "@tanstack/react-start/server-only"`.
  A client import of them fails `vite build`. Do not add the marker to a file that calls `createServerFn`: the client imports those.
- **Cache.** `requireUser()` and the `_authed` and `login` routes send `Cache-Control: no-store`.
- **Secret.** `env` writes `BETTER_AUTH_SECRET=change-me` to `.env.local`. It is shorter than 32 chars on purpose,
  so the first request fails loudly. Set a real one: `openssl rand -base64 32`.
- **Production.** Set `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and the public HTTPS
  `BETTER_AUTH_URL`. Only that origin is trusted (plus optional `BETTER_AUTH_TRUSTED_ORIGINS`, comma-separated).

## Coolify

`docker-compose.coolify.yml` (from `docker`) has two services built from the same image: `migrate` runs `bun run scripts/migrate.ts` once
(`restart: "no"`, `exclude_from_hc: true`) and `app` starts after it with `depends_on: migrate: service_completed_successfully`.
Use the Docker Compose build pack, point it at this file, and set `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as runtime
variables. Never pass them as build args: only `VITE_*` values may be. The image needs a committed `drizzle/` and `src/routeTree.gen.ts`.
`exclude_from_hc` is a Coolify key; plain `docker compose config` rejects it, so remove that line to validate the file locally.

## Drift checks

Compare a consumer's copy to the registry without writing anything:

```bash
bunx shadcn@latest add @john/auth-gate --diff
```

Run it per item (`@john/env`, `@john/db`, `@john/guards`, ...) to see every file that drifted. `p new` should record the registry sha with the
project so the diff has a known base.

## Development

```bash
bun install
bun run build    # shadcn build -> public/r/*.json (commit the output)
bun run verify   # local end-to-end check, no CI
```

`verify` builds the registry and scaffolds a fresh app the way `p new` does: `@tanstack/cli@0.71.1` with `--blank --no-toolchain`, alias
rewrite, `git init`, `p adopt`, `bun install`, `shadcn@4.21.1 add` for every item. It then asserts:

- lint and `format:check` are clean in every registry-shipped file (findings in starter files are allowed);
- a client route that imports `getServerEnv` fails `vite build` with import-protection;
- `tsc`, `bun test` (including `deps.test.ts`, which also tests itself against crafted lock text) and `build:check` pass;
- `serve.ts` serves the page, an asset and health, and refuses path traversal;
- against a real Postgres (unique compose project and port, always torn down): `db:generate`, `db:migrate`, the production migration
  guard, two sign-ups, sign-in sets a cookie, the notes server fns over HTTP, user B cannot list, update or delete user A's note, a
  client-supplied `userId` is ignored, signed-out calls and `/notes` redirect to `/login`, authed server fn and `/notes` responses are
  `no-store`, and a cross-site POST to a server fn answers 403;
- the Coolify compose file is valid and the Dockerfile bakes no secret; the image builds and its `scripts/migrate.ts` migrates a fresh
  database inside the image.

Docker is required. Run it before every push. `VERIFY_KEEP=1` keeps the temp app on success.
