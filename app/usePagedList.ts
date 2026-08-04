'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureOk } from '@/lib/api';

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
  /** Fetches one page. Given the offset; should honor `PAGE_SIZE`. */
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

  /**
   * (Re)load from the top, discarding any pages already fetched. Used on mount
   * and after a mutation — deleting an item shifts every later offset, so
   * patching the list in place would skip a row on the next "load more".
   */
  const loadFirstPage = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      try {
        const page = await load(0);
        if (!isCancelled() && page) {
          setItems(page.items);
          setHasMore(page.hasMore);
          setError(null);
        }
      } catch (e) {
        if (!isCancelled()) {
          setError(e instanceof Error ? e.message : String(e));
          setItems([]);
        }
      }
    },
    [load],
  );

  useEffect(() => {
    let cancelled = false;
    void loadFirstPage(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadFirstPage]);

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

  return {
    items,
    hasMore,
    loadingMore,
    error,
    loadMore,
    reload: loadFirstPage,
  };
}
