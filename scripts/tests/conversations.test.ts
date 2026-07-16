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
  getConversationMembership,
  setConversationClosed,
} from '../../lib/db/conversations';
import {
  NoteNotFoundError,
  createNote,
  createReply,
  deleteNote,
  loadNotes,
  setNoteResolved,
  updateNote,
} from '../../lib/db/notes';
import { getConversationActivity } from '../../lib/db/activity';

after(closeDb);

test('conversations: notes threading, mentions, authorization, activity', async () => {
  const subs = ['C_OWNER', 'C_MEMBER', 'C_STRANGER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'C_OWNER', email: 'o@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'C_MEMBER', email: 'm@x.com', name: 'Member' });
    const stranger = await upsertUser({ googleSub: 'C_STRANGER', email: 's@x.com', name: 'Str' });
    const band = await createBand(owner.id, 'Conv Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');

    const conv = await findOrCreateConversation(band.id, 'driveX', 'Song.mp3');
    const conv2 = await findOrCreateConversation(band.id, 'driveX', 'Song.mp3');
    assert.equal(conv.id, conv2.id, 'find-or-create is idempotent');

    const note = await createNote(conv.id, owner.id, 1000, '@Member hi', [member.id]);
    const reply = await createReply(conv.id, member.id, note.id, 'reply!', []);
    assert.equal(reply.timestampMs, 1000, 'reply inherits parent timestamp');

    let threaded = await loadNotes(conv.id, owner.id);
    assert.equal(threaded.length, 1, 'one top-level note');
    assert.equal(threaded[0]!.replies.length, 1, 'note has one reply');
    assert.ok(threaded[0]!.mentions.includes(member.id), 'mention recorded as member id');
    assert.equal(threaded[0]!.isMine, true, 'isMine true for author');
    assert.equal(threaded[0]!.replies[0]!.isMine, false, 'reply isMine false for other viewer');

    await setNoteResolved(conv.id, owner.id, note.id, true);
    await setNoteResolved(conv.id, owner.id, note.id, true); // idempotent, no throw
    threaded = await loadNotes(conv.id, owner.id);
    assert.equal(threaded[0]!.resolved, true, 'note resolved');

    await updateNote(conv.id, owner.id, note.id, 'edited');
    let authorEnforced = false;
    try {
      await updateNote(conv.id, member.id, note.id, 'hack');
    } catch (e) {
      authorEnforced = e instanceof NoteNotFoundError;
    }
    assert.ok(authorEnforced, 'only the author can edit');

    assert.ok(await getConversationMembership(member.id, conv.id), 'member has access');
    assert.equal(
      await getConversationMembership(stranger.id, conv.id),
      null,
      'stranger has no access',
    );

    const closed = await setConversationClosed(conv.id, owner.id, true);
    assert.equal(closed.closed, true, 'conversation closed');

    const activity = await getConversationActivity(conv.id);
    const kinds = activity?.log.map((e) => e.kind) ?? [];
    assert.ok(
      kinds.includes('note-created') &&
        kinds.includes('reply-created') &&
        kinds.includes('closed'),
      'activity log captured the mutations',
    );

    await deleteNote(conv.id, owner.id, note.id); // cascades the reply
    assert.equal((await loadNotes(conv.id, owner.id)).length, 0, 'delete cascades reply');
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await deleteUsersByGoogleSub(subs);
  }
});
