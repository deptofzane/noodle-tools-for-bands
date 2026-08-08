import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileCacheControl } from '../../lib/serve-cache';

const params = (qs: string) => new URLSearchParams(qs);
const IMMUTABLE = 'private, max-age=31536000, immutable';
const REVALIDATE = 'private, max-age=300';

test('serve-cache: a named audio version is immutable', () => {
  // `addAudioVersion` always writes a new object, so these bytes can't change
  // under this URL — which is the whole reason `audioSrc` names a version.
  assert.equal(
    fileCacheControl('audio', 'ver-1', params('version=ver-1&name=Cascade')),
    IMMUTABLE,
  );
});

test('serve-cache: a sheet version is only immutable when stamped', () => {
  // The ChordPro editor rewrites a sheet version's bytes in place, so the
  // version id alone doesn't pin them; `?v=<updatedAt>` does.
  assert.equal(
    fileCacheControl('sheet_music', 'ver-1', params('version=ver-1')),
    REVALIDATE,
  );
  assert.equal(
    fileCacheControl(
      'sheet_music',
      'ver-1',
      params('version=ver-1&v=2026-08-07T12%3A00%3A00.000Z'),
    ),
    IMMUTABLE,
  );
});

test('serve-cache: the versionless default is never immutable', () => {
  // "Whatever the default is now" is a moving target — caching it hard is
  // what made a downloaded setlist play the wrong take.
  assert.equal(fileCacheControl('audio', null, params('')), REVALIDATE);
  assert.equal(fileCacheControl('sheet_music', null, params('')), REVALIDATE);
  // Even a stray `v=` can't pin a URL that doesn't name a version.
  assert.equal(
    fileCacheControl('audio', null, params('v=whenever')),
    REVALIDATE,
  );
});

test('serve-cache: nothing is ever public', () => {
  // Every response from this endpoint is membership-gated.
  for (const value of [
    fileCacheControl('audio', 'ver-1', params('version=ver-1')),
    fileCacheControl('sheet_music', null, params('')),
  ]) {
    assert.ok(value.startsWith('private,'), value);
  }
});
