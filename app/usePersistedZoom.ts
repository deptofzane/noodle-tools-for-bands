'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const STORAGE_KEY = 'sheetZoomByKey';
export const ZOOM_DEFAULT = 100;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 400;

const clamp = (n: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n)));

function loadMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') return obj as Record<string, number>;
    }
  } catch {
    // ignore malformed / unavailable storage
  }
  return {};
}

/**
 * A zoom percent scoped to `key` (e.g. a song's conversation id) and persisted
 * to localStorage, so each song keeps its own zoom and it survives navigating
 * through a setlist and back. Shared across Practice and Live — a song's zoom
 * is a property of the song. `key = null` (e.g. a set-break marker) is
 * non-persistent and always the default. Values are clamped to [50, 400].
 */
export function usePersistedZoom(
  key: string | null,
): [number, Dispatch<SetStateAction<number>>] {
  const [map, setMap] = useState<Record<string, number>>({});

  // Hydrate after mount (SSR-safe).
  useEffect(() => {
    setMap(loadMap());
  }, []);

  const zoom = (key ? map[key] : undefined) ?? ZOOM_DEFAULT;

  const setZoom = useCallback<Dispatch<SetStateAction<number>>>(
    (value) => {
      if (!key) return;
      setMap((prev) => {
        const cur = prev[key] ?? ZOOM_DEFAULT;
        const next = clamp(
          typeof value === 'function'
            ? (value as (z: number) => number)(cur)
            : value,
        );
        if (next === cur) return prev;
        const updated = { ...prev, [key]: next };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [key],
  );

  return [zoom, setZoom];
}
