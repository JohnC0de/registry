# Deploy

## Rules

- Build one image with the `Dockerfile`. Run the app and the migrations from that same image.
- Secrets are runtime variables only. Never use `ARG` or `ENV` for a secret. Only `VITE_*` keys may be build args.
- On Coolify use `docker-compose.coolify.yml`. The `migrate` service runs once, then the app starts.
- Commit `src/routeTree.gen.ts` and `drizzle/`. The image needs both.
- The health check is `GET /api/health`. It does no I/O. Use `?deep=1` as a readiness probe only.
- Set `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and the public HTTPS `BETTER_AUTH_URL`.

## Commands

- `docker build -t app .`: typecheck, then `vite build`.
- `docker run --rm -e DATABASE_URL=... app bun run scripts/migrate.ts`: apply migrations.
- `docker compose -f docker-compose.coolify.yml config`: check the compose file.

## Pitfalls

- Requests to `/_serverFn/...` without the `x-tsr-serverFn` header give unhandled 500s. Bots send them.
  Filter that path before you alert on 500. Source: https://github.com/TanStack/router/issues/8237
- Bun SSR memory may grow with streaming pages. Watch RSS in production. The runtime stage can switch to Node.
  Source: https://github.com/TanStack/router/issues/5289
- The migrate service must not count in health checks: `restart: "no"` and `exclude_from_hc: true`.
  Source: https://github.com/tsu-moe/tsu-stack/blob/main/docker-compose.coolify.yaml
- Bump all `@tanstack/*` packages in one commit. A partial bump builds and then crashes every request.
  `src/deps.test.ts` guards this. Source: https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989
