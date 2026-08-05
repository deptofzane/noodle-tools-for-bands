'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { usePersistedBoolean } from '../usePersistedBoolean';
import { Spinner } from '../Spinner';
import { NotificationPlayButton } from './NotificationPlayButton';
import { isPlayableNotification } from './notificationTracks';

export interface NotificationItem {
  id: string;
  kind:
    | 'song-comment'
    | 'chat-message'
    | 'event-added'
    | 'song-updated'
    | 'event-updated'
    | 'band-updated'
    | 'poll-created'
    | 'poll-closed'
    | 'poll-updated'
    | 'poll-cancelled'
    | 'poll-auto-closed'
    | 'setlist-created'
    | 'audio-added'
    | 'song-created';
  subjectType: 'conversation' | 'event' | 'band' | 'poll' | 'setlist';
  subjectId: string | null;
  subjectLabel: string | null;
  /** Upload rollups only: the day they cover. */
  day: string | null;
  bandId: string;
  bandName: string | null;
  actorName: string | null;
  createdAt: string;
  unread: boolean;
  isSelf: boolean;
}

const POLL_INTERVAL_MS = 60_000;

function hrefFor(n: NotificationItem): string {
  switch (n.subjectType) {
    case 'conversation':
      if (n.subjectId) return `/notes/${n.subjectId}`;
      // An upload rollup: the day's own page lists exactly what it counted.
      return n.day
        ? `/bands/${n.bandId}/audio/uploads/${n.day}`
        : `/bands/${n.bandId}/audio`;
    case 'event':
      // Shows live on the band page (and the calendar); land on the band.
      return `/bands/${n.bandId}`;
    case 'band':
      return n.kind === 'chat-message'
        ? `/bands/${n.bandId}?tab=chat`
        : `/bands/${n.bandId}`;
    case 'poll':
      return n.subjectId
        ? `/bands/${n.bandId}/polls/${n.subjectId}`
        : `/bands/${n.bandId}`;
    case 'setlist':
      return n.subjectId
        ? `/bands/${n.bandId}/setlists/${n.subjectId}`
        : `/bands/${n.bandId}`;
  }
}

function messageFor(n: NotificationItem): string {
  const who = n.isSelf ? 'You' : (n.actorName ?? 'Someone');
  const band = n.bandName ?? 'the band';
  switch (n.kind) {
    case 'song-comment':
      return `${who} commented on ${n.subjectLabel ?? 'a song'}`;
    case 'chat-message':
      return `${who} posted in ${band} chat`;
    case 'event-added':
      return `${who} added an event: ${n.subjectLabel ?? 'Untitled'}`;
    case 'song-updated':
      return `${who} updated ${n.subjectLabel ?? 'a song'}`;
    case 'event-updated':
      return `${who} updated the event: ${n.subjectLabel ?? 'Untitled'}`;
    case 'band-updated':
      return `${who} updated ${band}${n.subjectLabel ? ` (${n.subjectLabel})` : ''}`;
    case 'poll-created':
      return `${who} started a poll: ${n.subjectLabel ?? 'Untitled'}`;
    case 'poll-closed':
      return `${who} closed the poll: ${n.subjectLabel ?? 'Untitled'}`;
    case 'poll-cancelled':
      return `${who} cancelled the poll: ${n.subjectLabel ?? 'Untitled'}`;
    case 'poll-auto-closed':
      return `Everyone voted — the poll closed automatically: ${n.subjectLabel ?? 'Untitled'}`;
    case 'poll-updated':
      return `${who} updated the poll: ${n.subjectLabel ?? 'Untitled'}`;
    case 'setlist-created':
      return `${who} created a setlist: ${n.subjectLabel ?? 'Untitled'}`;
    case 'audio-added':
      return `${who} added audio: ${n.subjectLabel ?? 'Untitled'}`;
    case 'song-created':
      return `${who} created a song: ${n.subjectLabel ?? 'Untitled'}`;
  }
}

/**
 * Merge notification pages by id, newest first. Existing items win over
 * incoming duplicates, so their current read/unread highlight is preserved
 * across a refresh; genuinely new (or older, paged-in) items are added.
 */
function mergeByNewest(
  existing: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt
      ? 1
      : a.createdAt > b.createdAt
        ? -1
        : a.id < b.id
          ? 1
          : a.id > b.id
            ? -1
            : 0,
  );
}

/**
 * Home notification feed. Server-rendered with the first page; then marks
 * the feed read (so it stays "caught up") and polls for new activity.
 * Unread items from the initial load stay highlighted for this view. The
 * section is collapsible (persisted) and pages back through older
 * notifications on demand.
 */
export function NotificationList({
  initial,
  initialUnread,
  initialCursor,
}: {
  initial: NotificationItem[];
  initialUnread: number;
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [minimized, setMinimized] = usePersistedBoolean(
    'homeNotificationsMinimized',
    false,
  );

  const markRead = useCallback(async () => {
    // Let the nav badge clear immediately, before the request resolves.
    window.dispatchEvent(new Event('notifications:read'));
    await fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/notifications', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      notifications: NotificationItem[];
      unreadCount: number;
    };
    // Merge the newest page into what's shown so any older pages the user
    // loaded survive the poll; the load-older cursor is left untouched.
    setItems((prev) => mergeByNewest(prev, data.notifications));
    setUnread(data.unreadCount);
    if (data.unreadCount > 0) void markRead();
  }, [markRead]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(cursor)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        nextCursor: string | null;
      };
      setItems((prev) => mergeByNewest(prev, data.notifications));
      setCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  // Clear the unread marker on view (keeps the current highlights), then
  // poll for new activity while the tab is visible.
  useEffect(() => {
    if (initialUnread > 0) void markRead();
  }, [initialUnread, markRead]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMinimized((v) => !v)}
          aria-expanded={!minimized}
          aria-label={
            minimized ? 'Expand Notifications' : 'Minimize Notifications'
          }
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {minimized ? '▸' : '▾'}
          </span>
          <h2 className="text-sm font-medium">Notifications</h2>
        </button>
        {unread > 0 && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[0.625rem] font-semibold text-white">
            {unread} new
          </span>
        )}
      </div>

      {!minimized &&
        (items.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No notifications yet. Activity from your bands shows up here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={
                    'flex items-center gap-2 pr-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 ' +
                    (n.unread ? 'bg-blue-50/50 dark:bg-blue-950/20' : '')
                  }
                >
                  <Link
                    href={hrefFor(n)}
                    className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full ' +
                        (n.unread ? 'bg-blue-600' : 'bg-transparent')
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm">{messageFor(n)}</span>
                      <span className="text-[0.6875rem] text-neutral-400">
                        {n.bandName ? `${n.bandName} · ` : ''}
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                  </Link>
                  {isPlayableNotification(n) && (
                    <NotificationPlayButton
                      notification={n}
                      bandId={n.bandId}
                    />
                  )}
                </li>
              ))}
            </ul>
            {cursor && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                // Fixed min-width so swapping the label for the spinner
                // doesn't make the button jump.
                className="flex min-w-[6.5rem] items-center justify-center self-center rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                {loadingMore ? (
                  <Spinner size="xs" label="Loading older notifications" />
                ) : (
                  'Load older'
                )}
              </button>
            )}
          </>
        ))}
    </section>
  );
}
