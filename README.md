# Sidestage

Built as an experiment to gain experience working with Claude Code

Timestamped, collaborative notes on Google Drive audio files. Built with
Next.js (App Router, TypeScript, Tailwind), Auth.js v5 for Google sign-in,
and the Google Drive API for both audio streaming and notes storage.
There is no database — every piece of persistent state lives in Drive.

All six phases of the build plan are implemented:

- Auth.js v5 + Google OAuth with JWT cookies (no DB sessions)
- Google Picker for folder selection, server-side audio listing
- Howler.js playback fed by a Range-forwarding stream proxy
- Per-user notes JSON files in a `<basename>.notes/` subfolder per audio
- Threaded notes UI with replies, edit/delete, and live cross-user updates via Drive Changes SSE
- IndexedDB cache, Open Conversations / History views, closed-conversation flow,
  cross-user activity tracking, dark/light theme, global header

## Prerequisites

- Node.js 20 or later
- pnpm (`npm install -g pnpm`)
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
Drive files") — both are needed because the app reads audio from
folders other users own and writes its own notes JSON files. While
the app is unverified, add your test Google accounts under "Test
users."

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

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

```ini
AUTH_SECRET=<openssl rand -base64 32>
AUTH_GOOGLE_ID=<OAuth client ID>
AUTH_GOOGLE_SECRET=<OAuth client secret>
NEXT_PUBLIC_GOOGLE_API_KEY=<API key>
```

### 4. Run

```bash
pnpm dev
```

Open <http://localhost:3000>. You'll be bounced to `/login`, sign in
with Google, then land on **Open Conversations**. From there:

- **Library** → pick a Drive folder and see its audio files
- Click any audio file → playback + the notes panel
- **Open Conversations** → your active discussions across all folders
- **History** → conversations you've marked closed
- **Account** → sign out, theme toggle, session debug

## Architecture at a glance

**No database.** Every conversation lives in Drive next to its audio:

```
shared-folder/
├── recording.mp3
└── recording.notes/
    ├── user-<aliceSub>.json   # canonical per-user notes
    ├── user-<bobSub>.json
    └── _activity.json         # denormalized cross-user activity log
```

Each user only writes to their own `user-<sub>.json` file, so there are
no cross-user races on the same blob. The `_activity.json` is a shared,
best-effort read cache used by the Open Conversations / History views
to show who touched a conversation last (and when), without N+1
fetches across every user's file.

A conversation is "closed" when the subfolder is renamed
`recording.notes.closed/`. Closed conversations are hidden from Open
Conversations, surface in History, and auto-reopen if someone writes a
new note.

**Real-time.** The notes panel opens a Server-Sent Events stream at
`/api/drive/changes` that long-polls the Drive Changes API every ~2s,
filtered to events that touch the watched folder or subfolder. The
client also falls back to 30s polling and hydrates instantly from an
IndexedDB cache.

**Auth.js v5 split.** `auth.config.ts` is the Edge-safe slice imported
by `middleware.ts`. `auth.ts` is the Node-only full config with the
`jwt` callback that refreshes the Google access token ~60s before
expiry and stamps `error: 'RefreshAccessTokenError'` on the JWT if the
refresh fails. The UI catches that and prompts re-auth.

**Streaming proxy.** Drive's media-download endpoint requires an OAuth
bearer token, which we can't put in an `<audio src>`. The proxy at
`/api/drive/file/[fileId]/stream` forwards Range headers to Drive and
proxies the response back. Each user streams with their own token, so
revoking Drive access immediately cuts off playback for that user.

## File layout

```
.
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts                     # Auth.js handler mount
│   │   ├── drive/
│   │   │   ├── changes/route.ts                            # SSE — Drive Changes long-poll
│   │   │   ├── file/[fileId]/stream/route.ts               # Range-forwarding audio proxy
│   │   │   ├── folder/[folderId]/activity/route.ts         # Per-folder activity rollup
│   │   │   ├── folder/[folderId]/audio/route.ts            # Lists audio in a folder
│   │   │   └── token/route.ts                              # Short-lived token for the Picker
│   │   ├── files/[fileId]/notes/
│   │   │   ├── route.ts                                    # GET notes, POST note, PATCH closed state
│   │   │   ├── [noteId]/route.ts                           # PATCH / DELETE one note
│   │   │   └── [noteId]/replies/route.ts                   # POST reply
│   │   ├── notes/annotated/route.ts                        # Open Conversations / History list
│   │   └── health/route.ts                                 # Smoke test
│   ├── account/page.tsx                                    # Sign-out + theme toggle
│   ├── library/
│   │   ├── page.tsx
│   │   ├── LibraryClient.tsx                               # Picker + audio list + lazy activity
│   │   ├── annotated/                                      # "Open Conversations" view
│   │   └── history/                                        # Closed-only view
│   ├── login/page.tsx
│   ├── notes/[fileId]/                                     # Player + threaded notes panel
│   ├── Header.tsx                                          # Global nav
│   ├── ThemeToggle.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                                            # Redirects to Open Conversations
├── lib/
│   ├── activity.ts                                         # _activity.json schema + read/write
│   ├── audio.ts                                            # Howler wrapper
│   ├── drive.ts                                            # Node-only Drive client (gaxios retry)
│   ├── google.ts                                           # Edge-safe scopes + token refresh
│   ├── notes-cache.ts                                      # IndexedDB cache
│   └── notes.ts                                            # Notes data layer
├── types/next-auth.d.ts                                    # Session/JWT augmentation
├── auth.config.ts                                          # Edge-safe Auth.js config
├── auth.ts                                                 # Full Auth.js config (Node)
├── middleware.ts                                           # Routes auth gate
├── next.config.ts                                          # serverExternalPackages: ['googleapis']
├── tailwind.config.ts                                      # darkMode: 'class'
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

Create a managed Postgres 18 instance (your host's add-on, Neon,
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
| `GOOGLE_SERVICE_ACCOUNT_KEY`        | _(optional)_ service-account JSON for shared audio     |

`AUTH_URL` matters here (unlike Vercel, there's no `VERCEL_URL` to
derive it from). `GOOGLE_SERVICE_ACCOUNT_KEY` is optional — without it,
audio streams with each user's personal Drive token (a band member not
shared on a file can't play it); with it, band membership alone grants
playback. See `.env.example` for details on each.

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

**Drive usage.** Drive is now only touched for audio (the streaming
proxy + the Picker) — conversation data is all Postgres, so the old
per-note Drive quota pressure is gone. The streaming proxy uses the
service account when configured, else the user's token; the
`googleapis` client in `lib/drive.ts` retries 429/5xx with backoff and
is tuned against "Premature close" socket errors.

**Health check.** `/api/health` returns `{ ok: true, version }`. It
does no Drive calls and no auth check, so it's safe to point a
platform health check at it.

**Logs.** Everything Drive-related logs to `console.error` with a
`[drive/...]` prefix. On Vercel these surface in the Functions tab.
