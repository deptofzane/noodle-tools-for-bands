import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { cookies } from 'next/headers';
import authConfig from './auth.config';
import { refreshGoogleAccessToken } from '@/lib/google';
import { getUserByEmail } from '@/lib/db/users';
import {
  findOrCreateGoogleUser,
  getAccountByProvider,
  getUserAccount,
  linkGoogleAccount,
} from '@/lib/db/accounts';
import { verifyPassword } from '@/lib/password';
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit';
import { LINK_COOKIE, verifyLinkToken } from '@/lib/link-token';
import { isUuid } from '@/lib/uuid';

/**
 * Read AND clear the one-shot "link to this user" cookie. Clearing it on
 * the first Google sign-in (any outcome) closes the window where a stale
 * cookie could attach a *later*, unrelated Google login to the wrong user.
 */
async function consumeLinkUid(): Promise<string | null> {
  try {
    const store = await cookies();
    const uid = verifyLinkToken(store.get(LINK_COOKIE)?.value);
    try {
      store.delete(LINK_COOKIE);
    } catch {
      // best-effort; the cookie is also short-lived
    }
    return uid;
  } catch {
    return null;
  }
}

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
  // Add the email/password provider on top of the Edge-safe Google config.
  // It lives here (Node) — never in auth.config.ts — so middleware's Edge
  // bundle doesn't pull in the DB / argon2.
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds, request) {
        const email = typeof creds?.email === 'string' ? creds.email : '';
        const password =
          typeof creds?.password === 'string' ? creds.password : '';
        if (!email || !password) return null;

        // Throttle login attempts BEFORE the (deliberately expensive)
        // argon2 verify — both to blunt password brute-forcing and to keep
        // that from becoming a CPU-exhaustion vector. Keyed per-email
        // (spray against one account) and per-IP (spray across accounts).
        // An over-limit attempt looks like any failed login (returns null).
        const perEmail = rateLimit(`login:email:${email.toLowerCase()}`, {
          limit: 10,
          windowMs: 10 * 60 * 1000,
        });
        const perIp = rateLimitByIp('login:ip', request, {
          limit: 50,
          windowMs: 10 * 60 * 1000,
        });
        if (!perEmail.allowed || !perIp.allowed) return null;

        const user = await getUserByEmail(email);
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(user.passwordHash, password))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // When a signed-in user is *linking* a Google account (the start route
    // set the link cookie), reject up front if that Google account already
    // belongs to someone else, or if they already linked a different one.
    // Returning a string redirects there with a message the UI reads.
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      // Consume the link cookie up front (one-shot), so it can't linger and
      // hijack a future sign-in. When absent, this is a normal login.
      const linkUid = await consumeLinkUid();
      if (!linkUid) return true;

      const sub = profile?.sub ?? '';
      const existing = await getAccountByProvider('google', sub);
      if (existing && existing.userId !== linkUid) {
        return '/settings?tab=account&link=conflict';
      }
      const current = await getUserAccount(linkUid, 'google');
      if (current && current.providerAccountId !== sub) {
        return '/settings?tab=account&link=exists';
      }

      // Link here. The jwt callback's normal Google resolution then maps
      // this account to `linkUid`, so the user stays signed in as themselves
      // — no cross-callback cookie handoff needed.
      try {
        await linkGoogleAccount(linkUid, sub, profile?.email ?? null);
      } catch {
        // Any conflict was caught by the checks above; a rare race here is
        // safe to ignore (the account simply won't be linked this time).
      }
      return true;
    },

    async jwt({ token, account, profile, user }) {
      // Treat the token as our typed view for the rest of this function;
      // it's the same object, just with named fields.
      const t = token as typeof token & AppJWT;

      // Email/password sign-in: the DB user id is the identity; no Google
      // tokens. `user` is what the Credentials `authorize` returned.
      if (account?.provider === 'credentials' && user) {
        t.sub = user.id;
        delete t.accessToken;
        delete t.refreshToken;
        delete t.accessTokenExpiresAt;
        delete t.scopes;
        delete t.error;
        return t;
      }

      // (1) Fresh Google sign-in or scope upgrade. Resolve the user for this
      // Google account. If a link was just performed in the `signIn`
      // callback, that account now maps to the linking user, so this
      // naturally keeps them signed in as themselves.
      if (account && profile) {
        const dbUser = await findOrCreateGoogleUser({
          sub: profile.sub ?? '',
          email: profile.email,
          name: profile.name,
        });
        t.sub = dbUser.id;
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

      // Repair a session minted before identity moved to Postgres, whose
      // `sub` is the Google account id rather than a DB user id. Those cookies
      // stay valid for as long as they're used, so they'd otherwise keep
      // handing a 21-digit number to queries expecting a uuid — which Postgres
      // rejects outright (22P02), 500ing every page that looks the user up.
      // The Google id still identifies the account, so translate it once.
      if (t.sub && !isUuid(t.sub)) {
        const linked = await getAccountByProvider('google', t.sub);
        if (linked) {
          t.sub = linked.userId;
        } else {
          // Nothing to map it to — drop the identity so downstream lookups
          // miss cleanly and the user is treated as signed out.
          console.warn('[auth] dropping session with unresolvable identity');
          delete t.sub;
        }
      }

      // (2) + (3) Cached token — refresh if near expiry
      if (t.accessToken && t.accessTokenExpiresAt && t.refreshToken) {
        const msUntilExpiry = t.accessTokenExpiresAt - Date.now();
        if (msUntilExpiry < 60_000) {
          const result = await refreshGoogleAccessToken(t.refreshToken);
          if (result.ok) {
            const { tokens } = result;
            t.accessToken = tokens.access_token;
            t.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
            if (tokens.refresh_token) {
              t.refreshToken = tokens.refresh_token;
            }
            if (tokens.scope) {
              t.scopes = tokens.scope.split(' ').filter(Boolean);
            }
            delete t.error;
          } else if (result.reason === 'dead') {
            // The grant is gone (revoked, or expired under a Testing-mode
            // consent screen). Drop the credentials: the guard above is what
            // stops us asking Google again on every single request, and
            // clearing `scopes` turns off the Drive UI. The user reconnects
            // from Settings, which mints a fresh refresh token.
            console.warn(
              '[auth] Google grant is no longer valid:',
              result.detail,
            );
            delete t.accessToken;
            delete t.refreshToken;
            delete t.accessTokenExpiresAt;
            delete t.scopes;
            t.error = 'RefreshAccessTokenError';
          } else {
            // Google was unreachable or rate-limiting — keep the refresh token
            // and try again on the next request.
            console.warn(
              '[auth] token refresh failed, will retry:',
              result.detail,
            );
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
});
