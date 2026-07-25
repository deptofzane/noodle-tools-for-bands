'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * A position index (like the current song in a setlist) that persists to
 * localStorage under `key`, so leaving and returning to Practice/Live restores
 * the last item viewed. SSR-safe: starts at 0, then restores after mount
 * (avoiding a hydration mismatch). Pass `key = null` to disable persistence
 * (e.g. a single-item list). A stored index past `count` is ignored.
 */
export function usePersistedIndex(
  key: string | null,
  count: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [index, setIndex] = useState(0);
  const storageKey = key ? `setlistPos:${key}` : null;
  // Skip persisting the initial mount value so it can't clobber a stored one
  // before the restore effect runs.
  const skipWrite = useRef(true);

  // Restore once on mount.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= 0 && n < count) setIndex(n);
      }
    } catch {
      // ignore unavailable storage
    }
    // Restore is a mount-time action; `count`/`storageKey` are stable per view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change (after the initial mount).
  useEffect(() => {
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(index));
    } catch {
      // ignore
    }
  }, [index, storageKey]);

  return [index, setIndex];
}
