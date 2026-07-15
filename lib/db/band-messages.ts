import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from './index';
import { bandMessages, users } from './schema';
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
  author: { id: string; name: string | null; email: string | null };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const SELECT = {
  id: bandMessages.id,
  body: bandMessages.body,
  createdAt: bandMessages.createdAt,
  authorId: users.id,
  authorName: users.name,
  authorEmail: users.email,
} as const;

type Row = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string | null;
  authorEmail: string | null;
};

function toDTO(r: Row): BandMessageDTO {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    author: { id: r.authorId, name: r.authorName, email: r.authorEmail },
  };
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
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { messages: page.reverse().map(toDTO), hasMore };
}

async function getMessage(id: string): Promise<BandMessageDTO | null> {
  const [row] = await db
    .select(SELECT)
    .from(bandMessages)
    .innerJoin(users, eq(users.id, bandMessages.authorId))
    .where(eq(bandMessages.id, id))
    .limit(1);
  return row ? toDTO(row) : null;
}

/** Post a message. Returns the stored message (with author info). */
export async function createBandMessage(
  bandId: string,
  authorId: string,
  body: string,
): Promise<BandMessageDTO> {
  const id = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(bandMessages)
      .values({ bandId, authorId, body })
      .returning({ id: bandMessages.id });
    await tx.execute(sql`select pg_notify(${BAND_CHANNEL}, ${bandId})`);
    return inserted!.id;
  });
  // Re-read with the author join for a uniform DTO.
  return (await getMessage(id))!;
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
