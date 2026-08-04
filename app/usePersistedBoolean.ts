'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

// Layout effect on the client (applies before the browser paints), plain
// effect on the server (avoids the useLayoutEffect SSR warning).
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * A boolean useState that persists to localStorage under `key`. Falls back to
 * `initial` when nothing is stored or storage is unavailable (private mode).
 *
 * The stored value is read after mount rather than in an initializer, because
 * the server has no localStorage and a differing first render would be a
 * hydration mismatch. It's read in a *layout* effect specifically: an ordinary
 * effect runs after paint, so a section stored as collapsed would flash open
 * on every visit and then snap shut — which looks exactly like the setting
 * wasn't saved at all.
 */
export function usePersistedBoolean(
  key: string,
  initial: boolean,
): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(initial);

  useIsomorphicLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) setValue(saved === '1');
    } catch {
      // ignore
    }
  }, [key]);

  const set = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        try {
          localStorage.setItem(key, next ? '1' : '0');
        } catch {
          // ignore
        }
        return next;
      });
    },
    [key],
  );

  return [value, set];
}
