/**
 * Minimal ChordPro parser for rendering chord charts. Pure (no DOM), so it's
 * cheap to unit-test; the React rendering lives in the SheetText component.
 *
 * Supports the common subset:
 *   - inline chords:      [C]lyrics [G]more
 *   - directives:         {title: ...} {subtitle:} {comment:} {soc}/{eoc} etc.
 *   - `#` line comments
 * Anything else is treated as a plain lyric line.
 */

export interface ChordToken {
  /** Chord shown above `text`, or null for a plain run. */
  chord: string | null;
  text: string;
}

export type ChordProLine =
  | { type: 'directive'; name: string; value: string }
  | { type: 'comment'; text: string }
  | { type: 'lyric'; tokens: ChordToken[] }
  | { type: 'empty' };

/** Canonical directive names (folds the common shorthands). */
function normalizeDirective(raw: string): string {
  const n = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    t: 'title',
    st: 'subtitle',
    c: 'comment',
    soc: 'start_of_chorus',
    eoc: 'end_of_chorus',
    sov: 'start_of_verse',
    eov: 'end_of_verse',
    sob: 'start_of_bridge',
    eob: 'end_of_bridge',
  };
  return map[n] ?? n;
}

/** Split a lyric line into chord/text tokens (leading text has a null chord). */
function tokenizeLyric(line: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  const parts = line.split(/(\[[^\]]*\])/);
  let chord: string | null = null;
  for (const p of parts) {
    if (p === '') continue;
    if (p.startsWith('[') && p.endsWith(']')) {
      // Two chords in a row: flush the first over an empty run.
      if (chord !== null) tokens.push({ chord, text: '' });
      chord = p.slice(1, -1);
    } else {
      tokens.push({ chord, text: p });
      chord = null;
    }
  }
  if (chord !== null) tokens.push({ chord, text: '' });
  return tokens;
}

export function parseChordPro(text: string): ChordProLine[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((raw) => {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') return { type: 'empty' as const };

    const directive = line.trim().match(/^\{(.+?)\}$/);
    if (directive) {
      const inner = directive[1]!;
      const sep = inner.indexOf(':');
      const name = normalizeDirective(sep >= 0 ? inner.slice(0, sep) : inner);
      const value = sep >= 0 ? inner.slice(sep + 1).trim() : '';
      if (name === 'comment') return { type: 'comment' as const, text: value };
      return { type: 'directive' as const, name, value };
    }

    if (line.trimStart().startsWith('#')) {
      return { type: 'comment' as const, text: line.replace(/^\s*#\s?/, '') };
    }

    return { type: 'lyric' as const, tokens: tokenizeLyric(line) };
  });
}

/**
 * Heuristic: does this text look like ChordPro? True if it uses a known
 * directive or has a couple of chord-shaped `[…]` tokens — enough to pick a
 * sensible default render mode (the user can still switch).
 */
export function looksLikeChordPro(text: string): boolean {
  if (
    /\{\s*(title|t|subtitle|st|artist|composer|comment|c|start_of_\w+|end_of_\w+|soc|eoc|sov|eov|sob|eob|chorus|verse|bridge|key|capo|tempo|time)\b/i.test(
      text,
    )
  )
    return true;
  const chords = text.match(/\[[A-G][#b]?[^\]]{0,8}\]/g);
  return (chords?.length ?? 0) >= 2;
}
