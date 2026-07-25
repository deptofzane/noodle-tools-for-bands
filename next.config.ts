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
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
