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

import { practiceSongsApi } from '@/lib/routes';

const DB_NAME = 'sidestage-offline';
const STORE = 'setlists';
/** Legacy: per-setlist Practice/Live documents from before the shared shells. */
const PAGES_CACHE = 'sidestage-pages'; // must match app/sw.ts
const DATA_CACHE = 'sidestage-meta'; // must match app/sw.ts
const SHEET_CACHE = 'sidestage-files'; // must match app/sw.ts
const AUDIO_CACHE = 'sidestage-audio-v2'; // must match app/sw.ts

const CHOICES_KEY = 'offline:downloadChoices';

/**
 * The content caches a URL belongs to (or null if it isn't cached content).
 * Mirrors the service worker's matchers in app/sw.ts.
 */
function contentCacheForUrl(url: string): string | null {
  if (/\/files\/sheet_music/.test(url)) return SHEET_CACHE;
  if (/\/files\/audio/.test(url)) return AUDIO_CACHE;
  return null;
}

/**
 * The user's last download choices (sheet music / audio), so the modal opens
 * with those boxes pre-checked. Defaults to sheets-only — the light, on-stage
 * essential; audio is opt-in.
 */
export function readDownloadChoices(): DownloadChoices {
  try {
    const raw = localStorage.getItem(CHOICES_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<DownloadChoices>;
      return { sheets: o.sheets !== false, audio: o.audio === true };
    }
  } catch {
    // ignore malformed / unavailable storage
  }
  return { sheets: true, audio: false };
}

export function writeDownloadChoices(choices: DownloadChoices): void {
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
  } catch {
    // ignore
  }
}

export interface DownloadChoices {
  sheets: boolean;
  audio: boolean;
}

export interface OfflineRecord {
  setlistId: string;
  bandId: string;
  name: string;
  /** Playable songs (markers excluded) that were downloaded. */
  songCount: number;
  /** Sheet-music files successfully cached across all songs. */
  fileCount: number;
  /** Audio files successfully cached across all songs. */
  audioCount: number;
  /**
   * The songs whose audio actually made it into the cache, in setlist order —
   * enough to build a player queue with no network (see the offline screen).
   * Absent on records written before this was tracked; those setlists offer
   * playback again after the next download.
   */
  audioTracks?: { conversationId: string; name: string; url: string }[];
  /** What the user chose to include on the last download. */
  choices: DownloadChoices;
  /**
   * Every content URL (sheet + audio) this setlist cached. Used to evict its
   * bytes on removal — but only those no other downloaded setlist still needs
   * (a song can appear in several setlists). Optional for records written
   * before this was tracked.
   */
  urls?: string[];
  /** Epoch ms of the last successful download. */
  downloadedAt: number;
}

