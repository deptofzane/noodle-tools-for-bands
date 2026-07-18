'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A boolean useState that persists to localStorage under `key`. Hydrates from
 * storage after mount (SSR-safe — the server has no localStorage), then writes
 * on every update. Falls back to `initial` when nothing is stored or storage
 * is unavailable (private mode, etc.).
 */
export function usePersistedBoolean(
  key: string,
  initial: boolean,
): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
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
