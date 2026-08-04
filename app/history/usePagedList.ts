'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureOk } from '@/lib/api';
import { HISTORY_PAGE_SIZE } from './historyPaging';

interface Page<T> {
  items: T[];
  hasMore: boolean;
}

/**
 * One History category's list, a page at a time.
 *
 * The first page loads on mount — which, because each category's panel is only
 * mounted while its tab is open, is what makes the tabs lazy. Later pages come
 * from "Load more" rather than a scroll listener: history is something people
 * dig through deliberately, and an infinite scroll would fetch on their behalf
 * every time they skimmed past the bottom.
 */
export function usePagedList<T>(
  /** Fetches one page. Given the offset; should honor `HISTORY_PAGE_SIZE`. */
  fetchPage: (offset: number) => Promise<Response>,
  /** Pull the rows out of the response body — each category names them. */
  pick: (data: unknown) => T[],
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number): Promise<Page<T> | null> => {
      const res = await fetchPage(offset);
      await ensureOk(res);
      const data = (await res.json()) as { hasMore?: boolean };
      return { items: pick(data), hasMore: data.hasMore === true };
    },
    [fetchPage, pick],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await load(0);
        if (!cancelled && page) {
          setItems(page.items);
          setHasMore(page.hasMore);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || items === null) return;
    setLoadingMore(true);
    try {
      const page = await load(items.length);
      if (page) {
        // Append rather than replace: the earlier pages are already on screen.
        setItems((prev) => [...(prev ?? []), ...page.items]);
        setHasMore(page.hasMore);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, items, load]);

  return { items, hasMore, loadingMore, error, loadMore, HISTORY_PAGE_SIZE };
}
