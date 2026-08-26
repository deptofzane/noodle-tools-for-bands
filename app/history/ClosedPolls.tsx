'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { formatTimeAgoOrDate } from '@/lib/format';
import { LoadingBlock } from '../Spinner';
import { PAGE_SIZE } from '@/lib/paging';
import { LoadMore } from '../LoadMore';
import { usePagedList } from '../usePagedList';

interface ClosedPoll {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  description: string | null;
  closedAt: string;
  voted: boolean;
}

/**
 * Closed polls across the viewer's bands, most recently closed first. Whether
 * they voted is called out: a decision you sat out is the one you'd come here
 * to read.
 */
export function ClosedPolls() {
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(`/api/history?category=polls&limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: 'no-store',
      }),
    [],
  );
  const pick = useCallback(
    (d: unknown) => (d as { polls: ClosedPoll[] }).polls,
    [],
  );
  const { items, hasMore, loadingMore, error, loadMore } =
    usePagedList<ClosedPoll>(fetchPage, pick);

  if (error)
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  if (items === null) return <LoadingBlock label="Loading closed polls" />;
  if (items.length === 0)
    return (
      <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
        No closed polls yet. A poll lands here once someone closes it.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <LoadMore
        shown={items.length}
        noun="closed poll"
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={() => void loadMore()}
      />
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((poll) => (
          <li key={poll.id}>
            <Link
              href={`/bands/${poll.bandId}/polls/${poll.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-soft md:px-3 md:py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{poll.title}</div>
                <div className="mt-0.5 text-xs minor-text-theme-colors">
                  {poll.bandName} · closed {formatTimeAgoOrDate(poll.closedAt)}
                  {!poll.voted && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-amber-700 dark:text-amber-500">
                        you didn’t vote
                      </span>
                    </>
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
