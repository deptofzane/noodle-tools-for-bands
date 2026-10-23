# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Noodle: a band collaboration PWA (songs/audio, threaded timestamped notes, setlists with offline Practice/Live, calendar/events, todos, polls, chat). Next.js 15 App Router + React 19 + Tailwind 3, Postgres via Drizzle, Auth.js v5, S3-compatible storage (R2 prod, MinIO dev). pnpm. `docs/session-notes.md` holds open work, settled decisions, and known traps — read the relevant section before non-trivial work.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck` (CI runs lint + typecheck)
- `pnpm test:db` — node:test integration suite in `scripts/tests/` against real Postgres + MinIO. Must stay serialized. Single file: `node --import tsx --test scripts/tests/bands.test.ts`
- `pnpm test:e2e` — Playwright against a **production build** on port 3123 (service worker is disabled in dev, so offline specs in dev prove nothing). Single spec: `pnpm test:e2e e2e/practice-picker.spec.ts`. Specs run with 1 worker on a Pixel 7 viewport; `globalSetup` seeds a band and writes ids to `e2e/.auth/seed.json`; `auth.setup.ts` mints the session cookie directly.
- `pnpm db:generate` — create a migration from `lib/db/schema.ts`. Locally, apply the new SQL by hand (dev uses `db:push`; drizzle-kit tracking is stale, so don't run `db:migrate` locally). Production applies committed migrations via `pnpm db:migrate:deploy` (railway `preDeployCommand`). `ALTER TYPE … ADD VALUE` must be its own migration.
- Scripts that touch the DB must `import './load-env'` (or `'../load-env'`) **before** importing `lib/db`.

## Architecture

- **Auth split:** `auth.config.ts` is Edge-safe (used by `middleware.ts`); `auth.ts` is Node-only (token refresh, user upsert). Keep DB/`googleapis` imports out of `auth.config.ts`. Public routes are whitelisted in `middleware.ts`.
- **Bands are the access boundary.** API routes guard with `requireUser` / `requireBandMember` / `requireBandOwner` / conversation guards in `lib/api-guard.ts` (return-a-NextResponse pattern). `lib/db/*` data-access assumes the check already happened.
- **Data layer:** `lib/db/schema.ts` (all tables/enums), one module per domain in `lib/db/`. Client fetch errors go through `lib/api.ts` (`ensureOk`/`errorMessage`).
- **Real-time:** mutations `pg_notify` inside their transaction; one process-wide LISTEN connection (`lib/db/notify.ts`) fans out to SSE routes. Requires a long-lived Node server, not serverless.
- **Files:** audio/sheet music imported (Drive Picker, Dropbox, upload) into object storage (`lib/storage/s3.ts`); Postgres stores metadata + keys (`song_files`). Served via a Range-proxying route after a membership check. Object deletes are best-effort after DB cascades; `pnpm r2:sweep` reclaims orphans.
- **Offline/PWA:** Serwist compiles `app/sw.ts`. Practice/Live use query params (`lib/routes.ts`: `/practice?setlist=…`) so one precached shell serves every setlist; setlist data lives in IndexedDB.
- **Sentry** via `instrumentation*.ts` and `sentry.*.config.ts`; cron jobs under `app/api/cron/`.

## Known traps (details in docs/session-notes.md)

- Tailwind arbitrary values with an ambiguous type can silently emit nothing — add a hint (`bg-[color:var(--x)]`) and grep the built CSS.
- `router.refresh()` refreshes the current route, so never rely on it before `router.back()`; `RefreshAfterEdit` refreshes after leaving `/edit` routes.
- No root `loading.tsx` (breaks 404s and e2e); use `RouteProgress`.
- Mobile: wide `min-w-*` content expands the layout viewport and breaks fixed overlays — scope wide minimums to `sm:`.
- E2E: wait on `page.waitForResponse`, not toasts; `setOffline` doesn't flip `navigator.onLine`.
- dotenv doesn't override existing env vars — simulate "unset" by setting it empty.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Ease of use is front of mind. If you have an alternative suggestion about how a feature could be easier for users to engage with, ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked. If an improvement could be beneficial, ask.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Context

Always find ways to reduce the context window usage or context across all files. If there's a way to keep things operating the same but reduce usage, please optimize and let me know. Please remove all files that are redundant or unnecessary. Keep things simple and focused.