/**
 * Create the object-storage bucket if it doesn't exist. Idempotent.
 * For local MinIO setup and CI. Run with the env loaded:
 *
 *   node --env-file=.env.local scripts/s3-init.mjs
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error('[s3-init] S3_BUCKET not set');
  process.exit(1);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'auto',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`[s3-init] bucket "${bucket}" already exists`);
} catch {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`[s3-init] created bucket "${bucket}"`);
}
