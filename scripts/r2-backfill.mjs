/**
 * One-time backfill: move song-file bytes from the legacy Postgres `data`
 * (bytea) column into object storage. Idempotent + resumable — only rows
 * with bytes and no storage_key are processed.
 *
 * Run once, after deploying the object-storage code, before dropping the
 * `data` column:
 *
 *   node --env-file=.env.local scripts/r2-backfill.mjs
 */
import pg from 'pg';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const { Client } = pg;

function pgSslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return false;
  return {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

async function main() {
  const bucket = process.env.S3_BUCKET;
  if (!process.env.DATABASE_URL || !bucket) {
    console.error('[backfill] DATABASE_URL and S3_BUCKET are required');
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
      `select id, conversation_id, kind, mime_type, data
         from song_files
        where data is not null and storage_key is null`,
    );
    console.log(`[backfill] ${rows.length} file(s) to migrate`);

    let done = 0;
    for (const r of rows) {
      const key = `conversations/${r.conversation_id}/${r.kind}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: r.data,
          ContentType: r.mime_type,
          ContentLength: r.data.length,
        }),
      );
      await db.query(
        `update song_files set storage_key = $1, data = null where id = $2`,
        [key, r.id],
      );
      done += 1;
      console.log(`[backfill] ${done}/${rows.length} ${key}`);
    }
    console.log('[backfill] done');
  } finally {
    await db.end();
    s3.destroy();
  }
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
