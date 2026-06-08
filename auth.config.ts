import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Edge-compatible Auth.js config.
 *
 * This file MUST stay free of any Node-only imports. It's used directly
 * by `middleware.ts`, which runs in the Edge runtime where Node built-ins
 * (`node:process`, `node:fs`, etc.) are forbidden. Webpack will fail the
 * build with `UnhandledSchemeError` if anything in this file's import
 * graph reaches into `googleapis` or other Node-only packages.
 *
 * The full config lives in `auth.ts`, which spreads this object and adds
 * the `jwt` / `session` callbacks. Those callbacks call into
 * `lib/google.ts` for token refresh — which is itself Edge-safe today
 * but isolated here as a safety margin: future callbacks that need
 * Node-only deps (DB calls, file system, etc.) can be added in `auth.ts`
 * without breaking middleware.
 *
 * See: https://authjs.dev/guides/edge-compatibility
 */
export default {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Google({
      // AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are picked up automatically
      // from env by Auth.js v5 — no need to pass them here.
      authorization: {
        params: {
          scope: 'openid email profile',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
} satisfies NextAuthConfig;
