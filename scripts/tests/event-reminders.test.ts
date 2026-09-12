import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import {
  clearReminderPref,
  getReminderPrefs,
  setReminderPref,
} from '../../lib/db/event-reminders';
import {
  DEFAULT_REMINDERS,
  REMINDER_CATEGORIES,
  REMINDER_KINDS,
  categoryForEventType,
  wantsReminder,
} from '../../lib/reminder-prefs';
import {
  EVENT_COLOR_KEYS,
  eventColorKey,
} from '../../app/scheduling/eventColors';

after(closeDb);

/*
 * `lib` never imports from `app`, so the category list is written out twice.
 * This is what stops the copies drifting: a colour added to the calendar and
 * not here would silently have no preferences at all.
 */
test('reminder categories are exactly the calendar colour keys', () => {
  assert.deepEqual(
    [...REMINDER_CATEGORIES].sort(),
    [...EVENT_COLOR_KEYS].sort(),
  );
});

/*
 * The same free-text label must colour and remind the same way. These are the
 * two independent copies of that mapping, so they're checked against each
 * other rather than each against a list someone wrote twice.
 */
test('an event type maps to the same category as it does colour', () => {
  const labels = [
    'Show',
    'Practice',
    'Writing session',
    'Studio',
    'Time off',
    // Case and padding are normalised the same way by both.
    'show',
    '  TIME OFF  ',
    // A band's own invention, and no type at all, are both "other".
    'Rehearsal dinner',
    '',
    null,
  ];
  for (const label of labels)
    assert.equal(
      categoryForEventType(label),
      eventColorKey(label),
      `"${label}"`,
    );
});

test('every category and offset has a default', () => {
  for (const c of REMINDER_CATEGORIES)
    for (const k of REMINDER_KINDS)
      assert.equal(
        typeof DEFAULT_REMINDERS[c][k],
        'boolean',
        `${c}/${k} has no default`,
      );
});

/*
 * The defaults are the whole feature for anyone who never opens Settings, so
 * they're asserted rather than left to drift: gigs get all three, everything
 * else only the morning of, and time off stays quiet.
 */
test('defaults: shows get all three, others day-of, time off none', () => {
  const empty = new Map<string, boolean>();
  assert.deepEqual(
    REMINDER_KINDS.map((k) => wantsReminder(empty, 'show', k)),
    [true, true, true],
  );
  for (const c of ['practice', 'writing', 'studio', 'other'] as const)
    assert.deepEqual(
      REMINDER_KINDS.map((k) => wantsReminder(empty, c, k)),
      [false, false, true],
      c,
    );
  assert.deepEqual(
    REMINDER_KINDS.map((k) => wantsReminder(empty, 'time-off', k)),
    [false, false, false],
  );
});

test('an explicit choice overrides the default, and clearing restores it', async () => {
  const sub = 'ERP_USER';
  const user = await upsertUser({
    googleSub: sub,
    email: 'erp@x.com',
    name: 'Prefs',
  });
  try {
    // Off something that defaults on, and on something that defaults off.
    await setReminderPref(user.id, 'show', 'event-week-before', false);
    await setReminderPref(user.id, 'practice', 'event-week-before', true);

    let prefs = await getReminderPrefs(user.id);
    assert.equal(wantsReminder(prefs, 'show', 'event-week-before'), false);
    assert.equal(wantsReminder(prefs, 'practice', 'event-week-before'), true);
    // Untouched cells still read as their default.
    assert.equal(wantsReminder(prefs, 'show', 'event-day-of'), true);
    assert.equal(wantsReminder(prefs, 'practice', 'event-day-of'), true);

    // Setting the same cell again replaces rather than duplicating.
    await setReminderPref(user.id, 'show', 'event-week-before', true);
    prefs = await getReminderPrefs(user.id);
    assert.equal(wantsReminder(prefs, 'show', 'event-week-before'), true);

    await clearReminderPref(user.id, 'practice', 'event-week-before');
    prefs = await getReminderPrefs(user.id);
    assert.equal(wantsReminder(prefs, 'practice', 'event-week-before'), false);
  } finally {
    await deleteUsersByGoogleSub([sub]);
  }
});
