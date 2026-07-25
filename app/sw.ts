import { defaultCache } from '@serwist/next/worker';
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  RangeRequestsPlugin,
  Serwist,
  StaleWhileRevalidate,
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
  // Sheet-music version metadata. Not URL-versioned, so revalidate in the
  // background (new versions appear online) while still serving offline.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.endsWith('/sheet-music-versions'),
    handler: new StaleWhileRevalidate({
      cacheName: 'sidestage-meta',
      matchOptions: { ignoreVary: true },
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  },
  // The Practice / Live page shells (hard navigations). Network-first so an
  // online launch is always fresh; falls back to the cached shell offline.
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
});

serwist.addEventListeners();
