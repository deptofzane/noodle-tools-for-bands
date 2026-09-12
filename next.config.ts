import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Tell Next.js not to bundle `googleapis` into the server build —
  // it's a Node-only library with `node:*` imports that webpack would
  // otherwise try to process. Listing it here makes Next.js leave it
  // as a runtime `require()`, which both speeds up builds and avoids
  // `UnhandledSchemeError`s when any code path crosses into webpack's
  // edge-style bundling.
  serverExternalPackages: ['googleapis'],

  /**
   * `/calendar` became `/scheduling`, and these keep the old paths working.
   *
   * Not just for bookmarks. Two kinds of link are already out in the world and
   * can't be rewritten: the iCalendar feed writes an absolute
   * `…/calendar/events/<id>` into every event people have subscribed in Google
   * or Apple Calendar, and each push notification carries its URL in the
   * payload, so notifications already sitting on a phone still point at the
   * old path. Both would dead-end without this.
   *
   * `:path*` matches zero or more segments, so bare `/calendar` is covered
   * too. `/api/calendar/<token>` — the feed's own URL, which subscribers
   * cannot re-add silently — is a different prefix and is deliberately
   * untouched.
   */
  async redirects() {
    return [
      {
        source: '/calendar/:path*',
        destination: '/scheduling/:path*',
        permanent: true,
      },
    ];
  },

  /**
   * Baseline security headers, applied to every response.
   *
   * No Content-Security-Policy yet, deliberately. The app loads Google's
   * Picker from gstatic, runs an inline theme script before paint (see
   * layout.tsx), and registers a service worker — a policy strict enough to
   * be worth having would need each of those enumerated and verified in a
   * browser, not guessed at here. Worth doing next, in report-only first.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // A year, without `preload`: preloading is a one-way door (removal
          // takes months), and it's not a commitment to make on the way to a
          // first release.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // Never let a browser second-guess a declared type. Audio and sheet
          // music are served from our own origin, so a sniffed `text/html`
          // would be script execution on the session.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nobody frames us. The Google Picker is an iframe *inside* our
          // page, which this doesn't affect.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Send the origin off-site, the full path within it: setlist and
          // song ids don't belong in another site's referer log.
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // The app asks for none of these — playback needs no microphone.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

// Turn the app into an installable PWA: the plugin compiles `app/sw.ts` to
// `public/sw.js` and injects the app-shell precache manifest. Disabled in dev
// so the service worker's caching doesn't interfere with hot reload.
/**
 * Cache-buster for precached HTML, regenerated on every build.
 *
 * Build assets are content-hashed, so Serwist gives them `revision: null` and
 * a new filename each build. A rendered document can't work that way: its URL
 * never changes, so its revision is what tells Serwist the cached copy is
 * stale. Pinning that to a hand-written string meant the offline page's HTML
 * was kept across deploys while the chunks it references were replaced —
 * offline, it booted into missing chunks and errored out instead of rendering.
 */
const htmlRevision = Date.now().toString(36);

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Rendered routes the manifest doesn't pick up on its own, and that have to
  // be in the cache before the network goes away. One document each, serving
  // every setlist — the ids ride in the query string (see lib/routes.ts), so
  // these three entries cover offline use of the whole app.
  additionalPrecacheEntries: [
    { url: '/offline', revision: htmlRevision },
    { url: '/practice', revision: htmlRevision },
    { url: '/live', revision: htmlRevision },
  ],
});

/**
 * Sentry wraps last so it sees the fully-composed config.
 *
 * Source maps are uploaded only when a token is present, so a build without
 * one still succeeds — stack traces are just minified until it's set. They're
 * deleted after upload so the app's source isn't served to browsers alongside
 * the bundle.
 */
export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes browser reports through our own origin, so ad blockers don't
  // silently swallow the errors we most need to see.
  tunnelRoute: '/monitoring',
});
