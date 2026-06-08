# Audio Notes

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

The plan targets Vercel; anything that runs Node + Next.js 15 works.
This section walks through Vercel; the alternative-host notes at the
end apply to Render, Railway, Fly, etc.

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

### 2. Vercel

Import the repo into Vercel. Framework auto-detects as Next.js. Set
the **Root Directory** to `sidestage-next` if the repo root isn't
that folder.

**Environment variables** (Project → Settings → Environment Variables):

| Variable                       | Value                                                      | Env(s)               |
| ------------------------------ | ---------------------------------------------------------- | -------------------- |
| `AUTH_SECRET`                  | `openssl rand -base64 32` (fresh per environment)          | Production, Preview  |
| `AUTH_GOOGLE_ID`               | OAuth client ID                                            | Production, Preview  |
| `AUTH_GOOGLE_SECRET`           | OAuth client secret                                        | Production, Preview  |
| `AUTH_TRUST_HOST`              | `true`                                                     | Production, Preview  |
| `NEXT_PUBLIC_GOOGLE_API_KEY`   | Picker API key                                             | Production, Preview  |

`AUTH_URL` is not needed on Vercel — Auth.js v5 derives it from
`VERCEL_URL`.

**Preview deployments.** Each preview gets a generated URL like
`audio-notes-abc123.vercel.app`. For OAuth to work on previews, add
that pattern as an authorized redirect URI in Google Cloud, or
restrict OAuth to production only and skip auth on previews. Most
real projects ship a wildcard pattern.

**Function configuration.** The two long-running routes already declare
their own `maxDuration = 300` (5 minutes):

- `app/api/drive/changes/route.ts` — SSE long-poll
- `app/api/drive/file/[fileId]/stream/route.ts` — audio Range proxy

On Vercel's Hobby tier, the cap is 60s regardless of declaration — the
notes panel will reconnect to SSE every minute, which works but is
noisier than Pro. On Pro / Fluid Compute the declared 300s applies.

**Deploy.** Push to `main` (or trigger via the dashboard). After deploy,
verify:

- `https://<your-domain>/api/health` returns `{ ok: true, version: "..." }`
- Sign-in works end-to-end
- The Picker opens (if it errors "API key not valid," the HTTP referrer
  restriction usually needs the production domain added)
- Playback works (you may need to grant the `drive.readonly` scope on
  first prod login — the app surfaces a "Connect Drive" CTA)

### 3. Other Node hosts

The app is a stock Next.js 15 App Router project. Any host that runs
`pnpm build && pnpm start` on Node 20+ works (Render, Railway, Fly,
self-hosted). The two host-specific concerns:

- **Env vars.** Same list as the Vercel table above. Set `AUTH_URL` to
  the public origin when the host doesn't populate a `VERCEL_URL`-like
  hint, and keep `AUTH_TRUST_HOST=true`.
- **Long-running routes.** Make sure your host's request timeout is at
  least as long as the `maxDuration` declarations (300s). Behind a
  reverse proxy, set proxy read timeout to match and disable response
  buffering on the SSE route (we already set `X-Accel-Buffering: no`
  for nginx). Otherwise SSE events are held back in chunks.

### 4. Operational notes

**Drive quotas.** Per-user quota is ~1000 requests / 100s. The SSE
endpoint hits Drive ~30 times/minute per connected client. Open
Conversations and the per-folder activity rollup are heavier (one
list + N reads) — they're not polled, so they cost one round of calls
per page navigation. If you start seeing 429s, the `googleapis` Drive
client we instantiate in `lib/drive.ts` already has built-in
exponential backoff for 429 / 5xx.

**Health check.** `/api/health` returns `{ ok: true, version }`. It
does no Drive calls and no auth check, so it's safe to point a
platform health check at it.

**Logs.** Everything Drive-related logs to `console.error` with a
`[drive/...]` prefix. On Vercel these surface in the Functions tab.
