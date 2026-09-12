import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleInBand } from '../../app/calendar/bandFilter';

/**
 * Narrowing a calendar to one band.
 *
 * The case that matters is the third: an event in a band you don't belong to
 * is one you were personally invited to, and it has to survive every band
 * filter or it has nowhere left to appear.
 */

const MY_BANDS = new Set(['band-a', 'band-b']);
const ev = (bandId: string) => ({ bandId });

test('the selected band’s own events show', () => {
  assert.equal(visibleInBand(ev('band-a'), 'band-a', MY_BANDS), true);
});

test('another of your bands’ events are filtered out', () => {
  assert.equal(visibleInBand(ev('band-b'), 'band-a', MY_BANDS), false);
});

test('an event in a band you’re not in is a personal invite, and stays', () => {
  assert.equal(visibleInBand(ev('band-z'), 'band-a', MY_BANDS), true);
});

test('with no band selected, everything visible shows', () => {
  assert.equal(visibleInBand(ev('band-a'), '', MY_BANDS), true);
  assert.equal(visibleInBand(ev('band-z'), '', MY_BANDS), true);
});

test('a user with no bands still sees what they were invited to', () => {
  // Nothing to narrow to, and an empty membership set must not read as
  // "filter everything out".
  assert.equal(visibleInBand(ev('band-z'), '', new Set()), true);
});
