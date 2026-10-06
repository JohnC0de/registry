# Auth

## Rules

- Call `requireUser()` first inside every server function and every server route. Route guards are UX only.
- Add `.validator(schema)` to every server function. Parse input at the boundary.
- Never take the user id from the client. Take it from `requireUser()`.
- `requireUser()` sets `Cache-Control: no-store`. The `_authed` and `login` routes set it through `headers`. Keep both.
- Keep `tanstackStartCookies()` the last plugin in `src/lib/auth/server.ts`.
- Keep the server-only marker in `src/lib/auth/server.ts`. Do not add it to files that call `createServerFn`.
- Do not add `src/start.ts` without checking CSRF. Without that file, Start installs CSRF middleware itself.

## Commands

- `bun run db:generate && bun run db:migrate`: create the auth tables.
- `bun test`: origin rules. `bun run verify` in the registry checks cookies, CSRF and `no-store` over HTTP.

## Pitfalls

- A plugin after `tanstackStartCookies()` loses its Set-Cookie headers without any error. Source:
  https://github.com/better-auth/better-auth/issues/8911
- A server route that returns `Response.redirect()` after an auth call gives an unhandled 500. Return
  `new Response(null, { status: 302, headers })` instead. Source: https://github.com/TanStack/router/issues/7755
- `session.cookieCache` is on here. A report shows Safari errors with it. Test Safari before production. Source:
  https://github.com/better-auth/better-auth/issues/9108
- `/api/auth/*` is a server route and the CSRF middleware does not cover it. Origin checks in `origins.ts` do.
- A redirect in `beforeLoad` does not protect a server function that anyone can call. Source:
  https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist
