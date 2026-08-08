# Postgres Migration — Phase 1 (Infra + Drizzle)

Self-contained setup for Phase 1: provision Postgres, wire up Drizzle, and
verify a working connection. Keep the schema minimal here (just `users`) to
prove the toolchain end-to-end — the full schema is Phase 2.

Stack decisions: **Next.js + Drizzle + Postgres on a long-lived Node server**
(not serverless). See the project memory `postgres-migration` for the full plan.

## Step 1 — Run a local Postgres 17

Docker (most reproducible):

```bash
docker run --name noodle-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=noodle \
  -p 5432:5432 -d postgres:17
```

Alternatives: `brew install postgresql@17 && brew services start postgresql@17`,
or Postgres.app with the PG 17 server selected.

If a container from an earlier attempt is holding the name/port, remove it first:

```bash
docker rm -f noodle-pg
```

Note: a Postgres 17 data directory isn't readable by older server binaries, so
once you initialize on 17, stay on 17 locally.

## Step 2 — Add the connection string

In **`.env.local`** (Next and the steps below read this; it's already gitignored
by Next's default `.gitignore` via `.env*.local`):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/noodle"
```

Confirm it's ignored: `git check-ignore .env.local` should print the path.

## Step 3 — Install dependencies

```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg dotenv tsx
```

`pg` (node-postgres) is the right driver for a long-lived server (real
connection pool). `tsx` is just for running the verify script.

## Step 4 — Add scripts to `package.json`

In the `"scripts"` block:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

`generate` + `migrate` = real versioned migrations (what you'll commit). `push`
is for quick throwaway prototyping; prefer generate/migrate.

## Step 5 — `drizzle.config.ts` (repo root)

```ts
import { config } from 'dotenv';
config({ path: '.env.local' }); // drizzle-kit won't read .env.local on its own

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

## Step 6 — Minimal schema: `lib/db/schema.ts`

```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

## Step 7 — Pooled client: `lib/db/index.ts`

The `globalThis` guard stops Next's dev hot-reload from opening a new pool on
every reload.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool =
  globalForDb.__pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
```

## Step 8 — Generate and apply the first migration

```bash
pnpm db:generate   # writes SQL into ./drizzle
pnpm db:migrate    # applies it to your local DB
```

You should see a `drizzle/` folder with a `0000_*.sql` file and a meta dir.
**Commit that folder** (migrations are source of truth).

## Step 9 — Verify the connection

Create `scripts/db-check.ts`:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

async function main() {
  const result = await db.execute(sql`select 1 as ok`);
  console.log('DB OK:', result.rows);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run it:

```bash
pnpm tsx scripts/db-check.ts
```

Expect `DB OK: [ { ok: 1 } ]`. Then optionally `pnpm db:studio` to browse the
`users` table in a UI.

## Step 10 — Commit

Commit `drizzle.config.ts`, `lib/db/*`, `drizzle/**`, `scripts/db-check.ts`, and
the `package.json` changes. **Do not** commit `.env.local`.

---

## Production hosting (defer, but here's the shape)

Dev can proceed entirely locally now. For prod, provision a Postgres instance on
your chosen long-lived host (Railway/Fly/Render), set its `DATABASE_URL` as an
env var there, run `pnpm db:migrate` as a release/deploy step, and serve via
`next start` on that same persistent host (not Vercel serverless).

## "Done" checklist (for review)

1. `pnpm tsx scripts/db-check.ts` prints `DB OK`.
2. `drizzle/0000_*.sql` exists and creates the `users` table; a second
   `pnpm db:migrate` reports no pending migrations.
3. `pnpm typecheck` and `pnpm build` still pass.
4. `.env.local` is untracked; `drizzle/**` is tracked.

## Gotchas

- `pnpm db:migrate` errors with "DATABASE_URL undefined" → the `dotenv` line in
  `drizzle.config.ts` isn't loading `.env.local`.
- `tsx` can't resolve imports → use the **relative** `../lib/db` path as written
  (not the `@/` alias).
