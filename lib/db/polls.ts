import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { db } from './index';
import { bandMembers, bands, pollOptions, pollVotes, polls } from './schema';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Poll {
  id: string;
  bandId: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string; // ISO 8601
  /** True once the poll is closed (voting stopped; kept for history). */
  closed: boolean;
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  /** The viewer's chosen option id, or null (also null when no viewer). */
  myVote: string | null;
}

export interface PollSummary {
  id: string;
  title: string;
  createdAt: string; // ISO 8601
  closed: boolean;
}

export interface OpenPoll {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  description: string | null;
}

/**
 * Open polls across the user's bands that they haven't voted in yet, newest
 * first. Closed polls are excluded (a left join to the user's vote, filtered
 * to rows with no vote and not closed).
 */
export async function listOpenPollsForUser(
  userId: string,
): Promise<OpenPoll[]> {
  const rows = await db
    .select({
      id: polls.id,
      bandId: polls.bandId,
      bandName: bands.name,
      title: polls.title,
      description: polls.description,
    })
    .from(polls)
    .innerJoin(
      bandMembers,
      and(eq(bandMembers.bandId, polls.bandId), eq(bandMembers.userId, userId)),
    )
    .innerJoin(bands, eq(bands.id, polls.bandId))
    .leftJoin(
      pollVotes,
      and(eq(pollVotes.pollId, polls.id), eq(pollVotes.userId, userId)),
    )
    .where(and(isNull(pollVotes.id), isNull(polls.closedAt)))
    .orderBy(desc(polls.createdAt));
  return rows;
}

export interface ClosedPoll {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  description: string | null;
  closedAt: string;
  /** Whether this user voted before it closed. */
  voted: boolean;
}

/**
 * Closed polls across the user's bands, most recently closed first — the
 * History page's record of decisions already made. Unlike
 * `listOpenPollsForUser`, this doesn't filter by whether they voted; it
 * reports it instead, since a poll you missed is exactly what you'd come
 * here to check.
 */
export async function listClosedPollsForUser(
  userId: string,
  window?: { limit: number; offset: number },
  /** Narrow to one band; the membership join still decides access. */
  bandId?: string,
): Promise<ClosedPoll[]> {
  const rows = await db
    .select({
      id: polls.id,
      bandId: polls.bandId,
      bandName: bands.name,
      title: polls.title,
      description: polls.description,
      closedAt: polls.closedAt,
      votedId: pollVotes.id,
    })
    .from(polls)
    .innerJoin(
      bandMembers,
      and(eq(bandMembers.bandId, polls.bandId), eq(bandMembers.userId, userId)),
    )
    .innerJoin(bands, eq(bands.id, polls.bandId))
    .leftJoin(
      pollVotes,
      and(eq(pollVotes.pollId, polls.id), eq(pollVotes.userId, userId)),
    )
    .where(
      and(
        isNotNull(polls.closedAt),
        bandId ? eq(polls.bandId, bandId) : undefined,
      ),
    )
    .orderBy(desc(polls.closedAt))
    .limit(window ? window.limit : Number.MAX_SAFE_INTEGER)
    .offset(window ? window.offset : 0);

  return rows.map((r) => ({
    id: r.id,
    bandId: r.bandId,
    bandName: r.bandName,
    title: r.title,
    description: r.description,
    closedAt: r.closedAt!.toISOString(),
    voted: r.votedId !== null,
  }));
}

/** The band's polls, newest first (open and closed). */
export async function listBandPolls(bandId: string): Promise<PollSummary[]> {
  const rows = await db
    .select({
      id: polls.id,
      title: polls.title,
      createdAt: polls.createdAt,
      closedAt: polls.closedAt,
    })
    .from(polls)
    .where(eq(polls.bandId, bandId))
    .orderBy(desc(polls.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    closed: r.closedAt !== null,
  }));
}

/**
 * Create a poll with its options (positions follow the array order). Returns
 * the new poll's id and title (enough for the triggering notification).
 */
export async function createPoll(input: {
  bandId: string;
  createdBy: string;
  title: string;
  description: string | null;
  options: string[];
}): Promise<{ id: string; title: string }> {
  const [poll] = await db
    .insert(polls)
    .values({
      bandId: input.bandId,
      createdBy: input.createdBy,
      title: input.title,
      description: input.description,
    })
    .returning({ id: polls.id, title: polls.title });
  if (!poll) throw new Error('poll insert failed');

  if (input.options.length > 0) {
    await db.insert(pollOptions).values(
      input.options.map((text, i) => ({
        pollId: poll.id,
        text,
        position: i,
      })),
    );
  }
  return poll;
}

/**
 * A poll with its options (in order), per-option vote counts, the total, and
 * the viewer's current vote. Returns null if not found.
 */
