'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react';

// Layout effect on the client (measure before paint, no flash), plain effect
// on the server (avoids the useLayoutEffect SSR warning).
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * A textarea that grows to fit its content, so the full text is always
 * visible (no inner scrollbar). Resizes on input, whenever the controlled
 * `value` changes, and on window resize (width changes reflow the text). Give
 * it a `min-h-*` class for its starting height. Otherwise a drop-in `<textarea>`.
 */
export function AutoTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { onChange, style, ...rest } = props;

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    /**
     * Measuring costs a moment of collapse: `height: auto` drops the textarea
     * to a single row so `scrollHeight` reports the content's real height.
     *
     * On a long chart that shortens the document by thousands of pixels, and
     * the browser responds by clamping the scroll position to what's left.
     * Restoring the height restores the document, but not the scroll — so
     * every keystroke threw the page back to the top while editing sheet
     * music in Practice.
     *
     * The fix is to put the scroll back. Ancestors are checked too, not just
     * the window: a textarea inside a scrolling pane or a modal is clamped the
     * same way, and which one actually scrolls depends on the caller.
     */
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const ancestors: { node: HTMLElement; top: number }[] = [];
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight) {
        ancestors.push({ node: n, top: n.scrollTop });
      }
    }

    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;

    // Innermost first, then the page. Assigning only when it actually moved
    // keeps this a no-op in the common case where nothing was clamped.
    for (const a of ancestors) {
      if (a.node.scrollTop !== a.top) a.node.scrollTop = a.top;
    }
    if (window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
  }, []);

  // Fit on mount and whenever the value changes programmatically.
  useIsomorphicLayoutEffect(() => {
    resize();
  }, [resize, props.value]);

  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  return (
    <textarea
      ref={ref}
      {...rest}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      style={{ ...style, overflow: 'hidden', resize: 'none' }}
    />
  );
}
