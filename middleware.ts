import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from './auth.config';

/**
 * Auth-aware middleware (Edge runtime).
 *
 * Imports the minimal `auth.config.ts` directly — NOT the full `auth.ts`
 * — so nothing in the Node-only callback code (or its transitive deps
 * like `googleapis`) ever ends up in the Edge bundle. This is what
 * keeps webpack from throwing `UnhandledSchemeError: node:process`.
 *
 * Routing rules:
 *   - `/login` and `/api/health` are public
 *   - `/api/auth/*` (Auth.js's own handlers) are always allowed
 *   - Everything else requires a signed-in user; unauthenticated
 *     requests are redirected to `/login?callbackUrl=<original-path>`
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>(['/login', '/api/health']);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/auth')) return;
  if (PUBLIC_PATHS.has(pathname)) return;
  if (req.auth) return;

  const url = new URL('/login', req.nextUrl);
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
});

// Skip middleware for static assets and Next.js internals.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
