'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { actorLabel, formatTimeAgoOrDate } from '@/lib/format';
import { LoadingBlock } from '../Spinner';
import { PAGE_SIZE } from '@/lib/paging';
import { LoadMore } from '../LoadMore';
import { usePagedList } from '../usePagedList';
import { useCurrentBand } from '../CurrentBandProvider';

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
  const { bandId } = useCurrentBand();
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/conversations/annotated?filter=closed` +
          `&limit=${PAGE_SIZE}&offset=${offset}` +
          (bandId ? `&bandId=${bandId}` : ''),
        { cache: 'no-store' },
      ),
    [bandId],
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
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((item) => (
          <li key={item.conversationId}>
            <Link
              href={`/notes/${item.conversationId}/practice`}
              className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-surface-soft"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {item.audioFileName ?? 'Untitled audio'}
                </div>
                <div className="mt-0.5 text-xs minor-text-theme-colors">
                  {item.bandName} · Closed · last activity{' '}
                  {formatTimeAgoOrDate(item.lastActivityAt)}
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
