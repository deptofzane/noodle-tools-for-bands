'use client';

import { useEffect, useState } from 'react';
import { listOfflineSetlists, type OfflineRecord } from './offlineSetlists';
import { usePlaylistPlayer } from '../player/PlaylistPlayer';
import { LoadingBlock } from '../Spinner';

/** What a downloaded setlist can still do without a network. */
function capabilities(rec: OfflineRecord): string[] {
  const parts: string[] = [];
  if (rec.fileCount > 0)
    parts.push(`${rec.fileCount} sheet${rec.fileCount === 1 ? '' : 's'}`);
  if (rec.audioCount > 0)
    parts.push(
      `${rec.audioCount} audio file${rec.audioCount === 1 ? '' : 's'}`,
    );
  return parts;
}

/**
 * The offline screen: what's still usable with no network. Everything here
 * comes from IndexedDB and the cache — it makes no requests of its own, which
 * is what lets the service worker serve it as the fallback for any navigation
 * that fails.
 *
 * The setlist links are plain `<a>`, deliberately: a client-side `<Link>`
 * navigation fetches an RSC payload, which has nothing to fall back on
 * offline. A hard navigation goes through the service worker, which serves the
 * Practice/Live shell that "Download for offline" cached.
 */
export function OfflineClient() {
  const player = usePlaylistPlayer();
  const [records, setRecords] = useState<OfflineRecord[] | null>(null);
  // Starts true so the server-rendered (and precached) markup is stable; the
  // real value lands on mount.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    void listOfflineSetlists().then((list) =>
      setRecords([...list].sort((a, b) => b.downloadedAt - a.downloadedAt)),
    );
  }, []);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="title-text">
          {online ? 'Downloaded setlists' : 'You’re offline'}
        </h1>
        <p className="text-sm text-neutral-500">
          {online
            ? 'These setlists are saved on this device, so they keep working when the network doesn’t.'
            : 'No connection, so the rest of the app is out of reach. These setlists are saved on this device and still work.'}
        </p>
      </div>

      {records === null ? (
        <LoadingBlock label="Loading downloads" />
      ) : records.length === 0 ? (
        <div className="rounded-md border border-neutral-200 px-3 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          <p>Nothing is downloaded on this device.</p>
          <p className="mt-1">
            {online
              ? 'Open a setlist and choose “Download for offline” to keep it here.'
              : 'Once you’re back online, open a setlist and choose “Download for offline”.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((rec) => {
            const base = `/bands/${rec.bandId}/setlists/${rec.setlistId}/practice`;
            const parts = capabilities(rec);
            return (
              <li
                key={rec.setlistId}
                className="flex flex-col gap-3 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{rec.name}</span>
                  <span className="text-xs text-neutral-500">
                    {rec.songCount} song{rec.songCount === 1 ? '' : 's'}
                    {parts.length > 0 && ` · ${parts.join(' · ')}`}
                  </span>
                  {parts.length === 0 && (
                    <span className="text-xs text-amber-700 dark:text-amber-500">
                      No sheet music or audio was saved for this one.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={base} className="btn-outline">
                    Practice
                  </a>
                  <a href={`${base}/live`} className="btn-outline">
                    Live
                  </a>
                  {/* The cached bytes are what the player streams, so this
                      works with no network. */}
                  {rec.audioTracks && rec.audioTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        player.play(
                          rec.audioTracks!.map((t) => ({
                            id: t.conversationId,
                            title: t.name,
                            src: t.url,
                            fileName: t.name,
                            subtitle: rec.name,
                          })),
                          0,
                        )
                      }
                      className="btn-outline"
                    >
                      Play audio
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!online && (
        <p className="text-xs text-neutral-500">
          Anything else will be here when the connection is.
        </p>
      )}
    </div>
  );
}
