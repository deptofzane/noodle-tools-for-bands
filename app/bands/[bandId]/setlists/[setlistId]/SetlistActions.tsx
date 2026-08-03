'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../../ActionMenu';
import { useOfflineDownload } from '../../../../offline/useOfflineDownload';
import type { OfflineSong } from '../../../../offline/offlineSetlists';
import { liveHref, practiceHref } from '@/lib/routes';

/**
 * The setlist's top actions — Practice, Live, and offline download. On desktop
 * they're individual buttons; on mobile they collapse into a single kebab to
 * save room. Both share one offline-download state (so the label/progress stay
 * in sync) and the same choose-what-to-save modal.
 */
export function SetlistActions({
  bandId,
  setlistId,
  name,
  songs,
}: {
  bandId: string;
  setlistId: string;
  name: string;
  songs: OfflineSong[];
}) {
  const router = useRouter();
  const offline = useOfflineDownload();

  const rec = offline.records?.get(setlistId);
  const downloading = offline.busyId === setlistId;
  const target = { bandId, setlistId, name, songs };
  const practice = practiceHref(setlistId);
  const live = liveHref(setlistId);

  const downloadLabel = downloading
    ? `↓ ${Math.round(offline.progress * 100)}%`
    : rec
      ? 'Update offline copy'
      : 'Download';

  return (
    <span className="mt-2 flex shrink-0 items-center justify-end gap-2">
      {/* At-a-glance offline status (all breakpoints — covers the mobile
          kebab, which can't show it while collapsed). */}
      {downloading ? (
        <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400">
          ↓ {Math.round(offline.progress * 100)}%
        </span>
      ) : rec ? (
        <span
          title={`Downloaded ${new Date(rec.downloadedAt).toLocaleString()}`}
          className="text-xs font-medium text-green-600 dark:text-green-500"
        >
          ✓ Offline
        </span>
      ) : null}

      {/* Desktop: individual buttons. */}
      <span className="hidden items-center gap-2 md:flex">
        <Link href={practice} className="btn-outline h-9">
          Practice
        </Link>
        <Link href={live} className="btn-outline h-9">
          Live
        </Link>
        <button
          type="button"
          onClick={() => offline.openDownload(target)}
          title={
            rec
              ? `Downloaded ${new Date(rec.downloadedAt).toLocaleString()}`
              : undefined
          }
          className="btn-outline h-9"
        >
          {downloadLabel}
        </button>
        {rec && !downloading && (
          <button
            type="button"
            onClick={() => void offline.remove({ bandId, setlistId, name })}
            className="btn-ghost h-9"
          >
            Remove offline copy
          </button>
        )}
      </span>

      {/* Mobile: one kebab holding all three. */}
      <span className="md:hidden">
        <ActionMenu label="Setlist actions">
          <ActionMenuItem onClick={() => router.push(practice)}>
            Practice
          </ActionMenuItem>
          <ActionMenuItem onClick={() => router.push(live)}>
            Live
          </ActionMenuItem>
          {rec ? (
            <>
              <ActionMenuItem onClick={() => offline.openDownload(target)}>
                {downloading ? 'Downloading…' : 'Update offline copy'}
              </ActionMenuItem>
              <ActionMenuItem
                onClick={() => void offline.remove({ bandId, setlistId, name })}
              >
                Remove offline copy
              </ActionMenuItem>
            </>
          ) : (
            <ActionMenuItem onClick={() => offline.openDownload(target)}>
              {downloading ? 'Downloading…' : 'Download for offline'}
            </ActionMenuItem>
          )}
        </ActionMenu>
      </span>

      {offline.modal}
    </span>
  );
}
