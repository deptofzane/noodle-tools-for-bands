import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand } from '../../lib/db/bands';
import { findOrCreateConversation, setConversationClosed } from '../../lib/db/conversations';
import { createNote } from '../../lib/db/notes';
import { listConversationsForUser, markConversationRead } from '../../lib/db/listing';

after(closeDb);

const find = <T extends { conversationId: string }>(rows: T[], id: string) =>
  rows.find((r) => r.conversationId === id);

test('listing: mention reach, unread vs self, badges clear on read', async () => {
  const subs = ['L_OWNER', 'L_MEMBER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'L_OWNER', email: 'o@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'L_MEMBER', email: 'm@x.com', name: 'Member' });
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
