import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Tell Next.js not to bundle `googleapis` into the server build —
  // it's a Node-only library with `node:*` imports that webpack would
  // otherwise try to process. Listing it here makes Next.js leave it
  // as a runtime `require()`, which both speeds up builds and avoids
  // `UnhandledSchemeError`s when any code path crosses into webpack's
  // edge-style bundling.
  serverExternalPackages: ['googleapis'],
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
  // The offline screen has to be in the cache before the network goes away,
  // and it's a rendered route rather than a build asset, so the manifest
  // doesn't pick it up on its own.
  additionalPrecacheEntries: [{ url: '/offline', revision: htmlRevision }],
});

export default withSerwist(nextConfig);
