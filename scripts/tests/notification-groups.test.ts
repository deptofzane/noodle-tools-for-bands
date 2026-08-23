import '../load-env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFICATION_KINDS } from '../../lib/db/notifications';
import { FEED_ONLY_KINDS } from '../../lib/notification-kinds';
import {
  ALL_PREF_KINDS,
  PREF_GROUPS,
  masterClickTurnsOn,
  masterState,
  pushableKinds,
  rowCanPush,
} from '../../app/settings/notificationGroups';

/*
 * The grouping is presentation, but two things about it are load-bearing: a
 * kind with no group can never be muted by anyone, and the master switches
 * decide what a single click does to a whole category.
 */

test('every notification kind has exactly one home', () => {
  const seen = new Map<string, number>();
  for (const k of ALL_PREF_KINDS) seen.set(k, (seen.get(k) ?? 0) + 1);

  const missing = NOTIFICATION_KINDS.filter((k) => !seen.has(k));
  assert.deepEqual(
    missing,
    [],
    `these kinds are in no group, so Settings can never mute them: ${missing.join(', ')}`,
  );

  const duplicated = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepEqual(duplicated, [], 'a kind in two rows would fight itself');

  const unknown = ALL_PREF_KINDS.filter(
    (k) => !(NOTIFICATION_KINDS as readonly string[]).includes(k),
  );
  assert.deepEqual(unknown, [], 'group refers to a kind that no longer exists');
});

test('group ids are unique and stable-looking', () => {
  const ids = PREF_GROUPS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'ids persist open/closed state');
});

test('a row can push unless every one of its kinds is feed-only', () => {
  const pinRow = PREF_GROUPS.find((g) => g.id === 'chat')!.rows.find((r) =>
    r.kinds.includes('note-pinned'),
  )!;
  assert.equal(
    pinRow.kinds.every((k) => FEED_ONLY_KINDS.has(k)),
    true,
  );
  assert.equal(rowCanPush(pinRow), false, 'its Push switch controls nothing');

  const chatRow = PREF_GROUPS.find((g) => g.id === 'chat')!.rows.find((r) =>
    r.kinds.includes('chat-message'),
  )!;
  assert.equal(rowCanPush(chatRow), true);
});

test('a Push master only counts kinds that can actually push', () => {
  const chat = PREF_GROUPS.find((g) => g.id === 'chat')!;
  // Three kinds in the group, but only one of them pushes.
  assert.equal(chat.rows.flatMap((r) => r.kinds).length, 3);
  assert.deepEqual(pushableKinds(chat), ['chat-message']);
});

test('master state reads on / off / mixed', () => {
  const ks = ['a', 'b', 'c'] as never[];
  assert.equal(
    masterState(ks, () => true),
    'on',
  );
  assert.equal(
    masterState(ks, () => false),
    'off',
  );
  assert.equal(
    masterState(ks, (k) => k === ks[0]),
    'mixed',
  );
  assert.equal(
    masterState([], () => true),
    'off',
    'nothing to govern',
  );
});

test('a click turns everything on only when everything is already off', () => {
  assert.equal(masterClickTurnsOn('off'), true);
  assert.equal(masterClickTurnsOn('on'), false);
  assert.equal(
    masterClickTurnsOn('mixed'),
    false,
    'half-on collapses to off, not up to on',
  );
});

test('the merged rows are the intended pairs, and nothing else', () => {
  const merged = PREF_GROUPS.flatMap((g) => g.rows)
    .filter((r) => r.kinds.length > 1)
    .map((r) => r.kinds.slice().sort().join('+'))
    .sort();
  assert.deepEqual(merged, [
    'note-pinned+note-unpinned',
    'poll-auto-closed+poll-closed',
    'todo-cancelled+todo-completed',
  ]);
});
