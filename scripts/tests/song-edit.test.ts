import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, conversations, notes, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { createBand } from '../../lib/db/bands';
import {
  ConversationConflictError,
  deleteConversation,
  findOrCreateConversation,
  getConversationById,
  moveConversation,
  renameConversation,
} from '../../lib/db/conversations';
import { createNote } from '../../lib/db/notes';
import { putSongFile } from '../../lib/db/song-files';

after(closeDb);

test('song-edit: rename, move (+ conflict), delete cascade', async () => {
  const bandIds: string[] = [];
  try {
    const owner = await upsertUser({ googleSub: 'E_OWNER', email: 'o@x.com', name: 'O' });
    const bandA = await createBand(owner.id, 'Band A');
    const bandB = await createBand(owner.id, 'Band B');
    const bandC = await createBand(owner.id, 'Band C');
    bandIds.push(bandA.id, bandB.id, bandC.id);

    const conv = await findOrCreateConversation(bandA.id, 'driveE', 'Old Name.mp3');

    // rename
    const renamed = await renameConversation(conv.id, 'New Name');
    assert.equal(renamed.audioFileName, 'New Name', 'rename updates the name');

    // move to an empty band → succeeds
    const moved = await moveConversation(conv.id, bandC.id);
    assert.equal(moved.bandId, bandC.id, 'move reassigns the band');

    // conflict: band B already has the same audio → move there throws
    await findOrCreateConversation(bandB.id, 'driveE', 'Dup.mp3');
    let conflict = false;
    try {
      await moveConversation(conv.id, bandB.id);
    } catch (e) {
      conflict = e instanceof ConversationConflictError;
    }
    assert.ok(conflict, 'moving into a band that already has the song conflicts');

    // delete cascades notes + files
    await createNote(conv.id, owner.id, 0, 'a note', []);
    await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data: Buffer.from('x'),
      fileName: 'a.mp3',
      mimeType: 'audio/mpeg',
    });
    await deleteConversation(conv.id);
    assert.equal(await getConversationById(conv.id), null, 'conversation deleted');
    assert.equal(
      (await db.select().from(notes).where(eq(notes.conversationId, conv.id))).length,
      0,
      'notes cascade-deleted',
    );
  } finally {
    for (const id of bandIds) await db.delete(bands).where(eq(bands.id, id));
    await db.delete(users).where(eq(users.googleSub, 'E_OWNER'));
  }
});
