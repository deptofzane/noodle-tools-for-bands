# Sidestage

Built as an experiment to gain experience working with Claude Code

Timestamped, collaborative notes on Google Drive audio files. Built with
Next.js (App Router, TypeScript, Tailwind), Auth.js v5 for Google sign-in,
Postgres (Drizzle ORM) for conversation data, and the Google Drive API
for audio streaming.

Originally all state lived in Drive JSON files; conversation storage has
since been migrated to Postgres, with **bands** (in-app groups) owning
audio and conversations. Registered audio + sheet music are imported into
S3-compatible object storage (Cloudflare R2 in prod, MinIO in dev), so
Drive is now just the import source (the Picker).

Highlights:

- Auth.js v5 + Google OAuth with JWT cookies (no DB sessions); users are
  upserted to Postgres on sign-in
- **Bands**: create a band, add members by email, register Drive audio
  via the Google Picker. Band membership is the access boundary.
- Threaded notes with @-mentions, replies, edit/delete, resolve, and
  thread deep-links; live cross-user updates via Postgres
  LISTEN/NOTIFY → SSE
- Open Conversations / History with server-computed New / Mentioned
  badges; closed-conversation flow; activity log
- Audio imported from Drive into S3-compatible object storage (Cloudflare
  R2 in prod, MinIO in dev); Howler.js playback over a Range-capable serve
  route — no Drive in the play path
- Dark/light theme, global header, toasts, confirmation modals

## Prerequisites

- Node.js 20 or later
- pnpm (`npm install -g pnpm`)
- Postgres 17 (local Docker is easiest; see
  `docs/postgres-phase-1-setup.md`)
- A Google account for the OAuth client and for testing

## Local setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Google Cloud credentials

You'll create three things in [Google Cloud Console](https://console.cloud.google.com):
an OAuth consent screen, an OAuth client ID, and an API key (the API
key is required by the Google Picker).

