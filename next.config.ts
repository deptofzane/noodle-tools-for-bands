import type { NextConfig } from 'next';

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

export default nextConfig;
