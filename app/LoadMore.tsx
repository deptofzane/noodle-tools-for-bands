'use client';

/** The shared footer under a History list: a count, and more if there is more. */
export function LoadMore({
  shown,
  noun,
  hasMore,
  loading,
  onLoadMore,
}: {
  shown: number;
  /** Singular noun for the category, e.g. "closed poll". */
  noun: string;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-neutral-500">
        {/* No total: counting the whole table to render a number nobody asked
            for costs a second query on every page. */}
        {shown} {shown === 1 ? noun : `${noun}s`}
        {hasMore && ' so far'}
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="btn-outline"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
