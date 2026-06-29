import NextAuth from 'next-auth';
import authConfig from './auth.config';
import { refreshGoogleAccessToken } from '@/lib/google';
import { upsertUser } from '@/lib/db/users';

/**
 * Local typed view of the JWT payload's app-owned fields.
 *
 * `@auth/core/jwt`'s `JWT` interface is `Record<string, unknown> & DefaultJWT`,
 * which means custom fields default to `unknown` on access. Module
 * augmentation of that interface from a `.d.ts` file doesn't reliably
 * work in this project (see the note in `types/next-auth.d.ts`), so we
 * declare the shape locally and cast `token` to it at callback entry.
 *
 * Anything not listed here continues to behave as the base JWT's
 * `unknown`-typed index signature.
 */
interface AppJWT {
  sub?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  scopes?: string[];
  error?: string;
}

/**
 * Full Auth.js v5 configuration.
 *
 * This is the version used by server components, API route handlers,
 * and the Auth.js handler mount at `/api/auth/[...nextauth]/route.ts`.
 * It extends the Edge-compatible `auth.config.ts` with the `jwt` and
 * `session` callbacks.
 *
 * Why the split: `middleware.ts` (Edge runtime) imports `authConfig`
 * directly and creates its own minimal NextAuth instance, so none of
 * the heavier callback code below ends up in the Edge bundle. See the
 * doc comment in `auth.config.ts` for details.
 *
 * The `jwt` callback handles three states:
 *   1. First sign-in (or scope upgrade) — captures fresh tokens
 *   2. Cached token still fresh — passes through untouched
 *   3. Cached token within 60s of expiry — refreshes via Google's
 *      token endpoint, persists the new access token / expiry. On
 *      failure, stamps `error: 'RefreshAccessTokenError'`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, account, profile }) {
      // Treat the token as our typed view for the rest of this function;
      // it's the same object, just with named fields.
      const t = token as typeof token & AppJWT;

      // (1) Fresh sign-in or scope upgrade
      if (account && profile) {
        // Google's `profile.sub` is `string | null | undefined` per the
        // Auth.js type; coerce null → undefined to match JWT's `sub`.
        t.sub = profile.sub ?? undefined;
        t.accessToken = account.access_token ?? undefined;
        // Google sometimes omits the refresh token on subsequent grants
        // (e.g., re-auth for additional scopes without `prompt=consent`).
        // Keep the previous one as a fallback.
        t.refreshToken = account.refresh_token ?? t.refreshToken;
        t.accessTokenExpiresAt = (account.expires_at ?? 0) * 1000;
        t.scopes = (account.scope ?? '').split(' ').filter(Boolean);
        delete t.error;
        return t;
      }

      // (2) + (3) Cached token — refresh if near expiry
      if (t.accessToken && t.accessTokenExpiresAt && t.refreshToken) {
        const msUntilExpiry = t.accessTokenExpiresAt - Date.now();
        if (msUntilExpiry < 60_000) {
          try {
            const refreshed = await refreshGoogleAccessToken(t.refreshToken);
            t.accessToken = refreshed.access_token;
            t.accessTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
            if (refreshed.refresh_token) {
              t.refreshToken = refreshed.refresh_token;
            }
            if (refreshed.scope) {
              t.scopes = refreshed.scope.split(' ').filter(Boolean);
            }
            delete t.error;
          } catch (err) {
            console.error('[auth] token refresh failed', err);
            t.error = 'RefreshAccessTokenError';
          }
        }
      }

      return t;
    },

    async session({ session, token }) {
      const t = token as typeof token & AppJWT;

      // Identity + scope info — fine to expose to client components.
      if (t.sub) session.user.sub = t.sub;
      session.scopes = t.scopes ?? [];
      session.error = t.error;

      // The access token is exposed on the session so the client-side
      // Google Picker (Phase 2) can use it. The Picker is an
      // authenticated browser experience that requires a user-bound
      // OAuth token. The refresh token is NEVER exposed here.
      session.accessToken = t.accessToken;
      return session;
    },
  },
  events: {
    async signIn({ profile }) {
      // OAuth sign-in: persist/refresh the user row keyed by Google sub.
      if (!profile?.sub) return;
      await upsertUser({
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name,
      });
    },
  },
});
