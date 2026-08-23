import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './index';
import { deleteBand } from './bands';
import {
  accounts,
  bandChatReads,
  bandMembers,
  bandMessageMentions,
  bands,
  calendarFeeds,
  conversationReads,
  eventMembers,
  noteMentions,
  notificationMutes,
  notificationReads,
  notifications,
  passwordResetTokens,
  pollVotes,
  pushMutes,
  pushSubscriptions,
  sheetVersionPrefs,
  userNotes,
  users,
} from './schema';

/**
 * Deleting a user account.
 *
 * The row itself survives as a tombstone, scrubbed of everything personal.
 * That's deliberate: song comments, band chat, and a conversation's activity
 * log all reference their author and are meant to outlive the account — a band
 * shouldn't lose the discussion on a song because someone left. Eight of those
 * foreign keys are `NO ACTION` on a non-null column, so an actual `DELETE`
 * would fail anyway; nulling them all out would mean making them nullable and
 * teaching every read path about it.
 *
 * What's left afterwards carries no personal data: a uuid, the name "Deleted
 * account", and a `deletedAt` stamp. Email, password, linked Google account,
 * push subscriptions, and calendar feed are all gone, so the person can sign
 * up again from scratch and won't be recognised as the same user.
 */

/** How a deleted author reads everywhere `actorLabel` renders a name. */
export const DELETED_ACCOUNT_NAME = 'Deleted account';

export interface AccountDeletionPlan {
  /** Bands deleted outright — the user was their only owner. */
  bandsDeleted: { id: string; name: string }[];
  /** Bands they simply left, because someone else owns them too. */
  bandsLeft: { id: string; name: string }[];
  personalNotesDeleted: number;
}

/**
 * What deleting this account would do, without doing it. Drives the
 * confirmation copy so nobody is surprised by which bands disappear.
 */
export async function planAccountDeletion(
  userId: string,
): Promise<AccountDeletionPlan> {
  const memberships = await db
    .select({
      bandId: bandMembers.bandId,
      role: bandMembers.role,
      name: bands.name,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .where(eq(bandMembers.userId, userId));

  // Owner counts as a separate grouped query rather than a correlated
  // subquery: a hand-written one referencing the outer table doesn't scope the
  // way it looks like it should, and silently counted every owner row in the
  // table instead of the band's — which classified sole-owner bands as
  // co-owned and left them undeleted.
  const bandIds = memberships.map((m) => m.bandId);
  const ownerCounts = new Map<string, number>();
  if (bandIds.length > 0) {
    const rows = await db
      .select({
        bandId: bandMembers.bandId,
        owners: sql<number>`count(*)::int`,
      })
      .from(bandMembers)
      .where(
        and(
          inArray(bandMembers.bandId, bandIds),
          eq(bandMembers.role, 'owner'),
        ),
      )
      .groupBy(bandMembers.bandId);
    for (const r of rows) ownerCounts.set(r.bandId, r.owners);
  }

  const bandsDeleted: { id: string; name: string }[] = [];
  const bandsLeft: { id: string; name: string }[] = [];
  for (const m of memberships) {
    // Sole owner → the band goes with them, other members and all. Anything
    // else (co-owned, or they're only a member) → they just leave.
    const owners = ownerCounts.get(m.bandId) ?? 0;
    if (m.role === 'owner' && owners <= 1) {
      bandsDeleted.push({ id: m.bandId, name: m.name });
    } else {
      bandsLeft.push({ id: m.bandId, name: m.name });
    }
  }

  const [noteCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userNotes)
    .where(eq(userNotes.authorId, userId));

  return {
    bandsDeleted,
    bandsLeft,
    personalNotesDeleted: noteCount?.n ?? 0,
  };
}

/**
 * Delete the account. Returns what was done, for logging and the confirmation
 * screen.
 *
 * Bands the user solely owns are deleted whole — including their songs, files,
 * and object-storage contents — even if other people are members, because a
 * band with no owner has nobody who can administer it. Bands with another
 * owner keep everything shared; only what belongs to this user personally goes
 * (their own notes, votes, read state, preferences).
 */
export async function deleteAccount(
  userId: string,
): Promise<AccountDeletionPlan> {
  const plan = await planAccountDeletion(userId);

  // Outside the transaction below: each of these also clears object storage,
  // which isn't transactional, and doing it first means a failure part-way
  // leaves the account intact rather than half-erased.
  for (const band of plan.bandsDeleted) {
    await deleteBand(band.id);
  }

  await db.transaction(async (tx) => {
    // Things that are only ever this person's. Most would cascade if the row
    // were being deleted; it isn't, so they're removed explicitly.
    await tx.delete(userNotes).where(eq(userNotes.authorId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    await tx
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    await tx.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId));
    await tx.delete(pollVotes).where(eq(pollVotes.userId, userId));
    await tx.delete(eventMembers).where(eq(eventMembers.userId, userId));
    await tx
      .delete(conversationReads)
      .where(eq(conversationReads.userId, userId));
    await tx
      .delete(sheetVersionPrefs)
      .where(eq(sheetVersionPrefs.userId, userId));
    await tx
      .delete(notificationReads)
      .where(eq(notificationReads.userId, userId));
    await tx
      .delete(notificationMutes)
      .where(eq(notificationMutes.userId, userId));
    await tx.delete(pushMutes).where(eq(pushMutes.userId, userId));
    await tx.delete(bandChatReads).where(eq(bandChatReads.userId, userId));
    // Mentions *of* this user: the message text keeps whatever it said, but
    // there's no longer anyone to notify.
    await tx
      .delete(noteMentions)
      .where(eq(noteMentions.mentionedUserId, userId));
    await tx
      .delete(bandMessageMentions)
      .where(eq(bandMessageMentions.mentionedUserId, userId));
    // Feed entries about things they did. These are transient notices, not
    // history — the activity log keeps the durable record.
    await tx.delete(notifications).where(eq(notifications.actorId, userId));

    // Any remaining membership (bands someone else also owns).
    await tx.delete(bandMembers).where(eq(bandMembers.userId, userId));

    // Finally, strip the row itself. `email` goes to null rather than a
    // placeholder so it can't collide with the unique index, and so the
    // address is free to sign up again.
    await tx
      .update(users)
      .set({
        email: null,
        passwordHash: null,
        name: DELETED_ACCOUNT_NAME,
        deletedAt: sql`now()`,
      })
      .where(eq(users.id, userId));
  });

  return plan;
}

/**
 * The addresses that count as confirmation for this account: the login email
 * and any linked provider's. Compared case-insensitively by the caller.
 */
export async function confirmableEmails(userId: string): Promise<string[]> {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const linked = await db
    .select({ email: accounts.email })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return [user?.email, ...linked.map((a) => a.email)]
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => e.trim().toLowerCase());
}
