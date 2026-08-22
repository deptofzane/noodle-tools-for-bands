import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db, type DbExecutor } from './index';
import {
  bandChatReads,
  bandMembers,
  bandMessageMentions,
  bandMessages,
  users,
} from './schema';
import { BAND_CHANNEL } from './notify';

/**
 * Band messages data layer — a flat, band-wide chat thread.
 *
 * Mutations emit `pg_notify('band_activity', <bandId>)` from inside their
 * transaction, so the SSE hub delivers the signal exactly on commit (see
 * `lib/db/notify.ts`). Deletes are soft (a `deletedAt` stamp) so ids stay
 * stable and history isn't torn out from under other viewers.
 */

export interface BandMessageDTO {
  id: string;
  body: string;
  createdAt: string; // ISO 8601
  editedAt: string | null;
  author: { id: string; name: string | null; email: string | null };
  mentions: string[]; // mentioned user ids
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const SELECT = {
  id: bandMessages.id,
  body: bandMessages.body,
  createdAt: bandMessages.createdAt,
  editedAt: bandMessages.editedAt,
  authorId: users.id,
  authorName: users.name,
  authorEmail: users.email,
} as const;

type Row = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  authorName: string | null;
  authorEmail: string | null;
};

function toDTO(r: Row, mentions: string[]): BandMessageDTO {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    author: { id: r.authorId, name: r.authorName, email: r.authorEmail },
    mentions,
  };
}

/** Mentioned user ids grouped by message id, for a batch of messages. */
async function mentionsByMessage(
  messageIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (messageIds.length === 0) return map;
  const rows = await db
    .select({
      messageId: bandMessageMentions.messageId,
      userId: bandMessageMentions.mentionedUserId,
    })
    .from(bandMessageMentions)
    .where(inArray(bandMessageMentions.messageId, messageIds));
  for (const r of rows) {
    const list = map.get(r.messageId);
    if (list) list.push(r.userId);
    else map.set(r.messageId, [r.userId]);
  }
  return map;
}

/** Restrict requested mention ids to actual current members of the band. */
async function membersAmong(
  bandId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ userId: bandMembers.userId })
    .from(bandMembers)
    .where(
      and(eq(bandMembers.bandId, bandId), inArray(bandMembers.userId, userIds)),
    );
  return rows.map((r) => r.userId);
}

/**
 * A page of a band's messages, oldest → newest for display. Pass `before`
 * (an ISO timestamp cursor) to load the page immediately older than it.
 * `hasMore` indicates there are still older messages beyond this page.
 */
export async function listBandMessages(
  bandId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: BandMessageDTO[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const before = opts.before ? new Date(opts.before) : null;
  const beforeValid = before && !Number.isNaN(before.getTime()) ? before : null;

  // Fetch newest-first (so the cursor + limit walk backwards through
  // history), grab one extra to detect `hasMore`, then reverse to ascending.
  const rows = await db
    .select(SELECT)
    .from(bandMessages)
    .innerJoin(users, eq(users.id, bandMessages.authorId))
    .where(
      and(
        eq(bandMessages.bandId, bandId),
        isNull(bandMessages.deletedAt),
        beforeValid ? lt(bandMessages.createdAt, beforeValid) : undefined,
      ),
    )
    .orderBy(desc(bandMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const mentions = await mentionsByMessage(page.map((r) => r.id));
  return {
    messages: page.map((r) => toDTO(r, mentions.get(r.id) ?? [])),
    hasMore,
  };
}

async function getMessage(id: string): Promise<BandMessageDTO | null> {
  const [row] = await db
    .select(SELECT)
    .from(bandMessages)
    .innerJoin(users, eq(users.id, bandMessages.authorId))
    .where(eq(bandMessages.id, id))
    .limit(1);
  if (!row) return null;
  const mentions = await mentionsByMessage([id]);
  return toDTO(row, mentions.get(id) ?? []);
}

async function replaceMentions(
  exec: DbExecutor,
  messageId: string,
  mentionUserIds: string[],
): Promise<void> {
  await exec
    .delete(bandMessageMentions)
    .where(eq(bandMessageMentions.messageId, messageId));
  if (mentionUserIds.length === 0) return;
  await exec
    .insert(bandMessageMentions)
    .values(
      mentionUserIds.map((mentionedUserId) => ({ messageId, mentionedUserId })),
    )
    .onConflictDoNothing();
}

/** Post a message. `mentionIds` are filtered to actual band members. */
export async function createBandMessage(
  bandId: string,
  authorId: string,
  body: string,
  mentionIds: string[] = [],
): Promise<BandMessageDTO> {
  const validMentions = await membersAmong(bandId, mentionIds);
  const id = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(bandMessages)
      .values({ bandId, authorId, body })
      .returning({ id: bandMessages.id });
    await replaceMentions(tx, inserted!.id, validMentions);
    await tx.execute(sql`select pg_notify(${BAND_CHANNEL}, ${bandId})`);
    return inserted!.id;
  });
  return (await getMessage(id))!;
}

/**
 * Edit a message's body (author only). Replaces its mentions and stamps
 * `editedAt`. Returns the updated message, or null if it doesn't exist,
 * is deleted, or isn't the caller's.
 */
export async function editBandMessage(
  bandId: string,
  messageId: string,
  userId: string,
  body: string,
  mentionIds: string[] = [],
): Promise<BandMessageDTO | null> {
  if (!UUID_RE.test(messageId)) return null;
  const validMentions = await membersAmong(bandId, mentionIds);
  const ok = await db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(bandMessages)
      .set({ body, editedAt: now, updatedAt: now })
      .where(
        and(
          eq(bandMessages.id, messageId),
          eq(bandMessages.bandId, bandId),
          eq(bandMessages.authorId, userId),
          isNull(bandMessages.deletedAt),
        ),
      )
      .returning({ id: bandMessages.id });
    if (!row) return false;
    await replaceMentions(tx, messageId, validMentions);
    await tx.execute(sql`select pg_notify(${BAND_CHANNEL}, ${bandId})`);
    return true;
  });
  return ok ? getMessage(messageId) : null;
}

