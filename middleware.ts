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
 *   - `/login`, `/signup`, `/forgot`, `/reset`, and `/api/health` are public
 *   - `/api/auth/*` (Auth.js handlers + register/forgot/reset) are always allowed
 *   - `/api/calendar/<token>` (the iCalendar feed) is public — calendar apps
 *     fetch it with no session; the unguessable token is its credential. Only
 *     the single-segment feed path is exempt, not the management sub-routes.
 *   - Everything else requires a signed-in user; unauthenticated
 *     requests are redirected to `/login?callbackUrl=<original-path>`
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/signup',
  '/forgot',
  '/reset',
  '/api/health',
]);

// The unauthenticated calendar feed: exactly `/api/calendar/<token>` (one
// segment). `/api/calendar/feed/...` management routes are NOT matched and
// stay behind auth.
const CALENDAR_FEED_RE = /^\/api\/calendar\/[^/]+$/;

// Invite landing: `/invite/<token>` renders for signed-out users (so they can
// sign up / log in with the invite in hand). Redeeming still requires auth
// (POST /api/invites/accept is not public).
const INVITE_RE = /^\/invite\/[^/]+$/;

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/auth')) return;
  if (PUBLIC_PATHS.has(pathname)) return;
  if (CALENDAR_FEED_RE.test(pathname)) return;
  if (INVITE_RE.test(pathname)) return;
  if (req.auth) return;

  const url = new URL('/login', req.nextUrl);
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
});

// Skip middleware for static assets and Next.js internals.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
