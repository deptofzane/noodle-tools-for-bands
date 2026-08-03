import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isServableType, resolveContentType } from '../../lib/serve-mime';

test('serve-mime: stored audio and document types pass through', () => {
  assert.equal(resolveContentType('audio/mpeg', 'song.mp3'), 'audio/mpeg');
  assert.equal(
    resolveContentType('application/pdf', 'chart.pdf'),
    'application/pdf',
  );
  assert.equal(resolveContentType('image/png', 'chart.png'), 'image/png');
  assert.equal(
    resolveContentType('text/plain; charset=utf-8', 'notes.txt'),
    'text/plain; charset=utf-8',
  );
});

test('serve-mime: executable types are never declared', () => {
  // The whole point: these are served inline from our own origin, so declaring
  // either of these would hand an attacker script execution on the session.
  for (const mime of [
    'text/html',
    'text/html; charset=utf-8',
    'TEXT/HTML',
    'image/svg+xml',
    'application/xhtml+xml',
    'application/javascript',
  ]) {
    assert.equal(
      resolveContentType(mime, 'looks-fine.mp3'),
      'application/octet-stream',
      `${mime} should be downgraded`,
    );
    assert.equal(isServableType(mime), false, `${mime} should not be servable`);
  }
});

test('serve-mime: a generic stored type falls back to the file name', () => {
  assert.equal(
    resolveContentType('application/octet-stream', 'recording.m4a'),
    'audio/mp4',
  );
  assert.equal(resolveContentType('', 'chart.pdf'), 'application/pdf');
});

test('serve-mime: an unknown name yields an opaque download', () => {
  assert.equal(resolveContentType('', 'mystery'), 'application/octet-stream');
  assert.equal(resolveContentType('', null), 'application/octet-stream');
  // The name hint comes from the query string, so it can't promote a file to
  // a dangerous type either.
  assert.equal(
    resolveContentType('application/octet-stream', 'payload.html'),
    'application/octet-stream',
  );
});
