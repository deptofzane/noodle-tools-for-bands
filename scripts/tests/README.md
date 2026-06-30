# Integration tests

Data-layer integration tests that run against a **real Postgres** (the
`lib/db/*` modules), using Node's built-in test runner — no extra deps.

They're the saved versions of the checks used while building features
(bands/membership, conversations + threaded notes/mentions/activity,
cross-band listing + badges, `song_files` bytea storage + Range, and the
LISTEN/NOTIFY realtime hub). Each test creates its own namespaced rows
(fixed `*_OWNER`-style `google_sub` prefixes) and cleans up in a
`finally`, so they're safe to re-run and don't touch real data.

## Run

```bash
# requires local Postgres up + migrations applied (pnpm db:migrate)
pnpm test:db
```

Reads `DATABASE_URL` from `.env.local` (each test imports
`scripts/load-env`). Runs serially (`--test-concurrency=1`) since they
share the database.

## Adding a test

Drop a `*.test.ts` file here that:

- imports `'../load-env'` first (loads `.env.local`),
- uses `node:test` + `node:assert/strict`,
- registers `after(closeDb)` (and `closeNotifyHub` if it uses the hub) so
  the process exits,
- namespaces any rows it creates and deletes them in a `finally`.
