# Working notes

Carry-over context for picking this up cold. Not a changelog — `git log` has
that. This is the state of play, the decisions that would otherwise get
re-litigated, and the traps that already cost a day.

Last updated: 23 August 2026.

---

## Open work, roughly in order

### Blocking a Play Store release

1. **Deploy migrations 0039–0055.** On disk, unapplied in production as far
   as anyone here knows, and the app will 500 on any of them. Release command:
   `node scripts/migrate.mjs`.
   0045 backfills and de-duplicates before it adds a unique index — in
   production that part is a no-op (no rollup has a `day` until 0043 lands),
   but it matters for any database that already has rollups.
   **0051 and 0055 are `ALTER TYPE … ADD VALUE`** (notification kinds and
   subjects). Postgres won't let a value be _used_ in the transaction that
   adds it, which is why they're their own migrations — apply them as
   generated rather than folding them into anything.
   0053 is the first of these with a foreign key (`notifications.recipient_id`
   → `users`), so it must run before anything writes that column.
2. **Publish the OAuth consent screen.** Console work. Changing scopes isn't
   the same as moving Testing → In production; until it moves, only accounts on
   the test list can sign in. `drive.file` is not a _restricted_ scope, so no
   CASA assessment — that's why `drive.readonly` was dropped.
3. **Confirm `CONTACT_EMAIL`** in `app/legal.ts`. A Namecheap mailbox was set
   up on 23 August and the constant was repointed from `noodlehelp@yahoo.com`
   to `help@noodle.band` the same day. What's left is to confirm mail actually
   arrives there, then delete the TODO above the constant. It's the address
   Google's OAuth verification and Play's review will write to, and Play
   policy expects deletion requests to reach a human. `noodle.band` is also
   what the ICS UIDs and the default VAPID subject name.
4. **Password reset email doesn't work, and fails silently.** The credentials
   form is live again in `app/login/page.tsx`, so people can register with a
   password — and the reset flow is the only way back in. Two things are
   missing: `RESEND_API_KEY` and `EMAIL_FROM` in production (`EMAIL_FROM`
   defaults to `onboarding@resend.dev`, which only delivers to the Resend
   account's own address), and the send is never checked. See the Resend trap
   below — this is why "I verified the domain and it still doesn't arrive"
   produced no diagnostic at all. Fix the logging _first_, or the next attempt
   is another guess.
5. **Have the terms of service reviewed.** `app/TermsOfService.tsx` is a
   plain-language draft describing how the app actually works — upload rights,
   shared bands, no-warranty, account closure. Nobody with a law degree has
   read it, and it hasn't been checked against any jurisdiction's
   requirements. It's shown in full on `/about` (public, alongside the privacy
   policy). The policy text itself now lives in `app/PrivacyPolicy.tsx` and is
   rendered by both `/privacy` and `/about`, so edit it in one place;
   `/privacy` stays the URL Play and Google were given.
6. **`/.well-known/assetlinks.json`.** Ordering trap: the SHA-256 comes from
   Play App Signing, which you only get _after_ uploading the first bundle. So:
   Bubblewrap build → internal testing upload → copy fingerprint → publish
   assetlinks → verify. Skip it and the TWA shows a browser address bar.
7. **Bubblewrap + internal testing track.** New apps must target API 35.
8. **Play data-safety form.** Must match the privacy policy — email, name,
   audio/sheet uploads, push tokens, Drive access, Sentry. Inconsistency
   between the two is a common rejection.

### Wanted, not blocking

- **Analytics.** Recommended Plausible or Umami (cookieless, no consent
  banner). Explicitly _not_ PostHog/session replay: it would record song
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
- **Event colours** aren't on the band Overview's _past_ shows list or anywhere
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
- **Upload notifications roll up per band per _local_ day.** The uploader's day
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
- **Offline staleness compares version _identities_, not URLs.** URLs embed
  `?name=` from the song's display name, so comparing them would report a
  rename as out of date. Reading ids back out of the stored `urls` also means
  downloads already on devices report correctly with no new field and no
  migration. `app/offline/staleness.ts`, 10 tests.
