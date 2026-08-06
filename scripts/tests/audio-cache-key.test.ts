import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalAudioKey } from '../../lib/audio-cache-key';

const AUDIO = '/api/conversations/c1/files/audio';

test('audio cache key: ?name= never splits an entry', () => {
  // The player builds this from the stored file name…
  const fromPlayer = canonicalAudioKey(`${AUDIO}?version=v1&name=stored.mp3`);
  // …and the offline download from the setlist's display name. Same bytes.
  const fromDownload = canonicalAudioKey(
    `${AUDIO}?version=v1&name=Song%20Title`,
  );
  assert.equal(fromPlayer, fromDownload);
  assert.equal(fromPlayer, `${AUDIO}?version=v1`);
});

test('audio cache key: each version gets its own entry', () => {
  const a = canonicalAudioKey(`${AUDIO}?version=v1&name=take-1.wav`);
  const b = canonicalAudioKey(`${AUDIO}?version=v2&name=take-2.wav`);
  assert.notEqual(a, b, 'two takes of one song must not answer for each other');
});

test('audio cache key: songs never share an entry', () => {
  assert.notEqual(
    canonicalAudioKey('/api/conversations/c1/files/audio?version=v1'),
    canonicalAudioKey('/api/conversations/c2/files/audio?version=v1'),
  );
});

test('audio cache key: a versionless URL is left as the bare path', () => {
  // Not normalised to "the default" — which version that is changes over
  // time, and caching a moving target under a fixed key is the bug this
  // whole scheme exists to prevent.
  assert.equal(canonicalAudioKey(`${AUDIO}?name=stored.mp3`), AUDIO);
  assert.equal(canonicalAudioKey(AUDIO), AUDIO);
});

test('audio cache key: absolute and relative URLs agree', () => {
  assert.equal(
    canonicalAudioKey(`https://sidestage.app${AUDIO}?version=v1`),
    canonicalAudioKey(`${AUDIO}?version=v1`),
  );
});

test('audio cache key: other params are dropped, order does not matter', () => {
  const a = canonicalAudioKey(`${AUDIO}?name=x.mp3&version=v1&t=123`);
  const b = canonicalAudioKey(`${AUDIO}?version=v1&t=456&name=y.mp3`);
  assert.equal(a, b);
  assert.equal(a, `${AUDIO}?version=v1`);
});
