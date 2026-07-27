import { and, desc, eq, gt, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from './index';
import {
  bandMembers,
  bands,
  notificationMutes,
  notificationReads,
  notifications,
  pushMutes,
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

export const NOTIFICATION_KINDS = notifications.kind.enumValues;
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
  /** True when this notification is about the viewer's own action. */
  isSelf: boolean;
}

export interface NotificationsPage {
  notifications: NotificationDTO[];
  /**
   * Opaque cursor for the next (older) page — pass back as `before`. Null when
   * there are no older notifications.
   */
  nextCursor: string | null;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * Cursor is `<createdAt ISO>|<id>` — the (timestamp, id) of the last row on a
 * page, so the next page starts strictly older than it. Returns null for a
 * missing or malformed cursor (treated as "from the top").
 */
function parseCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.indexOf('|');
  if (sep < 0) return null;
  const createdAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

// Kinds a user also receives for their own actions (creation events); every
// other kind excludes the actor from their own feed.
const SELF_VISIBLE_KINDS = [
  'poll-created',
  'poll-updated',
  'poll-closed',
  'poll-cancelled',
  'poll-auto-closed',
  'event-added',
  'setlist-created',
  'audio-added',
] as const;

/** SQL: notification is from someone else, or is a self-visible kind. */
function actorVisible(userId: string) {
  return or(
    sql`${notifications.actorId} <> ${userId}`,
    inArray(notifications.kind, [...SELF_VISIBLE_KINDS]),
  );
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
): Promise<{ actorName: string | null; bandName: string | null }> {
  const [[actor], [band]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, input.actorId)).limit(1),
    db.select({ name: bands.name }).from(bands).where(eq(bands.id, input.bandId)).limit(1),
  ]);
  const actorName = actor?.name ?? null;
  const bandName = band?.name ?? null;
  await db.insert(notifications).values({
    bandId: input.bandId,
    actorId: input.actorId,
    actorName,
    bandName,
    kind: input.kind,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectLabel: input.subjectLabel ?? null,
  });
  return { actorName, bandName };
}

/**
 * Best-effort notification creation: never throws, so a feed problem can't
 * break the mutation that triggered it. Failures are logged.
 */
export async function notify(input: CreateNotificationInput): Promise<void> {
  let names: { actorName: string | null; bandName: string | null };
  try {
    names = await createNotification(input);
  } catch (err) {
    console.error('[notifications] create failed', err);
    return;
  }
  // Fan out a mobile push in the background — never blocks or breaks the
  // action. Dynamically imported so `lib/push` (web-push) stays out of this
  // module's static graph and there's no import cycle. Names are reused from
  // the insert above so the push path doesn't re-query them.
  void import('../push')
    .then((m) => m.sendEventPush(input, names))
    .catch((err) => console.error('[push] fan-out failed', err));
}

/** Notification kinds the user has muted (default: none). */
export async function getMutedKinds(
  userId: string,
): Promise<NotificationKind[]> {
  const rows = await db
    .select({ kind: notificationMutes.kind })
    .from(notificationMutes)
    .where(eq(notificationMutes.userId, userId));
  return rows.map((r) => r.kind);
}

/** Mute or unmute a notification kind for the user. */
export async function setKindMuted(
  userId: string,
  kind: NotificationKind,
  muted: boolean,
): Promise<void> {
  if (muted) {
    await db
      .insert(notificationMutes)
      .values({ userId, kind })
      .onConflictDoNothing();
  } else {
    await db
      .delete(notificationMutes)
      .where(
        and(
          eq(notificationMutes.userId, userId),
          eq(notificationMutes.kind, kind),
        ),
      );
  }
}

/** Notification kinds the user has push-muted (kept in feed, no push). */
export async function getPushMutedKinds(
  userId: string,
): Promise<NotificationKind[]> {
  const rows = await db
    .select({ kind: pushMutes.kind })
    .from(pushMutes)
    .where(eq(pushMutes.userId, userId));
  return rows.map((r) => r.kind);
}

/** Push-mute or push-unmute a kind for the user (independent of feed mute). */
export async function setKindPushMuted(
  userId: string,
  kind: NotificationKind,
  muted: boolean,
): Promise<void> {
  if (muted) {
    await db.insert(pushMutes).values({ userId, kind }).onConflictDoNothing();
  } else {
    await db
      .delete(pushMutes)
      .where(and(eq(pushMutes.userId, userId), eq(pushMutes.kind, kind)));
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
 * A page of the user's notifications (newest first), across every band they
 * belong to, excluding their own actions. `unread` is relative to the user's
 * last-seen marker. Pass `before` (a prior page's `nextCursor`) to page back
 * through older notifications; `nextCursor` is null once none remain.
 */
export async function listNotifications(
  userId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<NotificationsPage> {
  const pageSize = Math.min(
    Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const cursor = parseCursor(opts.before);
  const [lastSeen, muted] = await Promise.all([
    getLastSeen(userId),
    getMutedKinds(userId),
  ]);
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      subjectType: notifications.subjectType,
      subjectId: notifications.subjectId,
      subjectLabel: notifications.subjectLabel,
      bandId: notifications.bandId,
      bandName: notifications.bandName,
      actorId: notifications.actorId,
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
    .where(
      and(
        actorVisible(userId),
        muted.length ? notInArray(notifications.kind, muted) : undefined,
        cursor
          ? or(
              lt(notifications.createdAt, cursor.createdAt),
              and(
                eq(notifications.createdAt, cursor.createdAt),
                lt(notifications.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    // Tiebreak on id so the (createdAt, id) cursor is a strict, stable order.
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    // Over-fetch by one to learn whether an older page exists.
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null;

  return {
    notifications: page.map(({ actorId, ...r }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      unread: r.createdAt > lastSeen,
      isSelf: actorId === userId,
    })),
    nextCursor,
  };
}

/** How many notifications are unread for the user. */
export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const [lastSeen, muted] = await Promise.all([
    getLastSeen(userId),
    getMutedKinds(userId),
  ]);
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
        actorVisible(userId),
        gt(notifications.createdAt, lastSeen),
        muted.length ? notInArray(notifications.kind, muted) : undefined,
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
