import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import {
  bandMembers,
  bands,
  conversations,
  notes,
  users,
  userNotes,
} from '../../lib/db/schema';
import { createBand } from '../../lib/db/bands';
import { upsertUser } from '../../lib/db/users';
import {
  confirmableEmails,
  deleteAccount,
  planAccountDeletion,
} from '../../lib/db/account-deletion';

after(closeDb);

test('account deletion: sole-owner bands go, co-owned bands stay, comments persist', async () => {
  const stamp = Date.now();
  const leaver = await upsertUser({
    googleSub: `ACCT_DEL_A_${stamp}`,
    email: `acctdel-a-${stamp}@example.com`,
    name: 'Leaver',
  });
  const other = await upsertUser({
    googleSub: `ACCT_DEL_B_${stamp}`,
    email: `acctdel-b-${stamp}@example.com`,
    name: 'Other',
  });

  // Sole-owned (with another member), co-owned, and one they're only in.
  const solo = await createBand(leaver.id, `AcctDel solo ${stamp}`);
  await db
    .insert(bandMembers)
    .values({ bandId: solo.id, userId: other.id, role: 'member' });
  const shared = await createBand(leaver.id, `AcctDel shared ${stamp}`);
  await db
    .insert(bandMembers)
    .values({ bandId: shared.id, userId: other.id, role: 'owner' });
  const guest = await createBand(other.id, `AcctDel guest ${stamp}`);
  await db
    .insert(bandMembers)
    .values({ bandId: guest.id, userId: leaver.id, role: 'member' });

  const [conv] = await db
    .insert(conversations)
    .values({
      bandId: shared.id,
      driveAudioFileId: `acctdel-${stamp}`,
      audioFileName: 'Song.mp3',
    })
    .returning({ id: conversations.id });
  await db.insert(notes).values([
    {
      conversationId: conv!.id,
      authorId: leaver.id,
      timestampMs: 1000,
      body: 'from leaver',
    },
    {
      conversationId: conv!.id,
      authorId: other.id,
      timestampMs: 2000,
      body: 'from other',
    },
  ]);
  await db
    .insert(userNotes)
    .values({ bandId: shared.id, authorId: leaver.id, title: 'personal' });

  try {
    // The plan drives the confirmation copy, so it has to be right too — this
    // is the classification that a correlated subquery originally got wrong.
    const plan = await planAccountDeletion(leaver.id);
    assert.deepEqual(
      plan.bandsDeleted.map((b) => b.id),
      [solo.id],
      'only the sole-owned band is slated for deletion',
    );
    assert.equal(plan.bandsLeft.length, 2, 'the other two are only left');
    assert.equal(plan.personalNotesDeleted, 1);

    assert.deepEqual(await confirmableEmails(leaver.id), [
      `acctdel-a-${stamp}@example.com`,
      `acctdel-a-${stamp}@example.com`, // login + linked Google, same address
    ]);

    await deleteAccount(leaver.id);

    const n = async (
      table:
        | typeof bands
        | typeof bandMembers
        | typeof userNotes
        | typeof notes,
      where: ReturnType<typeof eq>,
    ) =>
      (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(table)
          .where(where)
      )[0]!.n;

    assert.equal(
      await n(bands, eq(bands.id, solo.id)),
      0,
      'sole-owned band deleted even though it had another member',
    );
    assert.equal(await n(bands, eq(bands.id, shared.id)), 1, 'co-owned stays');
    assert.equal(await n(bands, eq(bands.id, guest.id)), 1, 'guest band stays');

    assert.equal(
      await n(notes, eq(notes.conversationId, conv!.id)),
      2,
      'song comments survive, including the deleted user’s',
    );
    assert.equal(
      await n(userNotes, eq(userNotes.authorId, leaver.id)),
      0,
      'personal notes are deleted',
    );
    assert.equal(
      await n(bandMembers, eq(bandMembers.userId, leaver.id)),
      0,
      'memberships are gone',
    );

    const [tomb] = await db.select().from(users).where(eq(users.id, leaver.id));
    assert.equal(tomb!.name, 'Deleted account', 'author reads as deleted');
    assert.equal(tomb!.email, null, 'email scrubbed');
    assert.equal(tomb!.passwordHash, null, 'password scrubbed');
    assert.ok(tomb!.deletedAt, 'deletedAt stamped');
    assert.deepEqual(
      await confirmableEmails(leaver.id),
      [],
      'nothing left to confirm against',
    );

    const [survivor] = await db
      .select()
      .from(users)
      .where(eq(users.id, other.id));
    assert.ok(survivor!.email, 'the co-owner is untouched');
  } finally {
    await db.delete(bands).where(eq(bands.id, shared.id));
    await db.delete(bands).where(eq(bands.id, guest.id));
    await db.delete(bands).where(eq(bands.id, solo.id));
    await db.delete(users).where(eq(users.id, other.id));
    await db.delete(users).where(eq(users.id, leaver.id));
  }
});