export interface BandChatUnread {
  count: number;
  mentioned: boolean;
}

/**
 * Unread summary for a user's view of a band's chat: how many messages
 * (from others) arrived since they last read, and whether any of those
 * mention them. Compared against the DB-clock `lastSeenAt`.
 */
export async function getBandChatUnread(
  bandId: string,
  userId: string,
): Promise<BandChatUnread> {
  const [seen] = await db
    .select({ lastSeenAt: bandChatReads.lastSeenAt })
    .from(bandChatReads)
    .where(
      and(eq(bandChatReads.userId, userId), eq(bandChatReads.bandId, bandId)),
    )
    .limit(1);
  const lastSeen = seen?.lastSeenAt ?? new Date(0);

  const unreadCondition = and(
    eq(bandMessages.bandId, bandId),
    isNull(bandMessages.deletedAt),
    gt(bandMessages.createdAt, lastSeen),
    sql`${bandMessages.authorId} <> ${userId}`,
  );

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bandMessages)
    .where(unreadCondition);
  const count = countRows[0]?.count ?? 0;

  const [mention] = await db
    .select({ id: bandMessages.id })
    .from(bandMessages)
    .innerJoin(
      bandMessageMentions,
      eq(bandMessageMentions.messageId, bandMessages.id),
    )
    .where(
      and(unreadCondition, eq(bandMessageMentions.mentionedUserId, userId)),
    )
    .limit(1);

  return { count, mentioned: Boolean(mention) };
}

/** Unread chat across every band the user belongs to. */
export interface ChatUnreadTotals {
  /** Messages from others, unread, summed over all their bands. */
  count: number;
  /** True when any unread message anywhere mentions them. */
  mentioned: boolean;
  /** The same, split per band — so a caller can point at where it is. */
  byBand: { bandId: string; count: number; mentioned: boolean }[];
}

/**
 * Every band's unread chat for one user, in a single grouped query.
 *
 * The per-band `getBandChatUnread` above answers "is there anything here?"
 * for a band already on screen. This answers "is there anything anywhere?",
 * which is what a badge in the global nav is actually claiming — asking the
 * other one per band would be a query per membership on every poll.
 *
 * Bands with nothing unread simply don't come back; the caller treats a
 * missing band as zero.
 */
export async function getChatUnreadForUser(
  userId: string,
): Promise<ChatUnreadTotals> {
  const rows = await db
    .select({
      bandId: bandMessages.bandId,
      /*
       * DISTINCT is belt-and-braces. The mentions join is filtered to this
       * user and (message_id, mentioned_user_id) is a primary key, so it can
       * match at most once per message today — but a plain count(*) would
       * silently start double-counting if that ever stopped being true.
       */
      count: sql<number>`count(distinct ${bandMessages.id})::int`,
      mentioned: sql<boolean>`bool_or(${bandMessageMentions.mentionedUserId} is not null)`,
    })
    .from(bandMessages)
    // Membership is the access check: a band the user isn't in can't
    // contribute rows, so this needs no separate guard.
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, bandMessages.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .leftJoin(
      bandChatReads,
      and(
        eq(bandChatReads.bandId, bandMessages.bandId),
        eq(bandChatReads.userId, userId),
      ),
    )
    .leftJoin(
      bandMessageMentions,
      and(
        eq(bandMessageMentions.messageId, bandMessages.id),
        eq(bandMessageMentions.mentionedUserId, userId),
      ),
    )
    .where(
      and(
        isNull(bandMessages.deletedAt),
        sql`${bandMessages.authorId} <> ${userId}`,
        // No read row yet means never opened, so everything counts.
        sql`${bandMessages.createdAt} > coalesce(${bandChatReads.lastSeenAt}, to_timestamp(0))`,
      ),
    )
    .groupBy(bandMessages.bandId);

  const byBand = rows.map((r) => ({
    bandId: r.bandId,
    count: r.count ?? 0,
    mentioned: Boolean(r.mentioned),
  }));
  return {
    count: byBand.reduce((n, b) => n + b.count, 0),
    mentioned: byBand.some((b) => b.mentioned),
    byBand,
  };
}

/** Mark a band's chat read as of now (clears the unread badge). */
export async function markBandChatRead(
  bandId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(bandChatReads)
    .values({ userId, bandId, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: [bandChatReads.userId, bandChatReads.bandId],
      set: { lastSeenAt: sql`now()` },
    });
}

/**
 * Soft-delete a message. Allowed for the author, or when `canModerate`
 * (band owner). Returns true if a row was deleted. UUID-guarded so a
 * malformed id misses instead of throwing.
 */
export async function deleteBandMessage(
  bandId: string,
  messageId: string,
  userId: string,
  canModerate: boolean,
): Promise<boolean> {
  if (!UUID_RE.test(messageId)) return false;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(bandMessages)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bandMessages.id, messageId),
          eq(bandMessages.bandId, bandId),
          isNull(bandMessages.deletedAt),
          canModerate ? undefined : eq(bandMessages.authorId, userId),
        ),
      )
      .returning({ id: bandMessages.id });
    if (!row) return false;
    await tx.execute(sql`select pg_notify(${BAND_CHANNEL}, ${bandId})`);
    return true;
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
