import { and, desc, eq } from 'drizzle-orm';
import { db, type DbExecutor } from './index';
import { bandMembers, conversations } from './schema';
import { recordActivity } from './activity';

/**
 * Conversation lifecycle + membership (Postgres).
 *
 * A conversation is one row per (band, Drive audio file). "Registering"
 * an audio file under a band is just find-or-create. Authorization flows
 * through the owning band: you can touch a conversation iff you're a
 * member of its band (`getConversationMembership` joins through band_id).
 */

export type Conversation = typeof conversations.$inferSelect;
export type BandRole = (typeof bandMembers.role.enumValues)[number];

export class ConversationAccessError extends Error {
  constructor(message = 'Not a member of this conversation’s band') {
    super(message);
    this.name = 'ConversationAccessError';
  }
}

/** Find or create the conversation for a (band, audio file) pair. */
export async function findOrCreateConversation(
  bandId: string,
  driveAudioFileId: string,
  audioFileName: string | null,
  exec: DbExecutor = db,
): Promise<Conversation> {
  await exec
    .insert(conversations)
    .values({ bandId, driveAudioFileId, audioFileName })
    .onConflictDoNothing({
      target: [conversations.bandId, conversations.driveAudioFileId],
    });

  const [row] = await exec
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.bandId, bandId),
        eq(conversations.driveAudioFileId, driveAudioFileId),
      ),
    )
    .limit(1);
  return row!;
}

export async function getConversationById(
  conversationId: string,
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row ?? null;
}

export interface ConversationMembership {
  conversation: Conversation;
  role: BandRole;
}

/**
 * Resolve the requesting user's access to a conversation by joining
 * through the owning band's membership. Null if the conversation doesn't
 * exist or the user isn't in its band.
 */
export async function getConversationMembership(
  userId: string,
  conversationId: string,
): Promise<ConversationMembership | null> {
  const [row] = await db
    .select({ conversation: conversations, role: bandMembers.role })
    .from(conversations)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, conversations.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row ?? null;
}

/** Authorization primitive — throws if the user can't access it. */
export async function assertConversationMember(
  userId: string,
  conversationId: string,
): Promise<ConversationMembership> {
  const m = await getConversationMembership(userId, conversationId);
  if (!m) throw new ConversationAccessError();
  return m;
}

/**
 * True if the user may access a Drive audio file: i.e. some band they
 * belong to owns a conversation registered to that file. This is the
 * authorization boundary for the streaming proxy now that the service
 * account can read files regardless of the user's personal Drive ACL.
 */
export async function userCanAccessAudio(
  userId: string,
  driveAudioFileId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      bandMembers,
      and(
        eq(bandMembers.bandId, conversations.bandId),
        eq(bandMembers.userId, userId),
      ),
    )
    .where(eq(conversations.driveAudioFileId, driveAudioFileId))
    .limit(1);
  return Boolean(row);
}

export async function listBandConversations(
  bandId: string,
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.bandId, bandId))
    .orderBy(desc(conversations.updatedAt));
}

/** Bump a conversation's updated_at (its "last activity" sort key). */
export async function touchConversation(
  exec: DbExecutor,
  conversationId: string,
): Promise<void> {
  await exec
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/**
 * Open/close a conversation. Idempotent; only logs activity when the
 * state actually flips.
 */
export async function setConversationClosed(
  conversationId: string,
  actorId: string,
  closed: boolean,
): Promise<{ closed: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ closed: conversations.closed })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!current) throw new ConversationAccessError('Conversation not found');
    if (current.closed === closed) return { closed };

    await tx
      .update(conversations)
      .set({ closed, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await recordActivity(
      tx,
      conversationId,
      actorId,
      closed ? 'closed' : 'reopened',
    );
    return { closed };
  });
}
