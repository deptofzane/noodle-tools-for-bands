import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand } from '../../lib/db/bands';
import {
  findOrCreateConversation,
  setConversationClosed,
} from '../../lib/db/conversations';
import { createNote } from '../../lib/db/notes';
import {
  listConversationsForUser,
  markConversationRead,
} from '../../lib/db/listing';

after(closeDb);

const find = <T extends { conversationId: string }>(rows: T[], id: string) =>
  rows.find((r) => r.conversationId === id);

test('listing: mention reach, unread vs self, badges clear on read', async () => {
  const subs = ['L_OWNER', 'L_MEMBER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'L_OWNER',
      email: 'o@x.com',
      name: 'Owner',
    });
    const member = await upsertUser({
      googleSub: 'L_MEMBER',
      email: 'm@x.com',
      name: 'Member',
    });
    const band = await createBand(owner.id, 'List Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');
    const conv = await findOrCreateConversation(band.id, 'driveL', 'Track.mp3');

    // member posts, mentioning owner — owner never posts here (mention reach)
    await createNote(conv.id, member.id, 0, 'hey @Owner', [owner.id]);

    let ownerList = await listConversationsForUser(owner.id, 'open');
    let it = find(ownerList, conv.id);
    assert.ok(it, 'owner sees a conversation via membership without posting');
    assert.equal(it?.unread, true, 'owner unread (activity by member)');
    assert.equal(it?.mentioned, true, 'owner mentioned');
    assert.equal(it?.lastActivityBy?.id, member.id, 'last activity by member');

    const memberList = await listConversationsForUser(member.id, 'open');
    const mit = find(memberList, conv.id);
    assert.equal(mit?.unread, false, 'member not unread on own activity');
    assert.equal(mit?.mentioned, false, 'member not mentioned');

    await markConversationRead(owner.id, conv.id);
    it = find(await listConversationsForUser(owner.id, 'open'), conv.id);
    assert.ok(it && !it.unread && !it.mentioned, 'badges clear after read');

    await createNote(conv.id, member.id, 5, 'again @Owner', [owner.id]);
    it = find(await listConversationsForUser(owner.id, 'open'), conv.id);
    assert.ok(it?.unread && it?.mentioned, 'a new mention re-flags after read');

    await setConversationClosed(conv.id, owner.id, true);
    assert.ok(
      !find(await listConversationsForUser(owner.id, 'open'), conv.id),
      'closed excluded from open',
    );
    assert.ok(
      find(await listConversationsForUser(owner.id, 'closed'), conv.id),
      'present in closed',
    );
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await deleteUsersByGoogleSub(subs);
  }
});

test('listing: a band scope hides the other bands, and grants nothing', async () => {
  const subs = ['L_SCOPE_OWNER', 'L_SCOPE_OTHER'];
  const bandIds: string[] = [];
  try {
    const owner = await upsertUser({
      googleSub: 'L_SCOPE_OWNER',
      email: 'scope-o@x.com',
      name: 'Scope Owner',
    });
    const stranger = await upsertUser({
      googleSub: 'L_SCOPE_OTHER',
      email: 'scope-s@x.com',
      name: 'Stranger',
    });

    const mine = await createBand(owner.id, 'Scope Mine');
    const also = await createBand(owner.id, 'Scope Also');
    // A band the owner is not a member of at all.
    const theirs = await createBand(stranger.id, 'Scope Theirs');
    bandIds.push(mine.id, also.id, theirs.id);

    const seed = async (bandId: string, key: string, userId: string) => {
      const conv = await findOrCreateConversation(bandId, key, `${key}.mp3`);
      await createNote(conv.id, userId, 0, 'closing thoughts', []);
      await setConversationClosed(conv.id, userId, true);
      return conv;
    };
    const a = await seed(mine.id, 'scope-a', owner.id);
    const b = await seed(also.id, 'scope-b', owner.id);
    const c = await seed(theirs.id, 'scope-c', stranger.id);

    // Unscoped: both of the owner's bands, never the stranger's.
    const all = await listConversationsForUser(owner.id, 'closed');
    assert.ok(find(all, a.id) && find(all, b.id), 'both bands without a scope');
    assert.ok(!find(all, c.id), 'never a band they are not in');

    // Scoped: only that band.
    const scoped = await listConversationsForUser(
      owner.id,
      'closed',
      undefined,
      mine.id,
    );
    assert.ok(find(scoped, a.id), 'the scoped band is present');
    assert.ok(!find(scoped, b.id), 'their other band is filtered out');

    /*
     * The scope narrows; it can't widen. Asking for a band you're not in is
     * empty rather than a way to read someone else's history.
     */
    const borrowed = await listConversationsForUser(
      owner.id,
      'closed',
      undefined,
      theirs.id,
    );
    assert.deepEqual(borrowed, [], 'a band you are not in yields nothing');
  } finally {
    for (const id of bandIds) await db.delete(bands).where(eq(bands.id, id));
    await deleteUsersByGoogleSub(subs);
  }
});
