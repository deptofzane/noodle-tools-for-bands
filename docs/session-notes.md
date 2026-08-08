# Working notes

Carry-over context for picking this up cold. Not a changelog — `git log` has
that. This is the state of play, the decisions that would otherwise get
re-litigated, and the traps that already cost a day.

Last updated: 8 August 2026.

---

## Open work, roughly in order

### Blocking a Play Store release

1. **Deploy migrations 0039–0045.** On disk, unapplied in production. Four
   landed recently (`original_band`, `notifications.day`,
   `notifications.multi_actor`, `notifications.upload_count`) and the app will
   500 on any of them. Release command: `node scripts/migrate.mjs`.
   0045 backfills and de-duplicates before it adds a unique index — in
   production that part is a no-op (no rollup has a `day` until 0043 lands),
   but it matters for any database that already has rollups.
2. **Publish the OAuth consent screen.** Console work. Changing scopes isn't
   the same as moving Testing → In production; until it moves, only accounts on
   the test list can sign in. `drive.file` is not a *restricted* scope, so no
   CASA assessment — that's why `drive.readonly` was dropped.
3. **Confirm `CONTACT_EMAIL`** in `app/legal.ts` (`noodlehelp@yahoo.com`) and
   register the mailbox — it still carries a TODO because nobody has checked
   that it exists. Google's verification and Play's review both mail it, and
   Play policy expects deletion requests to reach a human. Same for
   `noodle.band`, which the ICS UIDs and the default VAPID subject now name.
4. **Have the terms of service reviewed.** `app/TermsOfService.tsx` is a
   plain-language draft describing how the app actually works — upload rights,
   shared bands, no-warranty, account closure. Nobody with a law degree has
   read it, and it hasn't been checked against any jurisdiction's
   requirements. It's shown in full on `/about` (public, alongside the privacy
   policy). The policy text itself now lives in `app/PrivacyPolicy.tsx` and is
   rendered by both `/privacy` and `/about`, so edit it in one place;
   `/privacy` stays the URL Play and Google were given.
5. **`/.well-known/assetlinks.json`.** Ordering trap: the SHA-256 comes from
   Play App Signing, which you only get *after* uploading the first bundle. So:
   Bubblewrap build → internal testing upload → copy fingerprint → publish
   assetlinks → verify. Skip it and the TWA shows a browser address bar.
6. **Bubblewrap + internal testing track.** New apps must target API 35.
7. **Play data-safety form.** Must match the privacy policy — email, name,
   audio/sheet uploads, push tokens, Drive access, Sentry. Inconsistency
   between the two is a common rejection.

### Wanted, not blocking

- **CI.** There is none. GitHub Actions with Postgres + MinIO services running
  `test:db` and Playwright would be worth more than the next few specs.
- **Analytics.** Recommended Plausible or Umami (cookieless, no consent
  banner). Explicitly *not* PostHog/session replay: it would record song
  titles, private notes, and band chat. **Adding any analytics means editing
  `app/PrivacyPolicy.tsx` and the data-safety form in the same change** — the
  policy currently says there is no tracking.
- **Content-Security-Policy.** Only `frame-ancestors 'none'` today. A real one
  has to enumerate the Google Picker (gstatic), the inline pre-paint theme
  script in `layout.tsx`, and the service worker. Do it report-only first.
- **Audio transcoding.** The biggest performance lever, measured: WAVs average
  34 MB at ~1.3 Mbps against MP3s at ~272 kbps. A 128 kbps delivery version
  alongside the archival original cuts them ~10×, fixes playback on venue wifi,
  and shrinks offline downloads. Needs ffmpeg in a background job plus a
  `delivery` variant on `song_files`.
- **Empty-setlist notice** exists only on `/home` → Upcoming. The band Overview
  event rows and the event detail page still offer Practice/Live for a setlist
  with no songs.
- **Event colours** aren't on the band Overview's *past* shows list or anywhere
  outside the surfaces listed below.

---

## Decisions worth not re-opening

- **Audio URLs always name a version**, including the default
  (`?version=<fileId>`). A versionless URL means "whatever the default is now"
  — a moving target, and caching a moving target under `CacheFirst` is what
  made a downloaded setlist play the wrong take. See `audioSrc`.
