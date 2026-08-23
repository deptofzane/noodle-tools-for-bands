import { and, eq, ne, notExists } from 'drizzle-orm';
import { db } from './index';
import {
  bandMembers,
  notificationMutes,
  pushMutes,
  pushSubscriptions,
} from './schema';
import type { NotificationKind } from './notifications';

/**
 * Web Push subscriptions — one row per installed device/browser. The endpoint
 * is the stable identity, so a re-subscribe (keys rotate) just updates the row
 * and can move it to a different user.
 */

export interface StoredPushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Only accept a subscription whose endpoint is HTTPS on a known push service
 * host. Otherwise a caller could register an arbitrary or internal URL that
 * the server would later POST to when sending (an SSRF vector). New browsers'
 * hosts can be added here as needed.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (
    host === 'fcm.googleapis.com' || // Chrome / Edge / Android
    host.endsWith('.push.apple.com') || // Safari / iOS
    host.endsWith('.push.services.mozilla.com') || // Firefox
    host.endsWith('.notify.windows.com') // legacy Edge / WNS
  );
}

/** Upsert a device's subscription (keyed by endpoint). */
export async function savePushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
}

/** Remove a subscription by endpoint (optionally scoped to a user). */
export async function deletePushSubscription(
  endpoint: string,
  userId?: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      userId
        ? and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, userId),
          )
        : eq(pushSubscriptions.endpoint, endpoint),
    );
}

/**
 * The exact set of device subscriptions to push a notification to, in one
 * query: subscriptions belonging to the band's members, excluding the actor
 * and anyone who feed-muted or push-muted the kind. Empty result → nobody to
 * push (the common case), so the caller does no further work.
 */
export async function listPushTargets(input: {
  bandId: string;
  actorId: string;
  kind: NotificationKind;
  /**
   * When the notification is addressed to one person, only their devices get
   * it. Omit for a broadcast.
   *
   * This is the reader that matters most: the feed merely showing a private
   * row to the wrong person is a leak on a screen they have to open, whereas
   * getting it wrong here puts it on four people's lock screens.
   */
  recipientId?: string | null;
}): Promise<StoredPushSubscription[]> {
  return db
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.userId, pushSubscriptions.userId),
        eq(bandMembers.bandId, input.bandId),
      ),
    )
    .where(
      and(
        ne(pushSubscriptions.userId, input.actorId),
        // Still band-scoped as well: a recipient who has since left the band
        // shouldn't be reachable through it.
        input.recipientId
          ? eq(pushSubscriptions.userId, input.recipientId)
          : undefined,
        notExists(
          db
            .select({ u: notificationMutes.userId })
            .from(notificationMutes)
            .where(
              and(
                eq(notificationMutes.userId, pushSubscriptions.userId),
                eq(notificationMutes.kind, input.kind),
              ),
            ),
        ),
        notExists(
          db
            .select({ u: pushMutes.userId })
            .from(pushMutes)
            .where(
              and(
                eq(pushMutes.userId, pushSubscriptions.userId),
                eq(pushMutes.kind, input.kind),
              ),
            ),
        ),
      ),
    );
}
