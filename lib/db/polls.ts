import { asc, eq } from 'drizzle-orm';
import { db } from './index';
import { pollOptions, polls } from './schema';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Poll {
  id: string;
  bandId: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string; // ISO 8601
  options: { id: string; text: string }[];
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

/** A poll with its options in order, or null if not found. */
export async function getPoll(pollId: string): Promise<Poll | null> {
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

  return {
    id: poll.id,
    bandId: poll.bandId,
    title: poll.title,
    description: poll.description,
    createdBy: poll.createdBy,
    createdAt: poll.createdAt.toISOString(),
    options,
  };
}
