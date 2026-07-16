import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed cookie that carries "link the next Google sign-in to this user"
 * intent through the OAuth roundtrip. HMAC'd with AUTH_SECRET so the client
 * can't forge a different user id. Short-lived (set with a small maxAge).
 *
 * Node-only. Used by the account-link start route and the auth callbacks.
 */
export const LINK_COOKIE = 'google-link';

function mac(userId: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? '')
    .update(userId)
    .digest('base64url');
}

export function signLinkToken(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

/** Returns the user id if the token is present and valid, else null. */
export function verifyLinkToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = mac(userId);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
