import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { users } from '../../lib/db/schema';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import { upsertUser } from '../../lib/db/users';
import {
  createBandMessage,
  deleteBandMessage,
  editBandMessage,
  getBandChatUnread,
  listBandMessages,
  markBandChatRead,
} from '../../lib/db/band-messages';
import { closeNotifyHub } from '../../lib/db/notify';

after(async () => {
  await closeNotifyHub();
  await closeDb();
});

const SUBS = ['BM_OWNER', 'BM_MEMBER', 'BM_OUTSIDER'];

test('band-messages: post, list, pagination, delete permissions', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'BM_OWNER', email: 'bmo@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'BM_MEMBER', email: 'bmm@x.com', name: 'Member' });
    const band = await createBand(owner.id, 'BM Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');

    // Post messages (author info comes back joined).
    const m1 = await createBandMessage(band.id, owner.id, 'hello band');
    assert.equal(m1.body, 'hello band', 'body stored');
    assert.equal(m1.author.id, owner.id, 'author id');
    assert.equal(m1.author.name, 'Owner', 'author name joined');
    const m2 = await createBandMessage(band.id, member.id, 'hi there');
    const m3 = await createBandMessage(band.id, owner.id, 'third');

    // List: oldest → newest.
    const page = await listBandMessages(band.id);
    assert.deepEqual(
      page.messages.map((m) => m.id),
      [m1.id, m2.id, m3.id],
      'ascending order',
    );
    assert.equal(page.hasMore, false, 'no more with small history');

    // Pagination: limit + `before` cursor walks older.
    const newest = await listBandMessages(band.id, { limit: 2 });
    assert.deepEqual(
      newest.messages.map((m) => m.id),
      [m2.id, m3.id],
      'last 2 (ascending)',
    );
    assert.equal(newest.hasMore, true, 'older page exists');
    const older = await listBandMessages(band.id, {
      limit: 2,
      before: newest.messages[0]!.createdAt,
    });
    assert.deepEqual(older.messages.map((m) => m.id), [m1.id], 'the older page');
    assert.equal(older.hasMore, false, 'nothing older than the first');

    // Delete permissions:
    // - a non-author member cannot delete someone else's message
    assert.equal(
      await deleteBandMessage(band.id, m1.id, member.id, false),
      false,
      'non-author, non-moderator cannot delete',
    );
    // - the author can delete their own
    assert.equal(
      await deleteBandMessage(band.id, m2.id, member.id, false),
      true,
      'author deletes own',
    );
    // - a band owner (moderator) can delete anyone's
    assert.equal(
      await deleteBandMessage(band.id, m1.id, owner.id, true),
      true,
      'owner deletes any',
    );
    // - deleting an already-deleted / unknown message is a no-op
    assert.equal(await deleteBandMessage(band.id, m2.id, member.id, false), false, 'already deleted → false');
    assert.equal(await deleteBandMessage(band.id, 'not-a-uuid', owner.id, true), false, 'bad id → false');

    // Deleted messages drop out of the list.
    const remaining = await listBandMessages(band.id);
    assert.deepEqual(remaining.messages.map((m) => m.id), [m3.id], 'only the surviving message');
  } finally {
    if (bandId) await deleteBand(bandId);
    await db.delete(users).where(inArray(users.googleSub, SUBS));
  }
});

test('band-messages: mentions, editing, unread', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'BM_OWNER', email: 'bmo@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'BM_MEMBER', email: 'bmm@x.com', name: 'Member' });
    const outsider = await upsertUser({ googleSub: 'BM_OUTSIDER', email: 'bmx@x.com', name: 'Outsider' });
    const band = await createBand(owner.id, 'BM Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');

    // Mentions are filtered to real band members.
    const msg = await createBandMessage(band.id, member.id, 'hey @Owner and @Outsider', [
      owner.id,
      outsider.id,
    ]);
    assert.deepEqual(msg.mentions, [owner.id], 'only the member mention is kept');
    assert.equal(msg.editedAt, null, 'not edited yet');
    assert.deepEqual(
      (await listBandMessages(band.id)).messages[0]?.mentions,
      [owner.id],
      'mentions come back in the list',
    );

    // Edit: author only; replaces body + mentions, stamps editedAt.
    const edited = await editBandMessage(band.id, msg.id, member.id, 'actually @Owner', [owner.id]);
    assert.ok(edited, 'author edit succeeds');
    assert.equal(edited!.body, 'actually @Owner', 'body updated');
    assert.ok(edited!.editedAt, 'editedAt stamped');
    assert.equal(
      await editBandMessage(band.id, msg.id, owner.id, 'nope', []),
      null,
      'non-author cannot edit',
    );

    // Unread: owner has one unread (from member), and is mentioned.
    let unread = await getBandChatUnread(band.id, owner.id);
    assert.equal(unread.count, 1, 'owner has one unread');
    assert.equal(unread.mentioned, true, 'owner is mentioned');
    // Author doesn't count their own message as unread.
    assert.equal((await getBandChatUnread(band.id, member.id)).count, 0, 'own message not unread');

    // Marking read clears it.
    await markBandChatRead(band.id, owner.id);
    unread = await getBandChatUnread(band.id, owner.id);
    assert.equal(unread.count, 0, 'read clears count');
    assert.equal(unread.mentioned, false, 'read clears mention flag');

    // A new message after reading is unread again (but not the mention).
    await createBandMessage(band.id, member.id, 'ping', []);
    const after = await getBandChatUnread(band.id, owner.id);
    assert.equal(after.count, 1, 'new message is unread');
    assert.equal(after.mentioned, false, 'no new mention');
  } finally {
    if (bandId) await deleteBand(bandId);
    await db.delete(users).where(inArray(users.googleSub, SUBS));
  }
});

test('band-messages: scoped to their band', async () => {
  let bandA: string | undefined;
  let bandB: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'BM_OWNER', email: 'bmo@x.com', name: 'Owner' });
    const a = await createBand(owner.id, 'Band A');
    const b = await createBand(owner.id, 'Band B');
    bandA = a.id;
    bandB = b.id;
    await createBandMessage(a.id, owner.id, 'in A');
    await createBandMessage(b.id, owner.id, 'in B');

    const pa = await listBandMessages(a.id);
    const pb = await listBandMessages(b.id);
    assert.deepEqual(pa.messages.map((m) => m.body), ['in A'], 'A sees only A');
    assert.deepEqual(pb.messages.map((m) => m.body), ['in B'], 'B sees only B');
  } finally {
    if (bandA) await deleteBand(bandA);
    if (bandB) await deleteBand(bandB);
    await db.delete(users).where(eq(users.googleSub, 'BM_OWNER'));
  }
});
