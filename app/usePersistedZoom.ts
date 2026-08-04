'use client';

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { PreviewKind } from '@/lib/sheet-preview';
import { useIsDesktop } from './useIsDesktop';

const STORAGE_KEY = 'sheetZoomByKey';
export const ZOOM_DEFAULT = 100;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 400;

/** Starting zoom for page-shaped sheets (PDF, image) on a desktop viewport. */
export const DESKTOP_PAGE_ZOOM = 70;

/**
 * The zoom a sheet of this kind starts at before the song has one of its own —
 * pass it to `usePersistedZoom` as the fallback. Pages and images start at 70%
 * on desktop: they're sized for a full sheet of paper, and at 100% one fills
 * the view past what fits on screen. Text charts reflow, so they stay at 100%;
 * so does mobile, where the screen is already narrow. Shared by Practice and
 * Live so a song looks the same in both.
 */
export function useDefaultSheetZoom(kind: PreviewKind | null): number {
  const isDesktop = useIsDesktop();
  return isDesktop && (kind === 'pdf' || kind === 'image')
    ? DESKTOP_PAGE_ZOOM
    : ZOOM_DEFAULT;
}

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
 *
 * `fallback` is the zoom to use until the song has one of its own — callers
 * vary it by what they're showing (a PDF page wants less than a lyric sheet).
 * Changing it never overwrites a stored zoom.
 */
export function usePersistedZoom(
  key: string | null,
  fallback: number = ZOOM_DEFAULT,
): [number, Dispatch<SetStateAction<number>>] {
  const [map, setMap] = useState<Record<string, number>>({});

  // Hydrate after mount (SSR-safe).
  useEffect(() => {
    setMap(loadMap());
  }, []);

  const zoom = (key ? map[key] : undefined) ?? fallback;

  const setZoom = useCallback<Dispatch<SetStateAction<number>>>(
    (value) => {
      if (!key) return;
      setMap((prev) => {
        // A relative change (the +/- buttons) steps from whatever is on
        // screen, which is the fallback until this song has its own zoom.
        const cur = prev[key] ?? fallback;
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
    [key, fallback],
  );

  return [zoom, setZoom];
}
