import type { ThreadedNote } from '@/lib/notes';

/**
 * Client-side notes cache (IndexedDB).
 *
 * Why this exists: loading notes goes through N Drive fetches (one per
 * collaborator's notes file). On a revisit to the same audio file,
 * users see a "Loading…" spinner for a second or two even when the
 * data hasn't changed. This module caches the merged notes locally,
 * keyed by audio file id, so revisits render instantly while a fresh
 * fetch runs in the background and reconciles.
 *
 * This file is browser-only. Importing from a server component will
 * throw because `indexedDB` is undefined. NotesPanel guards by using
 * dynamic imports / checking `typeof window`.
 *
 * Best-effort throughout: every operation swallows errors and degrades
 * to "no cache." We never want a cache failure to block the UI.
 */

const DB_NAME = 'audio-notes';
const STORE_NAME = 'notes';
const DB_VERSION = 1;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

interface CacheEntry {
  notes: ThreadedNote[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/**
 * Read cached notes for the given audio file id. Returns null if no
 * entry exists, the entry has expired, or IndexedDB is unavailable.
 */
export async function readCachedNotes(
  fileId: string,
): Promise<ThreadedNote[] | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    return await new Promise<ThreadedNote[] | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(fileId);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) return resolve(null);
        if (Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) return resolve(null);
        resolve(entry.notes);
      };
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

/**
 * Write notes for the given audio file id. Replaces any prior cache
 * entry. Failures are silent — the network fetch is the source of
 * truth, so a missing cache just means a small re-render delay later.
 */
export async function writeCachedNotes(
  fileId: string,
  notes: ThreadedNote[],
): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(
      { notes, cachedAt: Date.now() } satisfies CacheEntry,
      fileId,
    );
  } catch {
    // best-effort
  } finally {
    db.close();
  }
}

/** Invalidate cache for a given file (useful after a known mutation). */
export async function clearCachedNotes(fileId: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(fileId);
  } catch {
    // best-effort
  } finally {
    db.close();
  }
}
