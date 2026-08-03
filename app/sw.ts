import { defaultCache } from '@serwist/next/worker';
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
const offlineRuntimeCaching: RuntimeCaching[] = [
  // Sheet-music file bytes. URLs are versioned (`?version=&v=updatedAt`) and
  // therefore immutable, so CacheFirst is both correct and fast. `?version=`
  // must stay part of the cache key, so search is NOT ignored here.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/conversations\/[^/]+\/files\/sheet_music/.test(url.pathname),
    handler: new CacheFirst({
      cacheName: 'sidestage-files',
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
  // <audio> element makes (seeking) from the fully-cached 200 response. The
  // `?name=` query only sets the download filename, so ignore search when
  // matching — the player's URL and the download URL still resolve to one entry.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/conversations\/[^/]+\/files\/audio/.test(url.pathname),
    handler: new CacheFirst({
      cacheName: 'sidestage-audio',
      matchOptions: { ignoreVary: true, ignoreSearch: true },
      plugins: [
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
      cacheName: 'sidestage-meta',
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
      cacheName: 'sidestage-meta',
      networkTimeoutSeconds: 3,
      matchOptions: { ignoreVary: true },
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  },
  // Legacy: Practice/Live documents cached per setlist by downloads made
  // before those screens moved to `/practice?setlist=…`. Nothing writes here
  // any more; the rule keeps older downloads working until they're refreshed.
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      request.mode === 'navigate' &&
      /\/setlists\/[^/]+\/practice(\/live)?\/?$/.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'sidestage-pages',
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
const PAGES_CACHE = 'sidestage-pages';

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

self.addEventListener('activate', (event) => {
  event.waitUntil(refreshCachedPageShells());
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
  const title = data.title || 'Sidestage';
  const url = data.url || '/home';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
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
