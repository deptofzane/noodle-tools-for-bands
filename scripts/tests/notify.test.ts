import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import { createNote } from '../../lib/db/notes';
import { closeNotifyHub, getNotifyHub } from '../../lib/db/notify';

after(async () => {
  await closeNotifyHub();
  await closeDb();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('notify: LISTEN/NOTIFY fans a mutation to the right subscriber', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'N_OWNER', email: 'o@x.com', name: 'O' });
    const band = await createBand(owner.id, 'Notify Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(band.id, 'driveN', 'N.mp3');

    const hub = getNotifyHub();
    await hub.ensureListening();

    let fired = 0;
    let otherFired = 0;
    const unsub = hub.subscribe(conv.id, () => {
      fired++;
    });
    const unsubOther = hub.subscribe('some-other-id', () => {
      otherFired++;
    });

    await createNote(conv.id, owner.id, 0, 'realtime', []);
    await wait(600); // let the async notification arrive

    assert.equal(fired, 1, 'subscriber received the change');
    assert.equal(otherFired, 0, 'unrelated conversation not notified');

    unsub();
    unsubOther();

    await createNote(conv.id, owner.id, 1, 'second', []);
    await wait(400);
    assert.equal(fired, 1, 'no callback after unsubscribe');
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await deleteUsersByGoogleSub(['N_OWNER']);
  }
});
