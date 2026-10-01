import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushRecent,
  resolveRecent,
  RECENT_MAX,
  type RecentRef,
} from '../../lib/practice-recent';

const song = (id: string): RecentRef => ({ kind: 'song', id });
const setlist = (id: string): RecentRef => ({ kind: 'setlist', id });

test('recent: newest first, capped at ten', () => {
  let list: RecentRef[] = [];
  const ids = 'abcdefghijk'.split('');
  for (const id of ids) list = pushRecent(list, song(id));
  assert.equal(RECENT_MAX, 10);
  // Eleven pushed: the oldest, 'a', falls off.
  assert.deepEqual(
    list.map((r) => r.id),
    ids.slice(1).reverse(),
  );
});

test('recent: revisiting moves an item to the front instead of repeating it', () => {
  const list = pushRecent([song('a'), song('b'), song('c')], song('c'));
  assert.deepEqual(
    list.map((r) => r.id),
    ['c', 'a', 'b'],
  );
});

test('recent: a song and a setlist sharing an id are different items', () => {
  const list = pushRecent([song('x')], setlist('x'));
  assert.equal(list.length, 2);
});

test('recent: names come from the picker, and gone items drop out', () => {
  const picker = {
    songs: [{ id: 's1', title: 'Renamed', originalArtist: null }],
    setlists: [{ id: 'l1', name: 'Set', songCount: 3 }],
    events: [],
  };
  const resolved = resolveRecent(
    [song('s1'), setlist('gone'), { kind: 'event', id: 'past' }, setlist('l1')],
    picker,
  );
  assert.deepEqual(
    resolved.map((r) => [r.kind, r.item.id]),
    [
      ['song', 's1'],
      ['setlist', 'l1'],
    ],
  );
  assert.equal(
    resolved[0]!.kind === 'song' && resolved[0]!.item.title,
    'Renamed',
  );
});
