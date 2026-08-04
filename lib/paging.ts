/** How many items a paged list loads at a time (History, band notes). */
export const PAGE_SIZE = 30;

/**
 * Read `?limit=`/`?offset=` off a request, clamped. Shared by the History
 * endpoints so one page size governs every category.
 */
export function readWindow(url: URL): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get('limit'));
  const rawOffset = Number(url.searchParams.get('offset'));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, PAGE_SIZE)
      : PAGE_SIZE;
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}

/**
 * Fetch one extra row to learn whether another page exists, then hand back
 * only the page. Cheaper and more honest than a separate count query — and it
 * never shows "Load more" on an exact multiple of the page size.
 */
export function splitPage<T>(
  rows: T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
