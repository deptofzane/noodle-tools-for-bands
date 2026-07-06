'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTrackPending } from '../PendingActionProvider';
import { actorLabel, formatRelativeTime } from '@/lib/format';

/**
 * History list — closed conversations only.
 *
 * Fetches /api/conversations/annotated?filter=closed. Read-only: opening
 * a conversation doesn't reopen it (only an explicit Reopen does).
 */

interface ConversationListItem {
  conversationId: string;
  bandName: string;
  audioFileName: string | null;
  lastActivityAt: string;
  lastActivityBy: { name: string | null; email: string | null } | null;
}

export function HistoryList() {
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void trackPending(async () => {
      try {
        const r = await fetch('/api/conversations/annotated?filter=closed', {
          cache: 'no-store',
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { conversations: ConversationListItem[] };
        if (!cancelled) setItems(data.conversations);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trackPending]);

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Nothing in history yet. Conversations show up here when you close
        them from the notes page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        {items.length} closed{' '}
        {items.length === 1 ? 'conversation' : 'conversations'}
      </p>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {items.map((item) => (
          <li key={item.conversationId}>
            <Link
              href={`/notes/${item.conversationId}`}
              className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {item.audioFileName ?? 'Untitled audio'}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {item.bandName} · Closed · last activity{' '}
                  {formatRelativeTime(item.lastActivityAt)}
                  {item.lastActivityBy && <> by {actorLabel(item.lastActivityBy)}</>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