export async function getPoll(
  pollId: string,
  viewerId?: string,
): Promise<Poll | null> {
  if (!UUID_RE.test(pollId)) return null;
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  if (!poll) return null;

  const options = await db
    .select({ id: pollOptions.id, text: pollOptions.text })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(asc(pollOptions.position));

  const votes = await db
    .select({ optionId: pollVotes.optionId, userId: pollVotes.userId })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId));

  const counts = new Map<string, number>();
  let myVote: string | null = null;
  for (const v of votes) {
    counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
    if (viewerId && v.userId === viewerId) myVote = v.optionId;
  }

  return {
    id: poll.id,
    bandId: poll.bandId,
    title: poll.title,
    description: poll.description,
    createdBy: poll.createdBy,
    createdAt: poll.createdAt.toISOString(),
    closed: poll.closedAt !== null,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: counts.get(o.id) ?? 0,
    })),
    totalVotes: votes.length,
    myVote,
  };
}

/**
 * True when every current member of `bandId` has voted in the poll — used to
 * auto-close a poll once participation is complete. Only votes from current
 * members count; a band with no members is never "complete".
 */
export async function allMembersVoted(
  pollId: string,
  bandId: string,
): Promise<boolean> {
  const [members] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bandMembers)
    .where(eq(bandMembers.bandId, bandId));
  const memberCount = members?.count ?? 0;
  if (memberCount === 0) return false;

  const [voted] = await db
    .select({ count: sql<number>`count(distinct ${pollVotes.userId})::int` })
    .from(pollVotes)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.userId, pollVotes.userId),
        eq(bandMembers.bandId, bandId),
      ),
    )
    .where(eq(pollVotes.pollId, pollId));
  return (voted?.count ?? 0) >= memberCount;
}

/** Close a poll: stop voting, keep it (and its votes) for history. */
export async function closePoll(pollId: string): Promise<void> {
  await db
    .update(polls)
    .set({ closedAt: new Date() })
    .where(and(eq(polls.id, pollId), isNull(polls.closedAt)));
}

/**
 * Update a poll's title/description and reconcile its options: existing
 * options (matched by id) are renamed/reordered in place, new ones inserted,
 * and any dropped from the list deleted (cascading their votes).
 *
 * When `resetVotes` is set, all of the poll's votes are cleared — used when
 * the content changed, so the poll starts fresh (see the PATCH route).
 */
export async function updatePoll(input: {
  pollId: string;
  title: string;
  description: string | null;
  options: { id?: string; text: string }[];
  resetVotes: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(polls)
      .set({ title: input.title, description: input.description })
      .where(eq(polls.id, input.pollId));

    const existing = await tx
      .select({ id: pollOptions.id })
      .from(pollOptions)
      .where(eq(pollOptions.pollId, input.pollId));
    const existingIds = new Set(existing.map((o) => o.id));
    const keptIds = new Set(
      input.options
        .map((o) => o.id)
        .filter((id): id is string => !!id && existingIds.has(id)),
    );

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    if (toDelete.length > 0) {
      await tx.delete(pollOptions).where(inArray(pollOptions.id, toDelete));
    }

    for (let i = 0; i < input.options.length; i++) {
      const o = input.options[i]!;
      if (o.id && existingIds.has(o.id)) {
        await tx
          .update(pollOptions)
          .set({ text: o.text, position: i })
          .where(eq(pollOptions.id, o.id));
      } else {
        await tx
          .insert(pollOptions)
          .values({ pollId: input.pollId, text: o.text, position: i });
      }
    }

    if (input.resetVotes) {
      await tx.delete(pollVotes).where(eq(pollVotes.pollId, input.pollId));
    }
  });
}

/** Delete a poll (cascades its options and votes). */
export async function deletePoll(pollId: string): Promise<void> {
  await db.delete(polls).where(eq(polls.id, pollId));
}

/**
 * Cast (or change) a user's vote in a poll. The option must belong to the
 * poll; one vote per (poll, user) — a re-vote updates the chosen option.
 * Returns false if the option isn't part of the poll.
 */
export async function castVote(input: {
  pollId: string;
  optionId: string;
  userId: string;
}): Promise<boolean> {
  if (!UUID_RE.test(input.pollId) || !UUID_RE.test(input.optionId)) {
    return false;
  }
  const [opt] = await db
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(
      and(
        eq(pollOptions.id, input.optionId),
        eq(pollOptions.pollId, input.pollId),
      ),
    )
    .limit(1);
  if (!opt) return false;

  await db
    .insert(pollVotes)
    .values({
      pollId: input.pollId,
      optionId: input.optionId,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: [pollVotes.pollId, pollVotes.userId],
      set: { optionId: input.optionId },
    });
  return true;
}
