import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandSwitchTarget } from '../../lib/routes';

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

test('band switch: a page that is not about a band stays put', () => {
  // The current band is a pointer for the nav, not what these pages show —
  // sending someone from the calendar to a band Overview loses their place.
  for (const path of [
    '/home',
    '/calendar',
    '/history',
    '/settings',
    '/about',
    '/open-conversations',
    '/notes/some-conversation',
    '/practice',
  ]) {
    assert.equal(bandSwitchTarget(path, '', B), null, path);
  }
});

test('band switch: the band list stays put', () => {
  // `/bands` names no band, so there is nothing to remap.
  assert.equal(bandSwitchTarget('/bands', '', B), null);
});

test('band switch: the band’s own pages follow, query and all', () => {
  assert.equal(bandSwitchTarget(`/bands/${A}`, '', B), `/bands/${B}`);
  // The open tab rides in the query, so it survives the switch.
  assert.equal(
    bandSwitchTarget(`/bands/${A}`, '?tab=chat', B),
    `/bands/${B}?tab=chat`,
  );
  assert.equal(
    bandSwitchTarget(`/bands/${A}/audio`, '?tab=setlists', B),
    `/bands/${B}/audio?tab=setlists`,
  );
  assert.equal(
    bandSwitchTarget(`/bands/${A}/audio/`, '', B),
    `/bands/${B}/audio`,
    'a trailing slash is still the audio page',
  );
});

test('band switch: a URL naming the old band’s things falls back', () => {
  // None of these identifiers exist in the new band — remapping the path
  // would 404, and any that did resolve would not be what the URL described.
  for (const rest of [
    '/setlists/some-setlist',
    '/setlists/some-setlist/edit',
    '/polls/some-poll',
    '/venues/some-venue/edit',
    '/notes/some-note/edit',
    '/audio/uploads/2026-08-04',
  ]) {
    assert.equal(
      bandSwitchTarget(`/bands/${A}${rest}`, '', B),
      `/bands/${B}`,
      rest,
    );
  }
});

test('band switch: half-filled forms are not carried across', () => {
  // Landing on the new band's identical form would imply the text typed into
  // the old one came too.
  for (const rest of [
    '/edit',
    '/setlists/new',
    '/polls/new',
    '/venues/new',
    '/notes/new',
  ]) {
    assert.equal(
      bandSwitchTarget(`/bands/${A}${rest}`, '', B),
      `/bands/${B}`,
      rest,
    );
  }
});

test('band switch: choosing the band you are already in does nothing', () => {
  assert.equal(bandSwitchTarget(`/bands/${A}`, '?tab=chat', A), null);
  assert.equal(bandSwitchTarget(`/bands/${A}/audio`, '', A), null);
});
