import type { DefaultSession } from 'next-auth';

/**
 * Module augmentation for Auth.js types.
 *
 * Session (fine to expose to client components via React props):
 *   - `user.sub`        Stable Google ID. Phase 4 uses this as the
 *                       suffix on each user's notes file
 *                       (`user-<sub>.json`).
 *   - `scopes`          OAuth scopes currently granted. Phase 2 checks
 *                       this to detect when `drive.file` is missing.
 *   - `accessToken`     Short-lived OAuth access token. Exposed so the
 *                       client-side Google Picker can use it. Never
 *                       persisted client-side.
 *   - `error`           Set to 'RefreshAccessTokenError' when the
 *                       refresh-token exchange has failed. UI should
 *                       prompt re-auth when present.
 *
 * JWT (server-only, lives inside the encrypted cookie):
 *   - `accessToken`     Current Google access token
 *   - `refreshToken`    Long-lived refresh token. NEVER exposed to the
 *                       client — that's why it lives only on the JWT
 *                       and not on the session.
 *   - `accessTokenExpiresAt` Unix ms when the current access token expires
 *   - `scopes`          Granted scopes (canonical copy)
 *   - `error`           Set when refresh fails
 */
declare module 'next-auth' {
  interface Session {
    user: {
      sub: string;
    } & DefaultSession['user'];
    scopes: string[];
    accessToken?: string;
    error?: string;
  }
}

/**
 * NOTE on JWT typing:
 *
 * The `JWT` interface lives in `@auth/core/jwt` and is only re-exported
 * by `next-auth/jwt`. Module augmentation can't target either of these
 * paths from here:
 *   - `next-auth/jwt` re-exports `JWT` but doesn't declare it, and
 *     interface merging only works against the originating declaration.
 *   - `@auth/core/jwt` isn't a top-level dep of this project (pnpm only
 *     exposes `next-auth`), so TS can't resolve the augmentation target.
 *
 * Instead, `auth.ts` defines a local `AppJWT` shape that names the
 * fields we attach and uses it via a single cast at callback entry.
 * That keeps the typing local to where it matters and removes the
 * coupling to next-auth's internal module layout.
 */

export {};
