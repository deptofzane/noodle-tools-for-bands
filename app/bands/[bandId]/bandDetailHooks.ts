'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useEventSource } from '../../useEventSource';
import { usePagedList } from '../../usePagedList';
import { PAGE_SIZE } from '@/lib/paging';
import type {
  Conversation,
  Member,
  Setlist,
  Show,
  Venue,
} from './bandDetailShared';
import type { BandUpload } from '@/lib/db/song-files';

export interface BandDetail {
  band: { id: string; name: string };
  members: Member[];
  myRole: 'owner' | 'member';
}

/**
 * Loads the band's detail, setlists, events, and venues in one shot. Returns
 * the data plus a `reload` used after mutations. The initial load runs through
 * the pending tracker so the global busy indicator reflects it.
 */
export function useBandData(bandId: string) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  const reload = useCallback(async () => {
    try {
      const [detailRes, setlistRes, eventRes, venueRes] = await Promise.all([
        fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/events`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/venues`, { cache: 'no-store' }),
      ]);
      await ensureOk(detailRes);
      setData((await detailRes.json()) as BandDetail);
      if (setlistRes.ok) {
        const sd = (await setlistRes.json()) as { setlists: Setlist[] };
        setSetlists(sd.setlists);
      }
      if (eventRes.ok) {
        const ed = (await eventRes.json()) as { events: Show[] };
        setShows(ed.events);
      }
      if (venueRes.ok) {
        const vd = (await venueRes.json()) as { venues: Venue[] };
        setVenues(vd.venues);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => reload());
  }, [reload, trackPending]);

  return { data, setlists, shows, venues, error, reload };
}

/**
 * The Audio page's slice of the same data: the band itself (for the heading
 * and the membership check), its songs, and its setlists (for "Add to
 * setlist"). Same contract as `useBandData` — data plus a `reload`.
 */
export function useBandAudioData(bandId: string) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  const reload = useCallback(async () => {
    try {
      const [detailRes, convRes, setlistRes] = await Promise.all([
        fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/conversations`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' }),
      ]);
      await ensureOk(detailRes);
      setData((await detailRes.json()) as BandDetail);
      if (convRes.ok) {
        const cd = (await convRes.json()) as { conversations: Conversation[] };
        setConversations(cd.conversations);
      }
      if (setlistRes.ok) {
        const sd = (await setlistRes.json()) as { setlists: Setlist[] };
        setSetlists(sd.setlists);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => reload());
  }, [reload, trackPending]);

  return { data, conversations, setlists, error, reload };
}

/**
 * The band's uploads, a page at a time.
 *
 * Deliberately not part of `useBandAudioData`: the list is every audio file
 * the band has ever added and only the Uploads tab reads it, so loading it
 * alongside the other three meant every visit to Songs or Setlists paid for a
 * list nothing on screen was going to show. Called from the tab's own
 * component, which mounts when the tab opens.
 */
export function useBandUploads(bandId: string) {
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/bands/${bandId}/uploads?limit=${PAGE_SIZE}&offset=${offset}`,
        {
          cache: 'no-store',
        },
      ),
    [bandId],
  );
  const pick = useCallback(
    (d: unknown) => (d as { uploads: BandUpload[] }).uploads,
    [],
  );
  return usePagedList<BandUpload>(fetchPage, pick);
}

/**
 * One day's uploads, plus the band they belong to.
 *
 * The day key is the viewer's local day, so it's turned into the pair of
 * instants that bound it here — the server has no way to know which midnight
 * was meant. Asking for the day directly is also what lets this page work for
 * a day older than the Uploads tab has paged back to.
 *
 * The band comes along because the heading names it, and because it's the
 * request that establishes membership: the day list alone would 403 the same
 * way, but this keeps the page's error path identical to every other one.
 */
export function useBandUploadsForDay(bandId: string, day: string) {
  const [band, setBand] = useState<BandDetail | null>(null);
  const [uploads, setUploads] = useState<BandUpload[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `new Date('2026-08-04T00:00:00')` — no zone suffix — is local midnight,
    // which is exactly the boundary `dayKey` grouped on.
    const start = new Date(`${day}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      setUploads([]);
      return;
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const range =
      `from=${encodeURIComponent(start.toISOString())}` +
      `&to=${encodeURIComponent(end.toISOString())}`;

    void (async () => {
      try {
        const [detailRes, uploadRes] = await Promise.all([
          fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
          fetch(`/api/bands/${bandId}/uploads?${range}`, {
            cache: 'no-store',
          }),
        ]);
        await ensureOk(detailRes);
        await ensureOk(uploadRes);
        const detail = (await detailRes.json()) as BandDetail;
        const d = (await uploadRes.json()) as { uploads: BandUpload[] };
        if (!cancelled) {
          setBand(detail);
          setUploads(d.uploads);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bandId, day]);

  return { band, uploads, error };
}

/**
 * Live chat activity for a band, backed by a single SSE connection: a counter
 * that ticks on every change, passed to BandChat as its refetch signal.
 */
export function useBandChatStream(bandId: string): number {
  const [chatChange, setChatChange] = useState(0);

  // One SSE stream for chat activity. It used to be shared with the unread
  // badge on the old Chat tab; now that chat has a page of its own, the badge
  // lives in the header and polls instead (see Header) — it has to work from
  // anywhere in the app, where this connection isn't open.
  useEventSource(`/api/bands/${bandId}/messages/events`, {
    change: () => setChatChange((c) => c + 1),
  });

  // Anyone here is looking at the chat, so mark it read on arrival and after
  // each change, rather than counting toward a badge.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/bands/${bandId}/messages/read`, { method: 'POST' })
      .then(() => {
        // Tell the nav badge to re-count once the marker has actually moved.
        // It covers every band, so it can't just assume zero while this page
        // is open — and polling would leave a stale count on screen for up to
        // a minute after the messages were read. Mirrors `notifications:read`.
        if (!cancelled) window.dispatchEvent(new Event('chat:read'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bandId, chatChange]);

  return chatChange;
}

/**
 * The Chat page's slice of the band: the members it needs for @-mentions and
 * the role that decides who can moderate.
 *
 * Deliberately not `useBandData` — that also pulls setlists, events and
 * venues, none of which chat renders, for the same reason `useBandUploads` is
 * kept separate.
 */
export function useBandChatData(bandId: string) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/bands/${bandId}`, { cache: 'no-store' });
      await ensureOk(res);
      setData((await res.json()) as BandDetail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => reload());
  }, [reload, trackPending]);

  return { data, error, reload };
}