- **Only what was downloaded counts** for staleness: a sheets-only download
  isn't told to update because a new audio take landed.
- **Serving a file resolves one row, not two.** `SongFileTarget` carries the
  metadata _and_ the storage key, because the headers and the bytes both come
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
  the _old_ band's setlist/poll/venue/note and falls back to the new band's
  Overview. Half-filled `new`/`edit` forms fall back for the same reason.
  6 tests, no DB.
- **An event's last day is `coalesce(end_date, date)`** — never `date` alone.
  `end_date` is null for a single-day event, which is what every row written
  before multi-day events existed already meant, so there was no backfill;
  `normalizeEndDate` keeps that the one spelling by storing null for a
  same-day end. Range queries test _overlap_ (`date <= to AND lastDay >= from`)
  so a festival appears in every month it passes through, and past/upcoming
  compare `lastDay`, so an event running today is still ahead of you.
  `events_end_date_idx` indexes the same expression. A backwards range is
  rejected by the API rather than flattened — it's a typo in the second date,
  and silently dropping it shows one day where someone meant a week.
- **The month grid draws events as bars, not per-day chips.** `layoutWeekBars`
  (`app/calendar/eventBars.ts`) cuts each event into one segment per week it
  touches and assigns lanes greedily, longest-first; the week row's height
  follows the lane count. Bars live in a `pointer-events-none` overlay so the
  cell underneath still owns the tap that opens the day summary. Single-day
  events are one-column bars — two alignment systems in one grid was the
  alternative. A segment cut by a week boundary is drawn flat and without its
  accent edge; that edge _is_ the continuation signal, since an arrow glyph
  there rendered as an emoji box.
- **Event colours are CSS custom properties keyed off `data-event-type`**, not a
  JS map — that's what lets the dark set apply through `.dark` without every
  component knowing the theme. `app/calendar/eventColors.ts` + `globals.css`.
- **Time off is labelled from its creator, not its title** (`eventLabel` in
  `app/calendar/eventLabel.ts`): "Time off - Steve". Derived at display time
  so the name follows a rename and nobody can edit an event to claim it's
  someone else's; the column still stores plain "Time off" so anything not
  taught about this — a notification written at insert time — still reads
  sensibly. Both event forms hide the title field for this type. Every event
  query joins `users` for `createdByName`, and `LabelledEvent.createdByName`
  is deliberately **required, not optional**: optional let three surfaces
  compile while silently rendering a nameless "Time off".
- **Untyped events are grey** (`other`). An event nobody categorised shouldn't
  outrank one someone did.
- **Toasts sit at the opposite end of the screen from the nav bar** — top on
  mobile (where the nav and player bar own the bottom), bottom-right from `lg`.
- **Notes are a strict partition, not overlapping filters.** Personal is
  yours _and_ unshared; sharing moves a note across rather than adding it to
  both. That's what lets the two views read as "mine" and "the band's". A
  consequence worth remembering: the "Shared" chip became unreachable and was
  removed, because Personal now holds nothing shared and in Shared everything
  is.
- **Pinned notes have no cap.** Considered and rejected: a per-member limit of
  two. Bands regulate their own pinned section, and the feed is what makes
  that possible — _both_ pin and unpin are announced, so quietly removing a
  pin the band relied on leaves a record. Pin notifications are feed-only.
- **A pinned personal note asks before it becomes a public pin.** Sharing it
  opens a three-way modal (keep / share unpinned / cancel) rather than a
  ConfirmModal, because dismissing has to mean _abort_ — mapping "share
  without the pin" onto cancel would make Escape silently save.
- **`notifications.recipient_id` null means broadcast.** Null is every kind
  that existed before targeting, and still most of them. Four readers honour
  it — the feed, the unread count, `listPushTargets`, and `notify()` — and the
  feed and count share one `addressedTo()` predicate deliberately, because a
  badge that disagrees with the list it counts is the bug that mechanism
  invites. Targeting does **not** override a mute.
