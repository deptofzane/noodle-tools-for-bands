'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  downloadSetlistOffline,
  listOfflineSetlists,
  removeSetlistOffline,
  type OfflineRecord,
  type OfflineSong,
} from './offlineSetlists';

export interface OfflineState {
  /** Downloaded setlists keyed by id (null while first loading). */
  records: Map<string, OfflineRecord> | null;
  /** Setlist id currently downloading, plus its 0..1 progress. */
  busyId: string | null;
  progress: number;
  download: (input: {
    bandId: string;
    setlistId: string;
    name: string;
    songs: OfflineSong[];
  }) => Promise<OfflineRecord | null>;
  remove: (input: { bandId: string; setlistId: string }) => Promise<void>;
}

/**
 * Reads which setlists are available offline and exposes download/remove
 * actions with coarse progress. Offline is a browser-only capability, so this
 * returns an empty (but functional) state during SSR and hydrates on mount.
 */
export function useOfflineSetlists(): OfflineState {
  const [records, setRecords] = useState<Map<string, OfflineRecord> | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const refresh = useCallback(async () => {
    const list = await listOfflineSetlists();
    setRecords(new Map(list.map((r) => [r.setlistId, r])));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback<OfflineState['download']>(
    async (input) => {
      if (busyId) return null;
      setBusyId(input.setlistId);
      setProgress(0);
      try {
        const rec = await downloadSetlistOffline({
          ...input,
          onProgress: setProgress,
        });
        await refresh();
        return rec;
      } finally {
        setBusyId(null);
        setProgress(0);
      }
    },
    [busyId, refresh],
  );

  const remove = useCallback<OfflineState['remove']>(
    async (input) => {
      await removeSetlistOffline(input);
      await refresh();
    },
    [refresh],
  );

  return { records, busyId, progress, download, remove };
}
