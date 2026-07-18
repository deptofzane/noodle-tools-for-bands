'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';

export interface NotificationItem {
  id: string;
  kind:
    | 'song-comment'
    | 'chat-message'
    | 'event-added'
    | 'song-updated'
    | 'event-updated'
    | 'band-updated';
  subjectType: 'conversation' | 'event' | 'band';
  subjectId: string | null;
  subjectLabel: string | null;
  bandId: string;
  bandName: string | null;
  actorName: string | null;
  createdAt: string;
  unread: boolean;
}

const POLL_INTERVAL_MS = 60_000;

function hrefFor(n: NotificationItem): string {
  switch (n.subjectType) {
    case 'conversation':
      return n.subjectId ? `/notes/${n.subjectId}` : `/bands/${n.bandId}`;
    case 'event':
      // Shows live on the band page (and the calendar); land on the band.
      return `/bands/${n.bandId}`;
    case 'band':
      return n.kind === 'chat-message'
        ? `/bands/${n.bandId}?tab=chat`
        : `/bands/${n.bandId}`;
  }
}

function messageFor(n: NotificationItem): string {
  const who = n.actorName ?? 'Someone';
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
  }
}

/**
 * Home notification feed. Server-rendered with the first page; then marks
 * the feed read (so it stays "caught up") and polls for new activity.
 * Unread items from the initial load stay highlighted for this view.
 */
export function NotificationList({
  initial,
  initialUnread,
}: {
  initial: NotificationItem[];
  initialUnread: number;
}) {
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [unread, setUnread] = useState(initialUnread);

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
    setItems(data.notifications);
    setUnread(data.unreadCount);
    if (data.unreadCount > 0) void markRead();
  }, [markRead]);

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
        <h2 className="text-sm font-medium">Notifications</h2>
        {unread > 0 && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unread} new
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          No notifications yet. Activity from your bands shows up here.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={hrefFor(n)}
                className={
                  'flex items-start gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900 ' +
                  (n.unread ? 'bg-blue-50/50 dark:bg-blue-950/20' : '')
                }
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
                  <span className="text-[11px] text-neutral-400">
                    {n.bandName ? `${n.bandName} · ` : ''}
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
