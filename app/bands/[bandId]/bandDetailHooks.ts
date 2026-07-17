'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useEventSource } from '../../useEventSource';
import type { Conversation, Member, Setlist, Show } from './bandDetailShared';

export interface BandDetail {
  band: { id: string; name: string };
  members: Member[];
  myRole: 'owner' | 'member';
}

/**
 * Loads the band's detail, conversations, setlists, and events in one shot.
 * Returns the data plus a `reload` used after mutations. The initial load runs
 * through the pending tracker so the global busy indicator reflects it.
 */
export function useBandData(bandId: string) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  const reload = useCallback(async () => {
    try {
      const [detailRes, convRes, setlistRes, eventRes] = await Promise.all([
        fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/conversations`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/events`, { cache: 'no-store' }),
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
      if (eventRes.ok) {
        const ed = (await eventRes.json()) as { events: Show[] };
        setShows(ed.events);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => reload());
  }, [reload, trackPending]);

  return { data, conversations, setlists, shows, error, reload };
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
