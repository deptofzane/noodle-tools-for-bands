/**
 * Client-side "seen" state for the Open Conversations badges (IndexedDB).
 *
 * Stores, per conversation (keyed by audio file id), the timestamp the
 * user last opened it. The Open Conversations list compares each
 * conversation's latest activity / mention time against this to decide
 * whether to show a "New" or "Mentioned" badge, and clears the badge by
 * writing `now` when the user opens the conversation.
 *
 * This is deliberately per-device and client-only — no Drive writes, no
 * extra OAuth scope. The documented upgrade for cross-device sync is a
 * per-user read-state file in Drive's appDataFolder.
 *
 * Browser-only. Mirrors the best-effort, degrade-to-empty behavior of
 * `lib/notes-cache.ts`: every operation swallows errors so a storage
 * failure never blocks the UI.
 */

const DB_NAME = 'audio-notes-seen';
const STORE_NAME = 'seen';
const DB_VERSION = 1;

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
 * Read all seen markers as a map of conversationId → epoch ms. Returns
 * an empty map if IndexedDB is unavailable or empty.
 */
export async function readAllSeen(): Promise<Record<string, number>> {
  const db = await openDB();
  if (!db) return {};
  try {
    return await new Promise<Record<string, number>>((resolve) => {
      const out: Record<string, number> = {};
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        const key = cursor.key;
        const val = cursor.value;
        if (typeof key === 'string' && typeof val === 'number') {
          out[key] = val;
        }
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    });
  } finally {
    db.close();
  }
}

/** Mark a conversation as seen as of now (epoch ms). Best-effort. */
export async function markConversationSeen(
  conversationId: string,
): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(Date.now(), conversationId);
  } catch {
    // best-effort
  } finally {
    db.close();
  }
}
