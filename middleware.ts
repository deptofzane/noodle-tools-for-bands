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
 *   - `/login`, `/signup`, `/forgot`, `/reset`, `/offline`, and `/api/health`
 *     are public
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
  // Public by requirement, not convenience: Play's listing review and Google's
  // OAuth verification both fetch these without an account, and a login
  // redirect would read as a missing policy.
  '/privacy',
  '/delete-account',
  // The offline screen. It holds no server data — what it lists comes from the
  // device's own IndexedDB — and the service worker precaches it to serve when
  // a navigation fails. Behind auth, that precache would be a login redirect,
  // which is the last thing to show someone whose network just died.
  '/offline',
  // The Practice and Live shells, for the same reason: empty documents that
  // fetch their setlist client-side, precached so they open with no network.
  // The data behind them is guarded by GET /api/setlists/[id]/practice-songs,
  // and a shell that gets a 401 sends the visitor to log in and returns them
  // to the URL they were given.
  '/practice',
  '/live',
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
  // Path *and* query: shared links carry their subject in the query string
  // (`/practice?setlist=…`, `/bands/x?tab=chat`), and dropping it would land
  // people on a bare screen after signing in instead of where they were sent.
  url.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

// Skip middleware for static assets and Next.js internals.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
