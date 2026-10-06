# Data access

## Rules

- Scope every query by the session user: `where id = ? and user_id = ?`. Never query by id alone.
- Take the owner from `requireUser()`. Ignore any `userId` the client sends.
- A non-owner must get the same answer as a missing row (`notFound()`).
- Lock ownership rule: check ownership in the same query that takes the lock (`FOR UPDATE`, advisory lock or lock helper).
  Use a join or a `WHERE` on `userId`, or on membership for shared rows. Never lock by id and check afterwards.
  A non-owner would take the lock and stall the real owner.
- Add `.validator(schema)` and `requireUser()` to every server function.
- Copy `src/lib/notes/server.ts` for a new table. Delete the notes demo when done.

## Commands

- `bun run db:generate && bun run db:migrate`: create the notes table.
- `bun test`: schema tests. `bun run verify` in the registry proves user B cannot read, change or delete user A's note.

## Pitfalls

- Route loaders run on the server and on the client. They call server functions. They never reach the db directly.
- Add a test with the first lock path. The notes demo has none.
- A client-supplied `userId` in the input schema is a bug. Do not add the field.
  Source: https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist
