import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro, looksLikeChordPro } from '../../lib/chordpro';

test('chordpro: inline chords split into chord/text tokens', () => {
  const [line] = parseChordPro('[C]Twinkle [G]twinkle little [Am]star');
  assert.equal(line!.type, 'lyric');
  assert.deepEqual((line as { tokens: unknown }).tokens, [
    { chord: 'C', text: 'Twinkle ' },
    { chord: 'G', text: 'twinkle little ' },
    { chord: 'Am', text: 'star' },
  ]);
});

test('chordpro: leading text before a chord has a null chord', () => {
  const [line] = parseChordPro('Oh [C]say can you see');
  assert.deepEqual((line as { tokens: { chord: string | null }[] }).tokens[0], {
    chord: null,
    text: 'Oh ',
  });
});

test('chordpro: directives and shorthands are normalized', () => {
  const lines = parseChordPro('{title: Song}\n{st: Artist}\n{soc}\n{eoc}');
  assert.deepEqual(lines[0], { type: 'directive', name: 'title', value: 'Song' });
  assert.deepEqual(lines[1], { type: 'directive', name: 'subtitle', value: 'Artist' });
  assert.deepEqual(lines[2], { type: 'directive', name: 'start_of_chorus', value: '' });
  assert.deepEqual(lines[3], { type: 'directive', name: 'end_of_chorus', value: '' });
});

test('chordpro: comment directive and # lines become comments', () => {
  const lines = parseChordPro('{comment: play softly}\n# a note');
  assert.deepEqual(lines[0], { type: 'comment', text: 'play softly' });
  assert.deepEqual(lines[1], { type: 'comment', text: 'a note' });
});

test('chordpro: blank lines are preserved as empty', () => {
  const lines = parseChordPro('a\n\nb');
  assert.equal(lines[1]!.type, 'empty');
});

test('chordpro: detection via directive or chord tokens', () => {
  assert.equal(looksLikeChordPro('{title: x}\nplain'), true);
  assert.equal(looksLikeChordPro('[C]hi [G]there'), true);
  assert.equal(looksLikeChordPro('# Heading\nJust **markdown** here'), false);
  assert.equal(looksLikeChordPro('one [note] only'), false);
});