**OAuth consent screen.** APIs & Services → OAuth consent screen.
User type **External**. The two scopes the app requests at runtime are
`https://www.googleapis.com/auth/drive.file` ("files this app creates")
and `https://www.googleapis.com/auth/drive.readonly` ("see all your
Drive files"): `drive.readonly` lets the Picker browse and the app
download the audio you register, and `drive.file` grants per-file access
to files you open with the app. While the app is unverified, add your
test Google accounts under "Test users."

**OAuth client ID.** APIs & Services → Credentials → Create credentials → OAuth client ID,
application type **Web application**. For local dev set:

- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

Copy the client ID and client secret.

**API key (Picker).** APIs & Services → Credentials → Create credentials → API key.
Restrict it:

- Application restrictions → HTTP referrers → `http://localhost:3000/*`
- API restrictions → restrict to **Google Picker API** (and Drive API
  if you want client-side Drive calls later)

Make sure **Google Picker API** is enabled in APIs & Services → Library.

### 3. Start Postgres

Local dev uses Postgres 17; Docker is the quickest:

```bash
docker run --name sidestage-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sidestage \
  -p 5432:5432 -v sidestage-pg-data:/var/lib/postgresql/data -d postgres:17
```

(See `docs/postgres-phase-1-setup.md` for native/alternative setups.)

### 4. Start object storage (MinIO)

Song files (audio + sheet music) live in S3-compatible object storage.
Locally, run MinIO (production uses Cloudflare R2):

```bash
docker run -d --name sidestage-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  -v sidestage-minio-data:/data minio/minio server /data --console-address ":9001"
```

### 5. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

```ini
AUTH_SECRET=<openssl rand -base64 32>
AUTH_GOOGLE_ID=<OAuth client ID>
AUTH_GOOGLE_SECRET=<OAuth client secret>
NEXT_PUBLIC_GOOGLE_API_KEY=<API key>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sidestage
# DATABASE_SSL stays unset/false locally — only managed Postgres needs it.
# Object storage — local MinIO (for R2: S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com,
# creds = an R2 API token, S3_FORCE_PATH_STYLE can be false).
S3_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_BUCKET=sidestage
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

Then apply the schema and create the bucket:

```bash
pnpm db:migrate
pnpm s3:init
```

### 6. Run

```bash
pnpm dev
```

Open <http://localhost:3000>. You'll be bounced to `/login`, sign in
with Google (granting Drive access on first run), then land on **Open
Conversations**. From there:

- **Bands** → create a band, add members by email, and **Add audio**
  (Google Picker) to register Drive files as conversations
- Open a conversation → playback + the threaded notes panel
- **Open Conversations** → active conversations across your bands, with
  New / Mentioned badges
- **History** → conversations you've marked closed
- **Account** → sign out, theme toggle, session debug

## Architecture at a glance

**Postgres for conversations, Drive for audio.** Bands, membership,
conversations, threaded notes, mentions, activity, and per-user read
state all live in Postgres via Drizzle (`lib/db/schema.ts`). Drive holds
only the audio files — everything else moved off Drive.

**Bands are the access boundary.** A band groups users; conversations
and audio are owned by a band. You can read/write a conversation iff
you're a member of its band (`getConversationMembership` /
`assertConversationMember`, joining through `band_members`). Owners
manage members and can delete the band; members can leave. The whole
data-access layer (`lib/db/*`) takes the band check as a precondition.

**Identity.** Auth stays JWT-cookie based (no DB sessions). On sign-in,
`auth.ts`'s `events.signIn` upserts a `users` row keyed by Google `sub`;
everything else references the internal user id (`lib/current-user.ts`
maps session → DB user).

**Real-time.** Mutations emit `pg_notify('conversation_activity', <id>)`
inside their transaction, so it fires exactly on commit. One
process-wide `LISTEN` connection (`lib/db/notify.ts`) fans notifications
out in-memory to per-conversation SSE subscribers at
`/api/conversations/[id]/events` — so N open pages cost one Postgres
connection, not N. The notes panel subscribes via `EventSource` and
refetches on change, with a 30s poll as a backstop.

**Auth.js v5 split.** `auth.config.ts` is the Edge-safe slice imported by
`middleware.ts`; `auth.ts` is the Node-only full config (token refresh +
the user upsert). Keeping DB and `googleapis` imports out of
`auth.config.ts` is what keeps them out of the Edge bundle.

**Audio (and sheet music) is owned by us.** When a user registers a song,
the audio is downloaded from Drive (once, with the registrant's token) and
stored in **S3-compatible object storage** — Cloudflare R2 in production,
MinIO locally. Postgres keeps only the metadata + object key
(`song_files`), so the database stays small no matter how big the library
gets. The bytes live behind the small storage interface in
`lib/db/song-files.ts` (`lib/storage/s3.ts` is the client). Playback and
sheet-music view stream from `/api/conversations/[id]/files/[kind]`, which
checks band membership, then proxies the object store's Range response
(the store computes the range). Drive is no longer in the playback path —
it's just the import source + Picker.

Object deletes aren't transactional with the DB, so song/band deletes
collect the keys and best-effort delete the objects after the cascade;
`scripts/r2-sweep.mjs` reclaims any leaked objects. `scripts/r2-backfill.mjs`
migrated the earlier `bytea` blobs into the bucket.

> The held `LISTEN` connection + SSE mean the app must run on a
> **long-lived Node server**, not serverless. See [Deployment](#deployment).

## File layout

```
.
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts          # Auth.js handler mount
│   │   ├── bands/
│   │   │   ├── route.ts                         # GET my bands, POST create
│   │   │   └── [bandId]/
│   │   │       ├── route.ts                     # GET detail, DELETE (owner)
│   │   │       ├── leave/route.ts               # POST leave (member)
│   │   │       ├── members/route.ts             # POST add member (owner)
│   │   │       ├── members/[userId]/route.ts    # DELETE member (owner)
│   │   │       └── conversations/route.ts       # GET list, POST register audio
│   │   ├── conversations/
│   │   │   ├── annotated/route.ts               # Open Conversations / History list
│   │   │   └── [conversationId]/
│   │   │       ├── route.ts                     # GET load (notes+activity), PATCH closed
│   │   │       ├── read/route.ts                # POST mark seen (clears badges)
│   │   │       ├── events/route.ts              # SSE — LISTEN/NOTIFY stream
│   │   │       └── notes/…                       # POST note, PATCH/DELETE, replies
│   │   ├── drive/
│   │   │   ├── file/[fileId]/stream/route.ts    # Range-forwarding audio proxy
│   │   │   └── token/route.ts                   # Short-lived token for the Picker
│   │   └── health/route.ts                      # Smoke test
│   ├── bands/                                    # Bands list + detail (members, audio)
│   ├── open-conversations/                       # Active conversations + badges
│   ├── history/                                  # Closed-only view
│   ├── notes/[conversationId]/                    # Player + threaded notes panel
│   ├── library/page.tsx                          # Drive-connect gate + landing
│   ├── account/page.tsx, login/page.tsx
│   ├── ConfirmModal.tsx, ToastProvider.tsx,
│   │   PendingActionProvider.tsx, PickerButton.tsx  # Shared client UI
│   └── Header.tsx, ThemeToggle.tsx, layout.tsx, page.tsx
├── lib/
│   ├── db/
│   │   ├── schema.ts                             # Drizzle schema (tables + enums)
│   │   ├── index.ts                              # Pooled client (+ SSL, DbExecutor)
│   │   ├── users.ts, bands.ts, conversations.ts,
│   │   │   notes.ts, activity.ts, listing.ts     # Data access (band-gated)
│   │   ├── notify.ts                             # LISTEN/NOTIFY fan-out hub
│   │   └── ssl.ts                                # Postgres SSL config from env
│   ├── current-user.ts                           # session sub → DB user
│   ├── drive.ts                                  # Node Drive client (gaxios retry/agent)
│   ├── drive-service.ts                          # Service-account Drive client
│   ├── audio.ts                                  # Howler wrapper
│   └── google.ts                                 # Edge-safe scopes + token refresh
├── drizzle/                                       # Generated SQL migrations
├── scripts/                                       # db-check + migrate.mjs (deploy)
├── auth.config.ts                                 # Edge-safe Auth.js config
├── auth.ts                                        # Full Auth.js config (Node) + user upsert
├── middleware.ts                                  # Routes auth gate
├── Dockerfile, drizzle.config.ts, next.config.ts
├── .env.example
└── package.json
```

## Deployment

> **Run on a long-lived Node server — not serverless.** Conversations
> live in Postgres, and the app holds a persistent Postgres `LISTEN`
> connection plus serves SSE for real-time note updates. Those need a
> process that stays up, so Vercel/Lambda-style serverless is **not**
> supported. Use Railway, Render, Fly, or any host that runs
> `pnpm start` on Node 20+. A `Dockerfile` is included and works on all
> of them.

### 1. Production Google Cloud setup

In your existing Cloud project (the same one you used for local dev):

**OAuth client ID.** Add production entries alongside the local-dev
ones — don't replace them, so dev keeps working:

- Authorized JavaScript origins → add `https://<your-domain>`
- Authorized redirect URIs → add `https://<your-domain>/api/auth/callback/google`

**API key.** Add production to its HTTP referrer restriction list:

- `https://<your-domain>/*`

**OAuth verification.** While the consent screen is in "Testing" mode,
only Test users can sign in. To accept public users, click "Publish app"
on the consent screen. Because the app requests `drive.readonly` — a
sensitive scope — Google requires verification (security assessment +
brand verification). This can take weeks; plan accordingly. Until
verified, you can keep the app in Testing mode and add test users
manually.

### 2. Provision Postgres

Create a managed Postgres 17 instance (your host's add-on, Neon,
Supabase, etc.). Grab its connection string for `DATABASE_URL` and set
`DATABASE_SSL=true` (managed Postgres requires TLS). If the provider
uses an internal/self-signed cert and you get a cert error, also set
`DATABASE_SSL_REJECT_UNAUTHORIZED=false`.

Migrations are applied by a release/start step (below) via
`pnpm db:migrate:deploy`, which uses the drizzle-orm runtime migrator —
no `drizzle-kit` needed in production.

### 3. Deploy to a long-lived Node host

**Environment variables:**

| Variable                            | Value                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| `AUTH_SECRET`                       | `openssl rand -base64 32` (fresh per environment)      |
| `AUTH_GOOGLE_ID`                    | OAuth client ID                                         |
| `AUTH_GOOGLE_SECRET`                | OAuth client secret                                    |
| `AUTH_TRUST_HOST`                   | `true`                                                 |
| `AUTH_URL`                          | Public origin, e.g. `https://<your-domain>`            |
| `NEXT_PUBLIC_GOOGLE_API_KEY`        | Picker API key                                         |
| `DATABASE_URL`                      | Postgres connection string                             |
| `DATABASE_SSL`                      | `true` (managed Postgres)                              |
| `S3_ENDPOINT`                       | `https://<accountid>.r2.cloudflarestorage.com`         |
| `S3_REGION`                         | `auto` (R2)                                            |
| `S3_BUCKET`                         | bucket name                                            |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 API token                                   |

`AUTH_URL` matters here (unlike Vercel, there's no `VERCEL_URL` to derive
it from). The `S3_*` vars point at your R2 bucket (song audio + sheet
music); leave `S3_FORCE_PATH_STYLE` unset for R2.

**Commands:**

- **Build:** `pnpm install --frozen-lockfile && pnpm build`
- **Release (migrate):** `pnpm db:migrate:deploy`
- **Start:** `pnpm start` (Next honors the host's `PORT`)

**Docker.** The included `Dockerfile` runs migrations then starts the
server in one container — point Railway/Render/Fly at it, or use your
host's native Next.js buildpack with the commands above. For
multi-instance deploys, run `db:migrate:deploy` as a one-off release
step rather than in the start command, so instances don't race.

**Reverse proxy / SSE.** Make sure the proxy doesn't buffer or idle-out
the SSE route (`/api/conversations/[id]/events`): allow long-lived
responses and disable response buffering (e.g. nginx
`proxy_buffering off;`). The client reconnects automatically and a 30s
poll backstops missed events, but buffering delays real-time updates.

**Verify after deploy:**

- `https://<your-domain>/api/health` returns `{ ok: true, version: "..." }`
- Sign-in works; the "Connect Drive" CTA grants Drive scopes on first login
- Create a band, register audio via the Picker, open the conversation,
  add a note — and watch it appear in a second browser within a beat (SSE)

### 4. Operational notes

**Postgres connections.** The app keeps a pooled connection set
(`max: 10`) for queries plus **one** dedicated connection for the
LISTEN/NOTIFY hub (shared across all SSE clients, see `lib/db/notify.ts`).
Size your Postgres `max_connections` for the pool × instances + one
listener each. Use your provider's pooled endpoint if connection limits
are tight.

**Drive usage.** Drive is touched only at registration time — to download
the audio once (it then lives in object storage) — and by the Picker.
Playback and all conversation data don't touch Drive, so the old per-note
quota pressure is gone. The `googleapis` client in `lib/drive.ts` retries
429/5xx with backoff and is tuned against "Premature close" socket errors.

**Object storage.** Song files live in the bucket (`lib/storage/s3.ts`),
so the database stays small regardless of library size. Playback streams
via the app (proxying R2's Range response); R2's zero egress keeps that
cheap. Deletes are best-effort against the bucket — run `pnpm r2:sweep`
(or `node scripts/r2-sweep.mjs` in prod) periodically to reclaim any
orphaned objects. Audio imports are capped at 100 MB, sheet music at 25 MB.

**Health check.** `/api/health` returns `{ ok: true, version }`. It
does no Drive calls and no auth check, so it's safe to point a
platform health check at it.

**Logs.** Everything Drive-related logs to `console.error` with a
`[drive/...]` prefix. On Vercel these surface in the Functions tab.
