'use client';

/**
 * The at-a-glance state of a setlist's offline copy.
 *
 * "Needs update" sits *beside* "✓ Offline" rather than replacing it: the copy
 * still works with no network, which is the thing you most want to know
 * walking into a venue. It's just behind the band's.
 */
export function OfflineBadge({
  downloadedAt,
  stale,
}: {
  downloadedAt: number;
  stale: boolean;
}) {
  return (
    <span
      title={
        stale
          ? 'This setlist changed since you saved it. It still works offline — update to get the current version.'
          : `Downloaded ${new Date(downloadedAt).toLocaleString()}`
      }
      className="flex shrink-0 items-center gap-1 text-xs font-medium mt-1"
    >
      <span className="text-green-600 dark:text-green-500">✓ Offline</span>
      {stale && (
        <>
          <span aria-hidden="true" className="text-neutral-400">
            ·
          </span>
          <span className="text-orange-600 dark:text-orange-500">
            Needs update
          </span>
        </>
      )}
    </span>
  );
}
