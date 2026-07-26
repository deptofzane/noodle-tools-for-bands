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
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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
