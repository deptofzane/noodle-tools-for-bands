'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useEventSource } from '../../useEventSource';
import type {
  Conversation,
  Member,
  Setlist,
  Show,
  Venue,
} from './bandDetailShared';

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
 * Band-chat unread state, backed by a single SSE connection. Emits a
 * `chatChange` signal on activity (passed to BandChat) and keeps `unread`
 * current: marked read while the Chat tab is active, refetched otherwise.
 */
export function useBandChat(bandId: string, activeTab: string) {
  const [chatChange, setChatChange] = useState(0);
  const [unread, setUnread] = useState<{ count: number; mentioned: boolean }>({
    count: 0,
    mentioned: false,
  });

  // One SSE stream for chat activity, shared by the unread badge and the Chat
  // tab, so the page holds a single connection rather than one per consumer.
  useEventSource(`/api/bands/${bandId}/messages/events`, {
    change: () => setChatChange((c) => c + 1),
  });

  const fetchUnread = useCallback(async () => {
    const res = await fetch(`/api/bands/${bandId}/messages/unread`, {
      cache: 'no-store',
    });
    if (res.ok) setUnread(await res.json());
  }, [bandId]);

  const markChatRead = useCallback(async () => {
    setUnread({ count: 0, mentioned: false });
    await fetch(`/api/bands/${bandId}/messages/read`, { method: 'POST' }).catch(
      () => {},
    );
  }, [bandId]);

  // Keep the badge current: mark read while viewing Chat, else refetch the
  // count. Runs on mount, tab switches, and each chat-activity signal.
  useEffect(() => {
    if (activeTab === 'chat') void markChatRead();
    else void fetchUnread();
  }, [activeTab, chatChange, fetchUnread, markChatRead]);

  return { chatChange, unread };
}
