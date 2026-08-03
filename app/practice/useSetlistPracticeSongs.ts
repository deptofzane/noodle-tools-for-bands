'use client';

import { useEffect, useState } from 'react';
import type { PracticeSong } from '../Practice';
import { practiceSongsApi } from '@/lib/routes';

export interface SetlistRef {
  id: string;
  name: string;
  bandId: string;
}

export type SetlistSongsState =
  | { status: 'loading' }
  /** No `?setlist=` in the URL — a truncated or hand-edited link. */
  | { status: 'missing' }
  /** Signed in, but not in the band that owns this setlist. */
  | { status: 'forbidden' }
  | { status: 'gone' }
  /** No network, and this setlist isn't downloaded on this device. */
  | { status: 'offline' }
  | { status: 'ready'; setlist: SetlistRef; songs: PracticeSong[] };

/**
 * A setlist's songs for the Practice/Live screens.
 *
 * Offline this resolves from the service worker's cache when the setlist has
 * been downloaded (see app/sw.ts), which is the whole point of fetching the
 * data rather than rendering it into the page on the server.
 *
 * Access lives here rather than in the route: these screens are public shells,
 * and the endpoint is the guard. A 401 means the link was opened by someone
 * signed out — send them to log in and bring them back to this exact URL,
 * which is how a link shared with a bandmate survives the detour.
 */
export function useSetlistPracticeSongs(
  setlistId: string | null,
): SetlistSongsState {
  const [state, setState] = useState<SetlistSongsState>({ status: 'loading' });

  useEffect(() => {
    if (!setlistId) {
      setState({ status: 'missing' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const res = await fetch(practiceSongsApi(setlistId), {
          cache: 'no-store',
        });
        if (cancelled) return;

        if (res.status === 401) {
          const back = window.location.pathname + window.location.search;
          window.location.replace(
            `/login?callbackUrl=${encodeURIComponent(back)}`,
          );
          return;
        }
        if (res.status === 403) return setState({ status: 'forbidden' });
        if (!res.ok) return setState({ status: 'gone' });

        const data = (await res.json()) as {
          setlist: SetlistRef;
          songs: PracticeSong[];
        };
        if (!cancelled) setState({ status: 'ready', ...data });
      } catch {
        // No response at all: offline with nothing cached for this setlist.
        if (!cancelled) setState({ status: 'offline' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setlistId]);

  return state;
}
