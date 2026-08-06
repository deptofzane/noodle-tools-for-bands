'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
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
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  if (items === null) return <LoadingBlock label="Loading closed polls" />;
  if (items.length === 0)
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
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
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {items.map((poll) => (
          <li key={poll.id}>
            <Link
              href={`/bands/${poll.bandId}/polls/${poll.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50 md:px-3 md:py-1.5 dark:hover:bg-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{poll.title}</div>
                <div className="mt-0.5 text-xs minor-text-theme-colors">
                  {poll.bandName} · closed {formatRelativeTime(poll.closedAt)}
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
