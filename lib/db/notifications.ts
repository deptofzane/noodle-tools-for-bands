import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from './index';
import {
  bandMembers,
  bands,
  notificationReads,
  notifications,
  users,
} from './schema';

/**
 * Notifications data layer — the Home activity feed.
 *
 * One row per event, scoped to a band; recipients are that band's members,
 * resolved at read time by joining membership (no per-user fan-out). The
 * acting user is excluded from their own notifications. Actor/band/subject
 * labels are snapshotted at write time so the feed reads well even after
 * the underlying row is renamed or deleted.
 *
 * Read state is a single per-user "last seen" timestamp: anything newer is
 * unread. Creation is best-effort (see `notify`) so a feed hiccup never
 * blocks the underlying action.
 */

export type NotificationKind = (typeof notifications.kind.enumValues)[number];
export type NotificationSubject =
  (typeof notifications.subjectType.enumValues)[number];

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  subjectType: NotificationSubject;
  subjectId: string | null;
  subjectLabel: string | null;
  bandId: string;
  bandName: string | null;
  actorName: string | null;
  createdAt: string; // ISO 8601
  unread: boolean;
}

export interface CreateNotificationInput {
  bandId: string;
  actorId: string;
  kind: NotificationKind;
  subjectType: NotificationSubject;
  subjectId?: string | null;
  subjectLabel?: string | null;
}

/**
 * Insert a notification, snapshotting the actor + band names. Throws on
 * failure — most callers should use `notify` instead.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  const [[actor], [band]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, input.actorId)).limit(1),
    db.select({ name: bands.name }).from(bands).where(eq(bands.id, input.bandId)).limit(1),
  ]);
  await db.insert(notifications).values({
    bandId: input.bandId,
    actorId: input.actorId,
    actorName: actor?.name ?? null,
    bandName: band?.name ?? null,
    kind: input.kind,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectLabel: input.subjectLabel ?? null,
  });
}

/**
 * Best-effort notification creation: never throws, so a feed problem can't
 * break the mutation that triggered it. Failures are logged.
 */
export async function notify(input: CreateNotificationInput): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[notifications] create failed', err);
  }
}

async function getLastSeen(userId: string): Promise<Date> {
  const [row] = await db
    .select({ lastSeenAt: notificationReads.lastSeenAt })
    .from(notificationReads)
    .where(eq(notificationReads.userId, userId))
    .limit(1);
  return row?.lastSeenAt ?? new Date(0);
}

/**
 * The user's most recent notifications (newest first), across every band
 * they belong to, excluding their own actions. `unread` is relative to the
 * user's last-seen marker.
 */
export async function listNotifications(
  userId: string,
  limit = 30,
): Promise<NotificationDTO[]> {
  const lastSeen = await getLastSeen(userId);
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      subjectType: notifications.subjectType,
      subjectId: notifications.subjectId,
      subjectLabel: notifications.subjectLabel,
      bandId: notifications.bandId,
      bandName: notifications.bandName,
      actorName: notifications.actorName,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, notifications.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .where(sql`${notifications.actorId} <> ${userId}`)
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    unread: r.createdAt > lastSeen,
  }));
}

/** How many notifications are unread for the user. */
export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const lastSeen = await getLastSeen(userId);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, notifications.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .where(
      and(
        sql`${notifications.actorId} <> ${userId}`,
        gt(notifications.createdAt, lastSeen),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Mark the whole feed read as of now (clears unread). */
export async function markNotificationsRead(userId: string): Promise<void> {
  await db
    .insert(notificationReads)
    .values({ userId, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: notificationReads.userId,
      set: { lastSeenAt: sql`now()` },
    });
}