export interface OfflineSong {
  conversationId: string | null;
  name: string;
  /**
   * The default audio version at download time. Cached audio is keyed by
   * version, so saving without one would file the bytes under a URL nothing
   * asks for — see `audioSrc`.
   */
  audioVersionId?: string | null;
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

/**
 * Whether a setlist's songs are in the cache — i.e. whether Practice and Live
 * have anything to open with no network. A record can exist while the data
 * doesn't: caching is best-effort at download time, and a browser under
 * storage pressure can evict it later.
 */
export async function isSetlistDataCached(setlistId: string): Promise<boolean> {
  try {
    const cache = await caches.open(DATA_CACHE);
    const hit = await cache.match(practiceSongsApi(setlistId), {
      ignoreVary: true,
    });
    return hit !== undefined;
  } catch {
    return false;
  }
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
  choices: DownloadChoices;
  onProgress?: (fraction: number) => void;
}): Promise<OfflineRecord> {
  const { bandId, setlistId, name, songs, choices, onProgress } = input;

  // Ask the browser to keep this data through storage pressure (esp. iOS).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // best-effort
  }

  const playable = songs.filter((s) => s.conversationId);
  // One extra step for the setlist's songs.
  const total = playable.length + 1;
  let step = 0;
  const tick = () => onProgress?.(++step / total);

  // The songs themselves. The Practice/Live documents aren't cached here any
  // more — they're precached once per build (see next.config.ts), one document
  // for every setlist, so what's per-setlist is just this data.
  const songsUrl = practiceSongsApi(setlistId);
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.add(songsUrl).catch(() => {});
  } catch {
    // best-effort
  }
  tick();

  let fileCount = 0;
  let audioCount = 0;
  const urls: string[] = [];
  const audioTracks: NonNullable<OfflineRecord['audioTracks']> = [];
  for (const song of playable) {
    const cid = song.conversationId!;

    // Sheet music: every version, keyed by its immutable versioned URL.
    if (choices.sheets) {
      try {
        const vres = await fetch(
          `/api/conversations/${cid}/sheet-music-versions`,
          { cache: 'no-store' },
        );
        if (vres.ok) {
          const { versions } = (await vres.json()) as {
            versions: SheetVersion[];
          };
          for (const v of versions) {
            const url = `/api/conversations/${cid}/files/sheet_music?version=${v.id}&v=${encodeURIComponent(
              v.updatedAt,
            )}`;
            try {
              const fres = await fetch(url);
              if (fres.ok) {
                fileCount++;
                urls.push(url);
              }
            } catch {
              // skip this file
            }
          }
        }
      } catch {
        // skip this song's sheets
      }
    }

    // Audio: the default version, at the same URL the player requests so the
    // cache entry matches — which means naming the version, since that's what
    // the cache keys on. Fetched without a Range header → full 200 body.
    if (choices.audio && song.audioVersionId) {
      try {
        const aurl =
          `/api/conversations/${cid}/files/audio` +
          `?version=${song.audioVersionId}&name=${encodeURIComponent(song.name)}`;
        const ares = await fetch(aurl);
        if (ares.ok) {
          audioCount++;
          urls.push(aurl);
          audioTracks.push({ conversationId: cid, name: song.name, url: aurl });
        }
      } catch {
        // skip this song's audio
      }
    }

    tick();
  }

  const record: OfflineRecord = {
    setlistId,
    bandId,
    name,
    songCount: playable.length,
    fileCount,
    audioCount,
    audioTracks,
    choices,
    urls,
    downloadedAt: Date.now(),
  };
  await putRecord(record);
  onProgress?.(1);
  return record;
}

/**
 * Remove a setlist's offline copy: drop its record, evict its page shells, and
 * evict its sheet/audio bytes — but only those no other downloaded setlist
 * still references (a song can appear in several setlists), so removing one set
 * never breaks another's offline copy.
 */
export async function removeSetlistOffline(input: {
  bandId: string;
  setlistId: string;
}): Promise<void> {
  const { bandId, setlistId } = input;

  // Read all records first so we can reference-count before deleting this one.
  const all = await listOfflineSetlists();
  const record = all.find((r) => r.setlistId === setlistId);
  await deleteRecord(setlistId);

  // This setlist's songs, and the page shells older downloads cached under
  // the old per-setlist URLs. All unique to it, so always safe to drop.
  try {
    const data = await caches.open(DATA_CACHE);
    await data.delete(practiceSongsApi(setlistId));
  } catch {
    // best-effort
  }
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(`/bands/${bandId}/setlists/${setlistId}/practice`);
    await cache.delete(`/bands/${bandId}/setlists/${setlistId}/practice/live`);
  } catch {
    // best-effort
  }

  // Content bytes: delete only URLs no remaining setlist references.
  const mine = record?.urls;
  if (!mine?.length) return;
  const stillReferenced = new Set(
    all.filter((r) => r.setlistId !== setlistId).flatMap((r) => r.urls ?? []),
  );
  const byCache = new Map<string, string[]>();
  for (const url of mine) {
    if (stillReferenced.has(url)) continue;
    const cacheName = contentCacheForUrl(url);
    if (!cacheName) continue;
    const list = byCache.get(cacheName) ?? [];
    list.push(url);
    byCache.set(cacheName, list);
  }
  await Promise.all(
    [...byCache.entries()].map(async ([cacheName, list]) => {
      try {
        const cache = await caches.open(cacheName);
        await Promise.all(list.map((u) => cache.delete(u)));
      } catch {
        // best-effort
      }
    }),
  );
}
