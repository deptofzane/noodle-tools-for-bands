import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import {
  countPinnedNotes,
  createNote,
  listBandNotesForUser,
  listPinnedNotes,
  setNotePinned,
} from '../../lib/db/user-notes';

after(() => closeDb());

/**
 * Pinning, at the data layer.
 *
 * The rules worth protecting here are the ones that aren't obvious from the
 * column: pinned notes leave the main list rather than appearing twice, the
 * scopes stay watertight, and pinning is not an edit.
 */
async function fixture(tag: string) {
  const author = await upsertUser({
    googleSub: `PIN_A_${tag}`,
    email: `pina-${tag}@x.com`,
    name: 'Author',
  });
  const mate = await upsertUser({
    googleSub: `PIN_B_${tag}`,
    email: `pinb-${tag}@x.com`,
    name: 'Mate',
  });
  const band = await createBand(author.id, `PIN Band ${tag}`);
  await addMember(band.id, mate.id, 'member');
  const mk = async (title: string, shared: boolean) =>
    (
      await createNote({
        bandId: band.id,
        authorId: author.id,
        title,
        body: null,
        shared,
        links: [],
      })
    ).id;
  return { author, mate, bandId: band.id, mk };
}

const cleanup = async (bandId: string, tag: string) => {
  await deleteBand(bandId);
  await deleteUsersByGoogleSub([`PIN_A_${tag}`, `PIN_B_${tag}`]);
};

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

test('a pinned note leaves the main list and appears in the pinned one', async () => {
  const { author, bandId, mk } = await fixture('MOVE');
  try {
    const keep = await mk('Ordinary', true);
    const pin = await mk('Held up', true);
    await setNotePinned(pin, bandId, true);

    const main = await listBandNotesForUser(
      bandId,
      author.id,
      undefined,
      'shared',
    );
    const pinned = await listPinnedNotes(bandId, author.id, 'shared');
    assert.deepEqual(
      titles(main),
      ['Ordinary'],
      'pinned note must not repeat below',
    );
    assert.deepEqual(titles(pinned), ['Held up']);
    assert.equal(await countPinnedNotes(bandId, author.id, 'shared'), 1);

    // Unpinning puts it back.
    await setNotePinned(pin, bandId, false);
    assert.deepEqual(
      titles(
        await listBandNotesForUser(bandId, author.id, undefined, 'shared'),
      ),
      ['Held up', 'Ordinary'],
    );
    assert.equal(await countPinnedNotes(bandId, author.id, 'shared'), 0);
    assert.equal(keep.length > 0, true);
  } finally {
    await cleanup(bandId, 'MOVE');
  }
});

test('scopes stay separate, and a private pin never reaches a bandmate', async () => {
  const { author, mate, bandId, mk } = await fixture('SCOPE');
  try {
    const priv = await mk('Private pin', false);
    const shared = await mk('Shared pin', true);
    await setNotePinned(priv, bandId, true);
    await setNotePinned(shared, bandId, true);

    assert.deepEqual(
      titles(await listPinnedNotes(bandId, author.id, 'personal')),
      ['Private pin'],
    );
    assert.deepEqual(
      titles(await listPinnedNotes(bandId, author.id, 'shared')),
      ['Shared pin'],
    );

    // The bandmate sees the shared pin and nothing of the private one.
    assert.deepEqual(titles(await listPinnedNotes(bandId, mate.id, 'shared')), [
      'Shared pin',
    ]);
    assert.deepEqual(await listPinnedNotes(bandId, mate.id, 'personal'), []);
    assert.equal(await countPinnedNotes(bandId, mate.id, 'personal'), 0);
  } finally {
    await cleanup(bandId, 'SCOPE');
  }
});

test('the pinned list is newest-pinned first, not newest-written', async () => {
  const { author, bandId, mk } = await fixture('ORDER');
  try {
    const first = await mk('Written first', true);
    const second = await mk('Written second', true);
    // Pin them in the opposite order to how they were written.
    await setNotePinned(second, bandId, true);
    await new Promise((r) => setTimeout(r, 20));
    await setNotePinned(first, bandId, true);

    const rows = await listPinnedNotes(bandId, author.id, 'shared');
    assert.deepEqual(
      rows.map((r) => r.title),
      ['Written first', 'Written second'],
    );
  } finally {
    await cleanup(bandId, 'ORDER');
  }
});

test('the preview limit caps rows but never the count', async () => {
  const { author, bandId, mk } = await fixture('LIMIT');
  try {
    for (let i = 0; i < 5; i++) {
      const id = await mk(`Note ${i}`, true);
      await setNotePinned(id, bandId, true);
    }
    assert.equal(
      (await listPinnedNotes(bandId, author.id, 'shared', 3)).length,
      3,
    );
    assert.equal(await countPinnedNotes(bandId, author.id, 'shared'), 5);
    assert.equal(
      (await listPinnedNotes(bandId, author.id, 'shared')).length,
      5,
    );
  } finally {
    await cleanup(bandId, 'LIMIT');
  }
});

test('pinning is not an edit: updatedAt is left alone', async () => {
  const { author, bandId, mk } = await fixture('STAMP');
  try {
    const id = await mk('Untouched', true);
    const before = (
      await listBandNotesForUser(bandId, author.id, undefined, 'shared')
    )[0];
    await new Promise((r) => setTimeout(r, 20));
    const after = await setNotePinned(id, bandId, true);
    assert.equal(after?.updatedAt, before?.updatedAt);
    assert.equal(after?.pinned, true);
    assert.notEqual(after?.pinnedAt, null);

    const off = await setNotePinned(id, bandId, false);
    assert.equal(off?.pinnedAt, null, 'unpinning clears the stamp');
  } finally {
    await cleanup(bandId, 'STAMP');
  }
});

test('a note from another band is not pinnable through this one', async () => {
  const a = await fixture('BANDA');
  const b = await fixture('BANDB');
  try {
    const id = await a.mk('Belongs to A', true);
    assert.equal(await setNotePinned(id, b.bandId, true), null);
    assert.equal(await countPinnedNotes(a.bandId, a.author.id, 'shared'), 0);
  } finally {
    await cleanup(a.bandId, 'BANDA');
    await cleanup(b.bandId, 'BANDB');
  }
});
