'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A `Set<string>` that persists to localStorage under `key` (as a JSON array).
 * Hydrates from storage after mount (SSR-safe — the server has no
 * localStorage), then writes on every change. Use it to remember which items
 * (e.g. expanded rows) a user has toggled, so the choice survives navigating
 * away and back. Starts empty when nothing is stored or storage is unavailable.
 *
 * Returns the current set and a `toggle(id)` that flips membership and persists.
 */
export function usePersistedStringSet(
  key: string,
): [Set<string>, (id: string) => void] {
  const [value, setValue] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr))
          setValue(new Set(arr.filter((x) => typeof x === 'string')));
      }
    } catch {
      // ignore malformed / unavailable storage
    }
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setValue((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [key],
  );

  return [value, toggle];
}