- **Only a version-pinned file URL gets a long `Cache-Control`**
  (`lib/serve-cache.ts`). Audio is pinned by `?version=` alone — a version's
  object is written once and never rewritten. **Sheet music is not**: the
  ChordPro editor replaces a version's bytes in place, so a sheet URL is only
  immutable with the `?v=<updatedAt>` stamp, which every reader already sends.
  Anything versionless stays at `max-age=300`. If a new sheet reader forgets
  `v=`, it revalidates rather than serving a stale chart — that's the fallback
  working, not a bug to "fix" by widening the rule.
- **Upload notifications roll up per band per *local* day.** The uploader's day
  travels with the request (`notifications.day`), because
  `date_trunc('day', now())` in a UTC database rolls over at 6pm for a band in
  UTC-6 and splits one evening across two notifications.
- **A rollup with two or more uploaders names nobody** (`multi_actor`). The row
  holds one actor, and crediting whoever went last for the band's work reads
  worse than crediting no one.
- **The rollup count lives in `notifications.upload_count`, not in the label.**
  It used to be parsed back out of "N uploads" to increment it, which made
  every upload a read-modify-write: eight simultaneous ones produced eight
  rollup rows, not one row of eight. It's now a single upsert against
  `notifications_band_day_rollup_unique`. The label is display text derived
  from the count. Two consequences worth keeping: the ON CONFLICT predicate
  and the index predicate have to stay identical, and `xmax = 0` on the
  RETURNING is what tells the day's first upload (which pushes) from the rest
  (which don't).
- **Offline staleness compares version *identities*, not URLs.** URLs embed
  `?name=` from the song's display name, so comparing them would report a
  rename as out of date. Reading ids back out of the stored `urls` also means
  downloads already on devices report correctly with no new field and no
  migration. `app/offline/staleness.ts`, 10 tests.
- **Only what was downloaded counts** for staleness: a sheets-only download
  isn't told to update because a new audio take landed.
- **Serving a file resolves one row, not two.** `SongFileTarget` carries the
  metadata *and* the storage key, because the headers and the bytes both come
  from the same row and a track's playback is many Range requests. The
  `…Meta`/`stream…` pairs still exist for callers that want one half.
- **`/api/bands/[bandId]/uploads` is paged, newest first**, and the Uploads tab
  fetches it itself rather than taking it as a prop — it only mounts while its
  tab is open, so the other tabs no longer load a list they don't show. A page
  can end mid-day, so the oldest day on screen may be partial. The per-day page
  doesn't page at all: it sends the two instants its local day spans
  (`?from=&to=`) and gets that day whole, which is also what lets it open a day
  older than the tab has paged back to.
- **Switching bands stays on the page** (`bandSwitchTarget` in `lib/routes.ts`).
  It used to always push Overview, which threw away wherever you were. Now: a
  page that isn't about a band doesn't navigate at all (the current band is a
  nav pointer, not what those pages show); `/bands/[id]` and `/bands/[id]/audio`
  carry over with their query, so the open tab survives; anything deeper names
  the *old* band's setlist/poll/venue/note and falls back to the new band's
  Overview. Half-filled `new`/`edit` forms fall back for the same reason.
  6 tests, no DB.
- **Event colours are CSS custom properties keyed off `data-event-type`**, not a
  JS map — that's what lets the dark set apply through `.dark` without every
  component knowing the theme. `app/calendar/eventColors.ts` + `globals.css`.
- **Untyped events are grey** (`other`). An event nobody categorised shouldn't
  outrank one someone did.
- **Toasts sit at the opposite end of the screen from the nav bar** — top on
  mobile (where the nav and player bar own the bottom), bottom-right from `lg`.
- **`SAVED_QUEUE_VERSION` was deliberately not bumped** when `PlaylistTrack`
  gained fields. They're all optional and `isPlayableTrack` only requires
  `id`/`title`/`src`, so saved queues still restore; bumping would discard
  everyone's queue to gain fields they'd get back on the next re-queue.

---

## Traps that already cost time

- **`bg-[var(--x)]` silently compiles to nothing.** Tailwind can't tell a
  colour from a background image, so it drops the utility without warning. Use
  `bg-[color:var(--x)]`. **Verify by grepping the built CSS** — note Tailwind
  escapes the colon too, so search loosely for the property name rather than
  the class.
- **`router.refresh()` refreshes the route you are *on*.** Calling it before
  `router.back()` refetches the page being discarded while the destination is
  restored from the client Router Cache unchanged. `RefreshAfterEdit` in the
  root layout handles this; edit screens must **not** call `refresh()`
  themselves.
- **Service-worker precache matches the query string.** `/practice` never
  matched `/practice?setlist=…`, so offline navigation failed and the fallback
  quietly re-served `/offline` — which looked like a dead link. Fixed with
  `precacheOptions.ignoreURLParametersMatching`; supplying it **replaces** the
  defaults, so `utm_`/`fbclid` have to be re-listed.
- **`dayKey` is the viewer's *local* day.** Anything grouping by upload day has
  to agree with it. Fixtures written as UTC instants straddle midnight
  differently depending on where tests run — build them from local wall-clock
  time.
- **Playwright's `setOffline` does not flip `navigator.onLine`.** A spec that
  relies on the app knowing it's offline must emulate the flag as well, or it
  passes straight through the bug it was written for.
- **`npm run test:db` must stay serialized** (`--test-concurrency=1`). Running
  the files in parallel fails on shared-fixture cleanup.
- **A running `next dev` fights `rm -rf .next`.** Intermittent "Failed to
  collect page data" and missing `.nft.json` errors during a production build
  are usually this, not the code.
- **Don't re-read `window.location` in a second mount effect.** `?tab=events`
  deep links were broken for exactly this: `BandDetailClient`'s URL-mirror
  effect strips the param for the default tab, and the restore effect declared
  below it then saw a paramless URL and let localStorage win. Param presence
  now arrives as a prop (`tabFromUrl`) from the server page, which is the only
  place that still sees the original URL. The calendar's
  `BAND_ACTIVE_TAB_KEY`-on-click workaround was removed with it.
- **`addAudioVersion` does not make the version default** — that's a separate
  `setDefaultAudioVersion` call.
- **Three separate bugs came from one URL change** (`/bands/../setlists/../practice`
  → `/practice?setlist=`): the precache match, a stale runtime SW rule, and
  `OfflineClient` passing a synthesised URL where a setlist id was expected. If
  something offline misbehaves, grep for the old path shape first.

---

## Working conventions

- **Local migrations are applied by hand.** `drizzle-kit`'s tracking is stale
  locally (dev uses `db:push`). Generate with `db:generate`, then apply the new
  `ALTER` to the local DB directly. Never run `db:migrate` locally.
- **Verify DB work against the real database** with a throwaway
  `scripts/_name.ts` (`import './load-env'` first — importing `lib/db` before it
  builds a pool with no `DATABASE_URL`). Delete the script and any fixtures
  afterwards, and re-check the tables are clean.
- **Prove a test fails without the fix.** Every bug fix this session was
  confirmed by reverting the fix, watching the test go red, and restoring. A
  test that can't fail is not evidence.
- **Adding a field to a shared return type is a search tool.** Putting
  `eventType` on `EventListItem` immediately surfaced every query that didn't
  select it. Prefer that over hunting call sites by hand — and note that a
  client-side `as` cast will happily hide a field the JSON never carried.

---

## Test suite

- `npm run test:db` — 92 node tests, ~7s, self-cleaning.
- `npm run test:e2e` — Playwright, 4 specs, against a **production build**
  (the service worker is disabled in dev, so offline specs run in dev prove
  nothing). Seeds and tears down its own band; ids are written to
  `e2e/.auth/seed.json` so specs navigate directly instead of clicking through.
- **Sign-in is not covered.** The login page offers Google only — the
  credentials form is commented out of `app/login/page.tsx` pending email
  setup — so `auth.setup.ts` mints the session cookie directly. Worth a real
  spec once that form is enabled.

## Where the event colours are applied

`CalendarClient` (month grid + day summary), `calendar/events/[eventId]`,
`BandOverviewTab` (title row only — the expanded panel stays neutral),
`home/UpcomingShows`, `home/RecentEvents`.
