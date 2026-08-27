import { and, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import {
  activityLog,
  bandMembers,
  bands,
  conversationReads,
  conversations,
  noteMentions,
  notes,
  users,
} from './schema';

/**
 * Cross-band listing + per-user read state (Phase 5).
 *
 * Replaces the Drive-era `listAnnotatedFiles` / `listMentionsOfUser` /
 * client-side seen-cache with indexed SQL:
 *   - "Open Conversations" = conversations in the bands you belong to,
 *     filtered by closed state (membership IS the access scope now, so
 *     there's no participation-scope gap — a mention reaches you even in
 *     a conversation you haven't posted in, as long as you're in the band).
 *   - Badges are computed server-side against `conversation_reads`, so
 *     "new"/"mentioned" state is cross-device (no more IndexedDB).
 */

export type ConversationFilter = 'open' | 'closed' | 'all';

export interface ConversationListItem {
  conversationId: string;
  bandId: string;
  bandName: string;
  driveAudioFileId: string;
  audioFileName: string | null;
  closed: boolean;
  lastActivityAt: string; // ISO (conversation.updatedAt)
  lastActivityBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  mentionedAt: string | null; // ISO; most recent mention of the user
  lastSeenAt: string | null; // ISO
  /** Activity since last seen, not authored by the user. */
  unread: boolean;
  /** Mentioned since last seen. */
  mentioned: boolean;
}

export async function listConversationsForUser(
  userId: string,
  filter: ConversationFilter = 'open',
  /**
   * Optional window over the result. Applied to the base query, so the
   * follow-up lookups (actors, mentions) only cover the page. Omitted means
   * the whole list, which is what the Open Conversations view wants.
   */
  window?: { limit: number; offset: number },
  /**
   * Narrow to a single band. The membership join below is what grants access,
   * so this only ever subtracts from what the user could already see — a band
   * they aren't in simply matches nothing.
   */
  bandId?: string,
): Promise<ConversationListItem[]> {
  const closedFilter =
    filter === 'open'
      ? eq(conversations.closed, false)
      : filter === 'closed'
        ? eq(conversations.closed, true)
        : undefined;
  // Archived songs drop out of the open list (they live under the band's
  // "Archived Audio" section instead).
  const archivedFilter =
    filter === 'open' ? eq(conversations.archived, false) : undefined;

  // Only surface songs that are actually conversations — i.e. have at least
  // one (non-deleted) comment. A freshly uploaded song with no notes isn't a
  // conversation and would just clutter the list.
  const hasComment = exists(
    db
      .select({ one: sql`1` })
      .from(notes)
      .where(
        and(
          eq(notes.conversationId, conversations.id),
          isNull(notes.deletedAt),
        ),
      ),
  );

  // Base rows: conversations in the user's bands (+ my read marker).
  const base = await db
    .select({
      conversationId: conversations.id,
      bandId: conversations.bandId,
      bandName: bands.name,
      driveAudioFileId: conversations.driveAudioFileId,
      audioFileName: conversations.audioFileName,
      closed: conversations.closed,
      updatedAt: conversations.updatedAt,
      lastSeenAt: conversationReads.lastSeenAt,
    })
    .from(conversations)
    .innerJoin(bands, eq(bands.id, conversations.bandId))
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, conversations.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .leftJoin(
      conversationReads,
      and(
        eq(conversationReads.conversationId, conversations.id),
        eq(conversationReads.userId, userId),
      ),
    )
    .where(
      and(
        closedFilter,
        archivedFilter,
        hasComment,
        bandId ? eq(conversations.bandId, bandId) : undefined,
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(window ? window.limit : Number.MAX_SAFE_INTEGER)
    .offset(window ? window.offset : 0);

  if (base.length === 0) return [];
  const ids = base.map((b) => b.conversationId);

  // Latest activity actor per conversation (one row each via DISTINCT ON).
  const acts = await db
    .selectDistinctOn([activityLog.conversationId], {
      conversationId: activityLog.conversationId,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.actorId))
    .where(inArray(activityLog.conversationId, ids))
    .orderBy(activityLog.conversationId, desc(activityLog.createdAt));
  const actByConv = new Map(acts.map((a) => [a.conversationId, a]));

  // Most recent mention of this user per conversation.
  const mentionRows = await db
    .select({ conversationId: notes.conversationId, at: notes.createdAt })
    .from(noteMentions)
    .innerJoin(notes, eq(notes.id, noteMentions.noteId))
    .where(
      and(
        eq(noteMentions.mentionedUserId, userId),
        inArray(notes.conversationId, ids),
        isNull(notes.deletedAt),
      ),
    );
  const mentionByConv = new Map<string, Date>();
  for (const r of mentionRows) {
    const prev = mentionByConv.get(r.conversationId);
    if (!prev || r.at > prev) mentionByConv.set(r.conversationId, r.at);
  }

  return base.map((b) => {
    const act = actByConv.get(b.conversationId) ?? null;
    const mentionedAt = mentionByConv.get(b.conversationId) ?? null;
    const lastSeenMs = b.lastSeenAt ? b.lastSeenAt.getTime() : 0;
    const lastActMs = b.updatedAt.getTime();
    const mentionedMs = mentionedAt ? mentionedAt.getTime() : -1;
    const byMe = act?.actorId === userId;

    return {
      conversationId: b.conversationId,
      bandId: b.bandId,
      bandName: b.bandName,
      driveAudioFileId: b.driveAudioFileId,
      audioFileName: b.audioFileName,
      closed: b.closed,
      lastActivityAt: b.updatedAt.toISOString(),
      lastActivityBy: act
        ? { id: act.actorId, name: act.actorName, email: act.actorEmail }
        : null,
      mentionedAt: mentionedAt ? mentionedAt.toISOString() : null,
      lastSeenAt: b.lastSeenAt ? b.lastSeenAt.toISOString() : null,
      // Your own activity never counts as "new" to you.
      unread: lastActMs > lastSeenMs && !byMe,
      mentioned: mentionedMs > lastSeenMs,
    };
  });
}

/**
 * Mark a conversation seen for the user as of now (clears its badges).
 *
 * Uses the DB clock (`now()`), not the app server's, so `lastSeenAt` is
 * directly comparable to the DB-stamped activity/mention timestamps it's
 * checked against in `listConversationsForUser`. Mixing an app-clock
 * `new Date()` here with DB-clock `now()` there let clock skew between the
 * app server and Postgres make just-read items wrongly (un)flag.
 */
export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<void> {
  await db
    .insert(conversationReads)
    .values({ userId, conversationId, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: [conversationReads.userId, conversationReads.conversationId],
      set: { lastSeenAt: sql`now()` },
    });
}
