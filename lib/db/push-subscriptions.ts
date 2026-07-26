import { and, eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { pushSubscriptions } from './schema';

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

/** All subscriptions for a set of users (for fanning out a push). */
export async function listPushSubscriptionsForUsers(
  userIds: string[],
): Promise<StoredPushSubscription[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
}