- **`FEED_ONLY_KINDS` (`lib/notification-kinds.ts`) is checked inside
  `firePush`, not passed per call.** Push is opt-out — a new kind pushes by
  default and quiet has to be asked for — so a future caller can't make pins
  or todo-status buzz by forgetting a flag. The set lives in its own pure
  module because both the server and the Settings screen need it, and a client
  component can't import a value from `lib/db/notifications`.
- **A shared todo is genuinely the band's**: anyone may edit, restatus,
  reassign or delete it. The single exception is _unsharing_, which is the
  only action that removes it from everyone else's view — creator or current
  owner only. When the owner does it they **become** the creator, so
  `todos.creator_id` is mutable; the displaced creator is told, or the todo
  simply vanishes from their list. The greyed "Unshare" is a speed bump, not a
  boundary: anyone can claim ownership first, which is what the tooltip says.
- **Todo status has its own endpoint.** `PATCH` replaces the whole record,
  including links, so ticking something off a list would resend every field as
  that screen last read them — a lost update waiting to happen given anyone
  can edit. `POST …/status` touches one column. `PATCH` also deliberately
  cannot change `shared`; that would be a back door around the unshare rule.
- **`formatTimeAgoOrDate` is separate from `formatRelativeTime`.** Today it
  counts hours, yesterday says "Yesterday", older shows the date — by
  _calendar_ day, not elapsed hours, so at 1am something from 11pm reads
  "Yesterday". `formatRelativeTime` keeps its callers (chat, notifications,
  open conversations, the notes panel) where "2d ago" is the useful phrasing.
- **Shared links are built from ids, never `window.location`.** `useShareLink`
  - the href helpers in `lib/routes.ts`. Reading the address bar would paste
    whatever `?from=`/`?tab=` the sharer happened to arrive with — and in a list
    the address bar is the list, not the item.
- **`/` is dynamic and public.** Signed out it's a landing page; signed in it
  redirects to `/home`. `start_url` stays `/` so installed apps are unaffected
  and no manifest refetch is needed. It is deliberately _not_ precached — its
  content depends on the session.
- **Notification kind unions are derived from the schema**, not re-listed.
  `NotificationList` and `NotificationPreferences` each had a hand-written
  copy and both drifted the first time a kind was added. Type-only imports, so
  nothing server-side reaches the bundle.
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
- **`router.refresh()` refreshes the route you are _on_.** Calling it before
  `router.back()` refetches the page being discarded while the destination is
  restored from the client Router Cache unchanged. `RefreshAfterEdit` in the
  root layout handles this; edit screens must **not** call `refresh()`
  themselves.
- **Service-worker precache matches the query string.** `/practice` never
  matched `/practice?setlist=…`, so offline navigation failed and the fallback
  quietly re-served `/offline` — which looked like a dead link. Fixed with
  `precacheOptions.ignoreURLParametersMatching`; supplying it **replaces** the
  defaults, so `utm_`/`fbclid` have to be re-listed.
- **`dayKey` is the viewer's _local_ day.** Anything grouping by upload day has
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
- **`e2e/.auth/` is gitignored, so CI clones without it.** `seed()` writes
  `seed.json` there in `globalSetup`, and `writeFileSync` doesn't create
  parents — ENOENT. It passed locally for weeks purely because earlier runs
  had left the directory behind. `auth.setup.ts` _would_ have created it, but
  the setup project runs after globalSetup. Anything writing into a gitignored
  directory needs its own `mkdirSync`.
- **`bitnami/minio:latest` was removed from Docker Hub.** It 404s. Bitnami's
  images moved to a `bitnamilegacy/` namespace, which is an explicit
  deprecation holding pen — CI now runs the official `quay.io/minio/minio` as
  a _step_ instead, because GitHub service containers can't pass the
  `server /data` argument it needs.
