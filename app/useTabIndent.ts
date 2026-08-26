'use client';

import { useRef, type KeyboardEvent } from 'react';

/** What a Tab inserts. Spaces, not a tab character — see the hook's note. */
export const INDENT = '    ';

/**
 * Makes Tab indent inside a textarea instead of leaving it.
 *
 * Four spaces rather than a literal `\t`: this text is rendered as Markdown
 * and ChordPro, where a leading tab can turn a line into a code block, and
 * where column alignment depends on the reader's tab width. Spaces render the
 * same everywhere.
 *
 * Trapping Tab removes the standard way out of a field, so Escape arms an
 * escape hatch: press Escape, then Tab moves focus as usual. Any other key
 * disarms it again, so it can't leak into the next indent.
 *
 * Shift+Tab outdents, removing up to one indent's worth of spaces before the
 * caret — the counterpart people expect once Tab indents.
 *
 * Edits go through `execCommand('insertText')` where available so they join
 * the textarea's own undo history; typing Tab and pressing Ctrl+Z should undo
 * the indent, not the whole edit. Falling back to setting `value` directly
 * loses that, which is worth it over losing the feature.
 */
export function useTabIndent() {
  const escaped = useRef(false);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      escaped.current = true;
      return;
    }
    if (e.key !== 'Tab') {
      escaped.current = false;
      return;
    }
    // Armed by a preceding Escape — let this Tab move focus, then re-arm the
    // trap for next time.
    if (escaped.current) {
      escaped.current = false;
      return;
    }

    const el = e.currentTarget;
    e.preventDefault();

    if (e.shiftKey) {
      const start = el.selectionStart;
      const before = el.value.slice(0, start);
      const trimmed = before.replace(/ {1,4}$/, '');
      if (trimmed === before) return;
      const removed = before.length - trimmed.length;
      el.setSelectionRange(start - removed, start);
      if (!document.execCommand('delete')) {
        el.value = trimmed + el.value.slice(start);
        el.setSelectionRange(start - removed, start - removed);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    if (!document.execCommand('insertText', false, INDENT)) {
      const { selectionStart: s, selectionEnd: t, value } = el;
      el.value = value.slice(0, s) + INDENT + value.slice(t);
      el.setSelectionRange(s + INDENT.length, s + INDENT.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return { onKeyDown };
}
