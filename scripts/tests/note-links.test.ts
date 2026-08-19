import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalNoteUrl } from '../../lib/note-links';

test('note links: full URLs pass through', () => {
  assert.equal(externalNoteUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(externalNoteUrl('http://example.com'), 'http://example.com/');
  assert.equal(externalNoteUrl('  https://example.com  '), 'https://example.com/');
});

test('note links: the scheme is optional, because that is what people type', () => {
  assert.equal(externalNoteUrl('example.com'), 'https://example.com/');
  assert.equal(externalNoteUrl('www.example.com/tour'), 'https://www.example.com/tour');
  assert.equal(externalNoteUrl('bandcamp.com/album/x?y=1'), 'https://bandcamp.com/album/x?y=1');
});

test('note links: hosts without a dot are links too — Other means outside', () => {
  // No TLD requirement: intranet hosts and dev servers are real destinations.
  assert.equal(externalNoteUrl('intranet'), 'https://intranet/');
  assert.equal(externalNoteUrl('localhost:3000'), 'https://localhost:3000/');
  assert.equal(externalNoteUrl('my-server/wiki'), 'https://my-server/wiki');
  assert.equal(externalNoteUrl('192.168.1.5'), 'https://192.168.1.5/');
});

test('note links: script-bearing schemes never reach an href', () => {
  assert.equal(externalNoteUrl('javascript:alert(1)'), null);
  assert.equal(externalNoteUrl('JavaScript:alert(1)'), null);
  assert.equal(externalNoteUrl('data:text/html,<script>'), null);
  assert.equal(externalNoteUrl('vbscript:msgbox'), null);
});

test('note links: other schemes are left alone', () => {
  // Keeps the guarantee simple: what comes out of here is always http(s).
  assert.equal(externalNoteUrl('mailto:a@b.com'), null);
  assert.equal(externalNoteUrl('file:///etc/passwd'), null);
  assert.equal(externalNoteUrl('tel:+15551234'), null);
});

test('note links: what cannot be a URL stays plain text', () => {
  assert.equal(externalNoteUrl('shelf 4B'), null, 'spaces');
  assert.equal(externalNoteUrl('foo bar.com'), null, 'spaces');
  assert.equal(externalNoteUrl(''), null);
  assert.equal(externalNoteUrl(null), null);
});

test('note links: bare numbers are not silently turned into IPs', () => {
  // `new URL('https://3.5')` resolves to 3.0.0.5 — a parser quirk, not intent.
  assert.equal(externalNoteUrl('3.5'), null);
  assert.equal(externalNoteUrl('12'), null);
});
