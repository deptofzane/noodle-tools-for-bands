/**
 * Orphan sweep: delete objects in the bucket that no longer have a
 * matching `song_files` row. Object deletes on song/band removal are
 * best-effort (not transactional with the DB), so run this occasionally
 * to reclaim leaked objects.
 *
 *   node --env-file=.env.local scripts/r2-sweep.mjs          # dry run
 *   node --env-file=.env.local scripts/r2-sweep.mjs --delete # actually delete
 */
import pg from 'pg';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

const { Client } = pg;
const doDelete = process.argv.includes('--delete');

function pgSslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return false;
  return {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

async function main() {
  const bucket = process.env.S3_BUCKET;
  if (!process.env.DATABASE_URL || !bucket) {
    console.error('[sweep] DATABASE_URL and S3_BUCKET are required');
    process.exit(1);
  }

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });

  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: pgSslConfig(),
  });
  await db.connect();

  try {
    const { rows } = await db.query(
      `select storage_key from song_files where storage_key is not null`,
    );
    const known = new Set(rows.map((r) => r.storage_key));

    const orphans = [];
    let token;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'conversations/',
          ContinuationToken: token,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key && !known.has(obj.Key)) orphans.push(obj.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    console.log(`[sweep] ${orphans.length} orphan object(s)`);
    orphans.forEach((k) => console.log(`  ${k}`));

    if (doDelete && orphans.length > 0) {
      for (let i = 0; i < orphans.length; i += 1000) {
        const batch = orphans.slice(i, i + 1000);
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
      console.log(`[sweep] deleted ${orphans.length} object(s)`);
    } else if (orphans.length > 0) {
      console.log('[sweep] dry run — pass --delete to remove them');
    }
  } finally {
    await db.end();
    s3.destroy();
  }
}

main().catch((err) => {
  console.error('[sweep] failed', err);
  process.exit(1);
});
