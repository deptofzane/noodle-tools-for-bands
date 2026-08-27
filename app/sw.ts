import { defaultCache } from '@serwist/next/worker';
import { appIcons } from '@/lib/app-icons';
import { canonicalAudioKey } from '@/lib/audio-cache-key';
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  RangeRequestsPlugin,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from 'serwist';

// The build injects the precache manifest (app shell: JS/CSS/static assets)
// into `self.__SW_MANIFEST`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Phase 2 — offline setlists. These rules let a downloaded setlist's sheet
 * music and its Practice/Live page shells be served from the cache with no
 * network, so a band can perform where venue wifi is unreliable. The
 * "Download for offline" action (see app/offline/offlineSetlists.ts) primes
 * these caches by fetching every needed URL while online; `ignoreVary` keeps
 * the cached copies servable regardless of request headers (cookie/RSC).
 *
 * Order matters: these run BEFORE `defaultCache` so they win over Serwist's
 * generic api/page rules.
 */
/**
 * Bumped when the audio cache's key scheme changes, so entries written under
 * the old one are dropped rather than lingering to their 60-day expiry. The
 * v2 scheme keys on the version id (see the audio rule below).
 */
const AUDIO_CACHE = 'noodle-audio-v2';

const offlineRuntimeCaching: RuntimeCaching[] = [
  // Sheet-music file bytes. URLs are versioned (`?version=&v=updatedAt`) and
  // therefore immutable, so CacheFirst is both correct and fast. `?version=`
  // must stay part of the cache key, so search is NOT ignored here.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/conversations\/[^/]+\/files\/sheet_music/.test(url.pathname) &&
      // A download is a one-off: it must reach the network so its
      // `attachment` disposition survives. The cache key drops `download`,
      // so serving one from here would hand back the `inline` copy and the
      // file would open instead of saving.
      url.searchParams.get('download') !== '1',
    handler: new CacheFirst({
      cacheName: 'noodle-files',
      matchOptions: { ignoreVary: true },
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({
          maxEntries: 600,
          maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
          purgeOnQuotaError: true, // let it be evicted under storage pressure
        }),
      ],
    }),
  },
  // Audio bytes. `RangeRequestsPlugin` serves the partial-content requests an
  // <audio> element makes (seeking) from the fully-cached 200 response.
  //
  // Cached under a canonical key: the version is kept, everything else (the
  // `?name=` that only sets a download filename) is dropped. That used to be
  // `ignoreSearch: true`, which collapsed *all* query strings into one entry
  // — so once a song's default version was downloaded, every other version of
  // it was answered with those same bytes. Keying on the version instead
  // makes each one its own entry, and leaves audio URLs immutable, which is
  // the assumption `CacheFirst` rests on.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/conversations\/[^/]+\/files\/audio/.test(url.pathname) &&
      // A download is a one-off: it must reach the network so its
      // `attachment` disposition survives. The cache key drops `download`,
      // so serving one from here would hand back the `inline` copy and the
      // file would open instead of saving.
      url.searchParams.get('download') !== '1',
    handler: new CacheFirst({
      cacheName: AUDIO_CACHE,
      matchOptions: { ignoreVary: true },
      plugins: [
        {
          cacheKeyWillBeUsed: async ({ request }) =>
            canonicalAudioKey(request.url),
        },
        new CacheableResponsePlugin({ statuses: [200] }),
        new RangeRequestsPlugin(),
        new ExpirationPlugin({
          maxEntries: 300,
          maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  // Sheet-music version metadata. Network-first so a just-uploaded/edited
  // version shows immediately online (stale-while-revalidate served the old
  // list to the post-upload refresh); still cached for offline use.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.endsWith('/sheet-music-versions'),
    handler: new NetworkFirst({
      cacheName: 'noodle-meta',
      networkTimeoutSeconds: 3,
      matchOptions: { ignoreVary: true },
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  },
  // A setlist's songs — what Practice and Live render. Network-first so an
  // online open reflects edits; the cached copy is what makes them work
  // offline, and "Download for offline" is what puts it there.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/setlists\/[^/]+\/practice-songs$/.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'noodle-meta',
      networkTimeoutSeconds: 3,
      matchOptions: { ignoreVary: true },
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  },
  // Legacy: Practice/Live documents cached per setlist by downloads made
  // before those screens moved to `/practice?setlist=…`. Nothing writes here
  // any more, and downloads no longer cache page shells at all — Practice and
  // Live come from the precached documents above. This rule exists solely so a
  // device that downloaded under the old scheme keeps working; `removeOffline`
  // still deletes those keys. Safe to delete once those downloads have aged
  // out.
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      request.mode === 'navigate' &&
      /\/setlists\/[^/]+\/practice(\/live)?\/?$/.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'noodle-pages',
      networkTimeoutSeconds: 3,
      matchOptions: { ignoreVary: true },
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  },
];

/**
 * Precache the app shell and take over immediately so an installed launch
 * paints without a network round-trip. `navigationPreload` speeds up online
 * navigations; `defaultCache` gives sensible runtime caching for everything
 * our offline rules above don't claim.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  /**
   * Which query parameters to ignore when matching a precached URL.
   *
   * Practice and Live are one precached document each, and the setlist rides
   * in the query (`/practice?setlist=…` — see lib/routes.ts) so a link can be
   * shared. Precache matching is exact on the query string by default, so the
   * shell was never found for the URL anyone actually visits: offline, the
   * navigation fell through to the network, failed, and the fallback quietly
   * re-served /offline — which looked like the link doing nothing.
   *
   * `song` is here for the same reason (a shared link can name a position).
   * The two defaults have to be repeated: supplying this replaces them.
   */
  precacheOptions: {
    ignoreURLParametersMatching: [/^setlist$/, /^song$/, /^utm_/, /^fbclid$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...offlineRuntimeCaching, ...defaultCache],
  // Last resort for a page we can't produce: rather than the browser's dinosaur,
  // show `/offline`, which lists what this device can still do (see
  // app/offline/OfflineClient.tsx). Downloaded Practice/Live shells are matched
  // by the rules above and never reach this. `/offline` itself is precached —
  // see `additionalPrecacheEntries` in next.config.ts.
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// --- Keeping downloaded page shells usable across deploys -------------------

/** Cache holding the downloaded Practice/Live documents. Matches the rule above. */
const PAGES_CACHE = 'noodle-pages';

/**
 * Re-fetch every cached page shell when a new service worker takes over.
 *
 * A downloaded Practice/Live page is a rendered HTML document that references
 * this build's content-hashed JS chunks. Those chunks are precached under
 * filenames that change every deploy, and the old ones are cleaned up when the
 * new worker installs — so a shell cached against an earlier build points at
 * files that no longer exist anywhere. Offline, it can't load them and the
 * page dies on the way up, which reads as "my downloaded setlist is gone".
 *
 * By activation the new precache is already in place, so re-fetching each
 * shell now re-points it at chunks that are actually present. Best-effort:
 * activating while offline leaves the existing entries alone (stale beats
 * nothing), and the next activation online repairs them.
 */
async function refreshCachedPageShells(): Promise<void> {
  try {
    const cache = await caches.open(PAGES_CACHE);
    const requests = await cache.keys();
    await Promise.all(
      requests.map(async (request) => {
        try {
          const fresh = await fetch(request.url, {
            cache: 'reload',
            credentials: 'same-origin',
          });
          // Only replace on a clean hit. A redirect means the session lapsed —
          // caching the login page over a setlist would be worse than stale.
          if (fresh.ok && !fresh.redirected) await cache.put(request, fresh);
        } catch {
          // Offline or the page is gone: keep what we have.
        }
      }),
    );
  } catch {
    // No Cache Storage — nothing to keep fresh.
  }
}

/**
 * Drop caches this build no longer writes to.
 *
 * Two kinds: audio cached under a retired key scheme (renaming the cache is
 * what makes a new scheme take effect), and everything under the app's former
 * `sidestage-` name. Without this they'd sit there holding a copy of every
 * downloaded song until their 60-day expiry — on a phone, that can be
 * gigabytes of audio no code will ever read again.
 */
async function dropStaleCaches(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (n) =>
            n.startsWith('sidestage-') ||
            (n.startsWith('noodle-audio') && n !== AUDIO_CACHE),
        )
        .map((n) => caches.delete(n)),
    );
  } catch {
    // No Cache Storage — nothing to clean up.
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([refreshCachedPageShells(), dropStaleCaches()]));
});

// --- Web Push -------------------------------------------------------------
// A push carries a small JSON payload ({ title, body, url, tag }) built by
// lib/push.ts. Show it as a notification; tapping it focuses an existing tab
// (navigating it to the deep link) or opens a new one.

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Non-JSON payload — fall back to plain text as the body.
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Noodle';
  const url = data.url || '/home';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: appIcons.icon192,
      badge: appIcons.icon192,
      tag: data.tag,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url;
  const url = target || '/home';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        // Reuse an open app window; steer it to the deep link.
        if ('focus' in client) {
          await client.focus();
          if (client.url !== new URL(url, self.location.origin).href) {
            await client.navigate(url).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
