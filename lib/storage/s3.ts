import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3-compatible object storage for song files.
 *
 * Backend-agnostic: works with Cloudflare R2 (production) and MinIO
 * (local dev/tests) via the same S3 API. Configure with:
 *
 *   S3_ENDPOINT           R2: https://<accountid>.r2.cloudflarestorage.com
 *                         MinIO: http://localhost:9000
 *   S3_REGION             "auto" for R2
 *   S3_BUCKET
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   S3_FORCE_PATH_STYLE   "true" for MinIO
 *
 * Node-only (uses the AWS SDK). Import only from Node-runtime routes.
 */

let cached: S3Client | null | undefined;

function isObjectStoreConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY,
  );
}

export function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');
  return bucket;
}

export function getS3Client(): S3Client {
  if (cached) return cached;
  if (!isObjectStoreConfigured()) {
    throw new Error(
      'Object storage is not configured (set S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)',
    );
  }
  cached = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  return cached;
}

/**
 * Object key for one audio version. Audio can have many versions per
 * conversation, so the key carries a per-file id (not the `kind`) to keep
 * each version's bytes distinct.
 */
export function audioVersionKey(
  conversationId: string,
  fileId: string,
): string {
  return `conversations/${conversationId}/audio/${fileId}`;
}

/**
 * Object key for one sheet-music version. Like audio, sheet music can have
 * many versions per conversation, so the key carries a per-file id.
 */
export function sheetVersionKey(
  conversationId: string,
  fileId: string,
): string {
  return `conversations/${conversationId}/sheet_music/${fileId}`;
}

/** Destroy the cached client (closes keep-alive sockets) so scripts/tests exit. */
export function closeObjectStore(): void {
  cached?.destroy();
  cached = null;
}