- **Six DB suites write real bytes to object storage** (`albums`,
  `band-uploads`, `serve-cache`, `setlists`, `song-edit`, `song-files`), so
  the db-tests job needs MinIO exactly as e2e does. Symptom is "Object storage
  is not configured", nowhere near the actual cause.
- **Resend does not throw on API errors.** `emails.send()` returns
  `{ data, error }` (SDK 6.x) and `lib/email.ts` discards it; `forgot/route.ts`
  then catches anything that _does_ throw and always answers 200 for
  enumeration safety. So a bad `EMAIL_FROM`, an unverified domain or a rate
  limit look identical to success — no exception, no log, HTTP 200.
- **dotenv does not override variables already in the environment.** Which
  means `env -u FOO` doesn't reproduce "FOO unset" — `scripts/load-env` just
  refills it from `.env.local`. Set it _empty_ instead to simulate CI.
- **A hand-written copy of an enum union will drift.** Two existed for
  notification kinds; both broke the first time a kind was added. The
  `notification-groups` test now asserts every kind has exactly one home in
  Settings, which has since caught two real omissions.
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

## CI

`.github/workflows/ci.yml`, three jobs: **checks** (lint + types, no
services), **db-tests**, **e2e**. Both test jobs run Postgres as a service and
MinIO as a `docker run` step, then `scripts/migrate.mjs` and
`scripts/s3-init.mjs` before the suite. Separate buckets so they can't
collide.

Migrations run from the **committed files**, not `db:push` — deliberately the
same path production takes, so a migration that won't apply fails here rather
than on deploy.

Two things it does _not_ cover: Sentry source-map upload (no auth token, warns
harmlessly) and any real Google/Resend call.

## Test suite

- `pnpm test:db` — **192 node tests across 33 files**, ~10s, self-cleaning.
  Must stay serialized (`--test-concurrency=1`).
- `pnpm test:e2e` — Playwright, 4 specs, against a **production build**
  (the service worker is disabled in dev, so offline specs run in dev prove
  nothing). Seeds and tears down its own band; ids are written to
  `e2e/.auth/seed.json` so specs navigate directly instead of clicking through.
- **The e2e suite is deliberately small and curated** — it exists for things
  that have actually broken (see the comment at the top of
  `edit-refresh.spec.ts`). Most verification this month was done with
  throwaway specs that were deleted afterwards; that's the convention, not an
  oversight. One (`__sharing.spec.ts`) was committed by accident and later
  removed.
- **Sign-in is still not covered**, though the credentials form is live again
  in `app/login/page.tsx` — so email/password registration and reset are now
  reachable and untested. `auth.setup.ts` mints the session cookie directly.
  Worth a real spec, and it would have caught the reset-email problem above.
- Pure-logic modules get their own node tests without a database:
  `note-links`, `notification-changes`, `notification-groups`,
  `format-timestamps`, `event-bars`, `band-switch`, `chordpro`, `staleness`.

## Routing shape worth knowing

- `/` — public landing page signed out, redirect to `/home` signed in.
- Band tabs are `todos`, `events`, `venues`, `notes`, `polls`
  (`bandTabs.ts`). Chat and Audio/Setlists are **not** tabs any more: chat is
  `/bands/[id]/chat`, audio and setlists are `/bands/[id]/audio`. Old
  `?tab=chat`, `?tab=audio` and `?tab=setlists` links still redirect.
- Deep links that need a view, not just a tab, name it:
  `?tab=notes&notes=shared`, `?tab=todos&todos=mine`. Both are read in a plain
  effect so they beat the persisted choice, which `usePersistedBoolean`
  applies in a _layout_ effect.

## Where the event colours are applied

`CalendarClient` (month grid + day summary), `calendar/events/[eventId]`,
`BandOverviewTab` (title row only — the expanded panel stays neutral),
`home/UpcomingShows`, `home/RecentEvents`.
