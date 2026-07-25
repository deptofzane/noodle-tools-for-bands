'use client';

import { useOfflineDownload } from '../../../../offline/useOfflineDownload';
import type { OfflineSong } from '../../../../offline/offlineSetlists';

/**
 * Offline control for the setlist detail page: a button reflecting the offline
 * state (Download / ↓ progress / ✓ Offline) that opens the shared choose-what-
 * to-save modal, plus a Remove action once downloaded. Same wiring as the
 * Setlists-tab kebab, via the shared `useOfflineDownload` hook.
 */
export function SetlistOfflineButton({
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
  const offline = useOfflineDownload();
  const rec = offline.records?.get(setlistId);
  const downloading = offline.busyId === setlistId;
  const target = { bandId, setlistId, name, songs };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => offline.openDownload(target)}
        title={
          rec
            ? `Downloaded ${new Date(rec.downloadedAt).toLocaleString()}`
            : undefined
        }
        className="btn-outline h-12 md:h-9"
      >
        {downloading
          ? `↓ ${Math.round(offline.progress * 100)}%`
          : rec
            ? '✓ Offline'
            : 'Download'}
      </button>
      {rec && !downloading && (
        <button
          type="button"
          onClick={() => void offline.remove({ bandId, setlistId, name })}
          className="btn-ghost h-12 md:h-9"
        >
          Remove
        </button>
      )}
      {offline.modal}
    </span>
  );
}
