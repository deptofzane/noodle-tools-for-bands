/**
 * Client-side "download a setlist for offline use". Fetches everything the
 * Practice/Live views need — each song's sheet-music versions + file bytes,
 * and the two page shells — while online, so the service worker's caching
 * rules (see app/sw.ts) store them. Offline, those views then resolve from
 * cache with no network.
 *
 * A small IndexedDB record tracks what's been downloaded (for the UI badge and
 * "remove"). Everything here is browser-only; call from client components.
 */

const DB_NAME = 'sidestage-offline';
const STORE = 'setlists';
const PAGES_CACHE = 'sidestage-pages'; // must match app/sw.ts

export interface OfflineRecord {
  setlistId: string;
  bandId: string;
  name: string;
  /** Playable songs (markers excluded) that were downloaded. */
  songCount: number;
  /** Sheet-music files successfully cached across all songs. */
  fileCount: number;
  /** Epoch ms of the last successful download. */
  downloadedAt: number;
}

export interface OfflineSong {
  conversationId: string | null;
  name: string;
}

// ---- tiny IndexedDB helpers (no dependency) --------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'setlistId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function listOfflineSetlists(): Promise<OfflineRecord[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    return (await tx<OfflineRecord[]>('readonly', (s) => s.getAll())) ?? [];
  } catch {
    return [];
  }
}

async function putRecord(rec: OfflineRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
}

async function deleteRecord(setlistId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(setlistId));
}

// ---- download / remove -----------------------------------------------------

interface SheetVersion {
  id: string;
  updatedAt: string;
}

/**
 * Download a setlist for offline use. Reports coarse progress (0..1) as it
 * works through the songs. Best-effort per file: a song whose sheets fail to
 * fetch simply contributes fewer cached files rather than aborting the whole
 * download.
 */
export async function downloadSetlistOffline(input: {
  bandId: string;
  setlistId: string;
  name: string;
  songs: OfflineSong[];
  onProgress?: (fraction: number) => void;
}): Promise<OfflineRecord> {
  const { bandId, setlistId, name, songs, onProgress } = input;

  // Ask the browser to keep this data through storage pressure (esp. iOS).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // best-effort
  }

  const playable = songs.filter((s) => s.conversationId);
  // Two extra steps for the page shells.
  const total = playable.length + 2;
  let step = 0;
  const tick = () => onProgress?.(++step / total);

  // Cache the page shells so a hard navigation / PWA launch works offline.
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache
      .add(`/bands/${bandId}/setlists/${setlistId}/practice`)
      .catch(() => {});
    tick();
    await cache
      .add(`/bands/${bandId}/setlists/${setlistId}/practice/live`)
      .catch(() => {});
    tick();
  } catch {
    step = 2;
    onProgress?.(step / total);
  }

  let fileCount = 0;
  for (const song of playable) {
    const cid = song.conversationId!;
    try {
      const vres = await fetch(
        `/api/conversations/${cid}/sheet-music-versions`,
        { cache: 'no-store' },
      );
      if (vres.ok) {
        const { versions } = (await vres.json()) as { versions: SheetVersion[] };
        for (const v of versions) {
          const url = `/api/conversations/${cid}/files/sheet_music?version=${v.id}&v=${encodeURIComponent(
            v.updatedAt,
          )}`;
          try {
            const fres = await fetch(url);
            if (fres.ok) fileCount++;
          } catch {
            // skip this file
          }
        }
      }
    } catch {
      // skip this song's sheets
    }
    tick();
  }

  const record: OfflineRecord = {
    setlistId,
    bandId,
    name,
    songCount: playable.length,
    fileCount,
    downloadedAt: Date.now(),
  };
  await putRecord(record);
  onProgress?.(1);
  return record;
}

/**
 * Remove a setlist's offline copy: drop its record and evict its cached page
 * shells. Sheet-music file bytes live in a shared, size-bounded cache and are
 * left to normal expiry/LRU rather than reference-counted per setlist.
 */
export async function removeSetlistOffline(input: {
  bandId: string;
  setlistId: string;
}): Promise<void> {
  const { bandId, setlistId } = input;
  await deleteRecord(setlistId);
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(`/bands/${bandId}/setlists/${setlistId}/practice`);
    await cache.delete(`/bands/${bandId}/setlists/${setlistId}/practice/live`);
  } catch {
    // best-effort
  }
}
