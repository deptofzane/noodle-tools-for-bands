'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import { useToast } from '../ToastProvider';
import { useOfflineSetlists } from './useOfflineSetlists';
import { isStale as computeIsStale, type StaleSetlist } from './staleness';
import {
  readDownloadChoices,
  writeDownloadChoices,
  type OfflineRecord,
  type OfflineSong,
} from './offlineSetlists';

export interface DownloadTarget {
  bandId: string;
  setlistId: string;
  name: string;
  songs: OfflineSong[];
}

export interface OfflineDownloadApi {
  /** Downloaded setlists keyed by id (null while first loading). */
  records: Map<string, OfflineRecord> | null;
  /** Setlist id currently downloading, plus its 0..1 progress. */
  busyId: string | null;
  progress: number;
  /** Open the "choose what to save" modal for a setlist. */
  openDownload: (target: DownloadTarget) => void;
  /** Remove a setlist's offline copy (with a toast). */
  remove: (target: {
    bandId: string;
    setlistId: string;
    name: string;
  }) => Promise<void>;
  /**
   * Whether the saved copy of `setlist` is behind the band's. False when it
   * isn't downloaded, and when the record predates the tracking this reads
   * (see `isStale`) — it reports what it can prove, nothing more.
   *
   * Takes the setlist the caller already has rather than fetching: every
   * surface showing this badge has just loaded it.
   */
  isStale: (setlist: { id: string } & StaleSetlist) => boolean;
  /** Render this once per page — the shared download modal. */
  modal: ReactNode;
}

/**
 * Everything a page needs to offer "Download for offline" on setlists: the
 * offline records (for a status badge), a download action fronted by a
 * pick-sheets-and/or-audio modal (choices persist and pre-check next time),
 * and a remove action. Shared by the Setlists tab and the setlist detail page
 * so the modal and its wiring live in one place.
 */
export function useOfflineDownload(): OfflineDownloadApi {
  const offline = useOfflineSetlists();
  const showToast = useToast();

  const [target, setTarget] = useState<DownloadTarget | null>(null);
  const [sheets, setSheets] = useState(true);
  const [audio, setAudio] = useState(false);

  const openDownload = (t: DownloadTarget) => {
    const c = readDownloadChoices();
    setSheets(c.sheets);
    setAudio(c.audio);
    setTarget(t);
  };

  const confirm = async () => {
    const t = target;
    if (!t || (!sheets && !audio)) return;
    const choices = { sheets, audio };
    writeDownloadChoices(choices);
    setTarget(null);
    try {
      const rec = await offline.download({ ...t, choices });
      if (rec) {
        const parts: string[] = [];
        if (choices.sheets)
          parts.push(`${rec.fileCount} sheet${rec.fileCount === 1 ? '' : 's'}`);
        if (choices.audio)
          parts.push(
            `${rec.audioCount} audio file${rec.audioCount === 1 ? '' : 's'}`,
          );
        showToast(
          `“${t.name}” is available offline (${parts.join(', ')}).`,
          'success',
        );
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (t: {
    bandId: string;
    setlistId: string;
    name: string;
  }) => {
    try {
      await offline.remove(t);
      showToast('Offline copy removed.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const modal = target ? (
    <Modal
      onClose={() => setTarget(null)}
      labelledBy="offline-download-title"
      size="sm"
    >
      <h2 id="offline-download-title" className="text-base font-semibold">
        Download “{target.name}” for offline
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Choose what to save to this device so it works without a connection.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={sheets}
            onChange={(e) => setSheets(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            <span className="font-medium">Sheet music</span>
            <span className="block text-xs minor-text-theme-colors">
              Charts for Live and Practice.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={audio}
            onChange={(e) => setAudio(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            <span className="font-medium">Audio</span>
            <span className="block text-xs minor-text-theme-colors">
              Practice tracks — larger download.
            </span>
          </span>
        </label>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setTarget(null)}
          className="btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!sheets && !audio}
          className="btn-primary"
        >
          Download
        </button>
      </div>
    </Modal>
  ) : null;

  return {
    records: offline.records,
    isStale: (setlist) => {
      const rec = offline.records?.get(setlist.id);
      return rec ? computeIsStale(rec, setlist) : false;
    },
    busyId: offline.busyId,
    progress: offline.progress,
    openDownload,
    remove,
    modal,
  };
}
