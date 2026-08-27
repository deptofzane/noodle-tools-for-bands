'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTrackPending } from '../PendingActionProvider';
import { actorLabel, formatRelativeTime } from '@/lib/format';
import { LoadingBlock } from '../Spinner';

/**
 * Open Conversations list (Postgres).
 *
 * Fetches /api/conversations/annotated — conversations across all the
 * bands the user belongs to, with server-computed badge state. Badges:
 * "Mentioned" (you were @-tagged since last seen) wins over "New"
 * (activity since last seen). Opening a conversation marks it read
 * server-side, so badges clear on the next visit.
 */

interface ConversationListItem {
  conversationId: string;
  bandName: string;
  audioFileName: string | null;
  closed: boolean;
  lastActivityAt: string;
  lastActivityBy: { name: string | null; email: string | null } | null;
  unread: boolean;
  mentioned: boolean;
}

export function AnnotatedList() {
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackPending = useTrackPending();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void trackPending(async () => {
      try {
        const r = await fetch('/api/conversations/annotated', {
          cache: 'no-store',
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as {
          conversations: ConversationListItem[];
        };
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
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <LoadingBlock />;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
        No open conversations.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map((item) => (
        <li key={item.conversationId}>
          <Link
            href={`/notes/${item.conversationId}/practice`}
            className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-surface-soft"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">
                  {item.audioFileName ?? 'Untitled audio'}
                </span>
                {item.mentioned ? (
                  <span className="shrink-0 rounded bg-warn-fill px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-800 dark:text-amber-300">
                    @ Mentioned
                  </span>
                ) : item.unread ? (
                  <span className="shrink-0 rounded bg-cyan-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                    New
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 text-xs minor-text-theme-colors">
                {item.bandName} · Updated{' '}
                {formatRelativeTime(item.lastActivityAt)}
                {item.lastActivityBy && (
                  <> by {actorLabel(item.lastActivityBy)}</>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
