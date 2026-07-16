/**
 * Concurrency guard for uploads.
 *
 * Upload handlers buffer the whole file into memory (`file.arrayBuffer()` /
 * a Drive download) before streaming it to object storage, so N concurrent
 * large uploads cost ~N × file-size in RAM. This caps how many run at once,
 * bounding peak memory on a small instance. Queued uploads wait rather than
 * fail. Node-only; a single-process, in-memory guard (stashed on globalThis
 * so dev hot-reload doesn't spawn duplicates).
 */

import { Readable } from 'node:stream';

interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** A multipart-upload `File` as a Node Readable, for streaming to storage. */
export function fileToNodeStream(file: File): Readable {
  return Readable.fromWeb(
    file.stream() as Parameters<typeof Readable.fromWeb>[0],
  );
}

function createSemaphore(max: number): Semaphore {
  let available = max;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> =>
    new Promise((resolve) => {
      if (available > 0) {
        available -= 1;
        resolve();
      } else {
        queue.push(resolve);
      }
    });

  const release = (): void => {
    const next = queue.shift();
    if (next) next(); // hand the token straight to the next waiter
    else available += 1;
  };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

// Peak upload memory ≈ MAX_CONCURRENT × max file size. With audio capped at
// 50 MB that's ~150 MB, comfortably within a small instance.
const MAX_CONCURRENT_UPLOADS = 3;

const globalForUploads = globalThis as unknown as {
  __uploadLimit?: Semaphore;
};

export const uploadLimit: Semaphore =
  globalForUploads.__uploadLimit ??
  (globalForUploads.__uploadLimit = createSemaphore(MAX_CONCURRENT_UPLOADS));
