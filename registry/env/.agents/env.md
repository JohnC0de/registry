# Environment

## Rules

- Read env only through `getServerEnv()` in `src/env.ts`. Never read `process.env` elsewhere.
- Keep `import "@tanstack/react-start/server-only"` at the top of `src/env.ts`.
- Add each new key to the zod schema and to `.env.example`. Only `VITE_*` keys may reach the client.
- Use `.reveal()` on a `Secret` only where the value is used. Never log or serialize it.
- Do not parse env at module scope in a file that routes import. `getServerEnv()` parses on first use.

## Commands

- `bun test src/env.test.ts`: key names appear in errors, secret values never do.
- `bun run check`: `build:check` builds with a canary value in every non-`VITE_` key and scans `dist/client`.

## Pitfalls

- A client file that imports `src/env.ts` fails `vite build` with "Import denied in client environment".
  That is correct. Move the code to a server function. Source:
  https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
- Without the marker, server code can reach `dist/client` and the build still passes. Only the
  canary scan finds it. Source: https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist
- Server function return values can leak a secret too. Return only the fields the page needs.
