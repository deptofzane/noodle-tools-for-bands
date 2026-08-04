'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { actorLabel, formatRelativeTime } from '@/lib/format';
import { LoadingBlock } from '../Spinner';
import { HISTORY_PAGE_SIZE } from './historyPaging';
import { LoadMore } from './LoadMore';
import { usePagedList } from './usePagedList';

/**
 * History list — closed conversations only.
 *
 * Fetches /api/conversations/annotated?filter=closed, a page at a time.
 * Read-only: opening a conversation doesn't reopen it (only an explicit
 * Reopen does).
 */

interface ConversationListItem {
  conversationId: string;
  bandName: string;
  audioFileName: string | null;
  lastActivityAt: string;
  lastActivityBy: { name: string | null; email: string | null } | null;
}

export function HistoryList() {
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/conversations/annotated?filter=closed` +
          `&limit=${HISTORY_PAGE_SIZE}&offset=${offset}`,
        { cache: 'no-store' },
      ),
    [],
  );
  const pick = useCallback(
    (d: unknown) =>
      (d as { conversations: ConversationListItem[] }).conversations,
    [],
  );
  const { items, hasMore, loadingMore, error, loadMore } =
    usePagedList<ConversationListItem>(fetchPage, pick);

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <LoadingBlock />;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Nothing in history yet. Conversations show up here when you close them
        from the notes page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <LoadMore
        shown={items.length}
        noun="closed conversation"
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={() => void loadMore()}
      />
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
                  {item.lastActivityBy && (
                    <> by {actorLabel(item.lastActivityBy)}</>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
