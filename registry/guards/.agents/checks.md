# Checks

## Rules

- `bun run check` runs `build:check` and `bun test`. Keep both in `check`.
- Do not edit `src/routeTree.gen.ts` by hand. Commit it when the build changes it.
- Put every new secret key in `.env.example`. `build:check` uses that file to find keys.
- Keep `@tanstack/*` packages on one version set. Bump them together.

## Commands

- `bun run build:check`: build with a unique canary value in each non-`VITE_` key, scan `dist/client`,
  then fail if the build changed a tracked `src/routeTree.gen.ts`.
- `bun test src/deps.test.ts`: `bun.lock` has one `@tanstack/router-core` version and
  `@tanstack/start-server-core` is at least 1.169.39.

## Pitfalls

- A canary hit means server code reached the client. Find the import chain. Add the server-only marker to the
  server module. Source: https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist
- Two `router-core` versions build fine and crash every request. Run one `bun update` for all `@tanstack/*`.
  Source: https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989
- `start-server-core` below 1.169.39 has CVE-2026-102989, a reflected XSS in server function responses.
  Source: https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989
- If `build:check` says the build changed `src/routeTree.gen.ts`, commit the new file.
- Import protection fails the build when a client file imports a server-only module. Source:
  https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
