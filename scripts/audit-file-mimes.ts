/**
 * Audit the MIME type stored on every song file.
 *
 * These files are served inline from our own origin, so a stored `text/html`
 * (or SVG) would have been handed to the browser as an executable document.
 * Ingest now normalizes audio on all three paths, and `resolveContentType`
 * refuses to declare anything off the servable list — but rows written before
 * either check are still whatever they were written as. This finds them.
 *
 * Read-only. It prints remediation SQL for anything it finds; it never writes.
 *
 *   npx tsx scripts/audit-file-mimes.ts                    # .env.local
 *   DATABASE_URL='postgres://…' npx tsx scripts/audit-file-mimes.ts   # prod
 *
 * A real DATABASE_URL in the environment wins over .env.local (dotenv doesn't
 * override), so the second form is safe to point anywhere.
 *
 * Exits 1 when it finds something, so it can gate a deploy if you want it to.
 */
import './load-env';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../lib/db';
import { conversations, songFiles } from '../lib/db/schema';
import { isServableType } from '../lib/serve-mime';

/** The host we're about to read, with any credentials stripped. */
function describeTarget(): string {
  const raw = process.env.DATABASE_URL ?? '';
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  console.log(`Auditing song_files on ${describeTarget()}\n`);

  const rows = await db
    .select({
      id: songFiles.id,
      kind: songFiles.kind,
      mimeType: songFiles.mimeType,
      fileName: songFiles.fileName,
      conversationId: songFiles.conversationId,
      bandId: conversations.bandId,
    })
    .from(songFiles)
    .innerJoin(conversations, eq(conversations.id, songFiles.conversationId));

  // Would have been served as something the browser can execute.
  const dangerous = rows.filter((r) => !isServableType(r.mimeType));
  // Servable, but not what this row claims to be — worth a look, not a hole.
  const mismatched = rows.filter(
    (r) =>
      isServableType(r.mimeType) &&
      r.kind === 'audio' &&
      !r.mimeType.toLowerCase().startsWith('audio/'),
  );

  const byKind = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `${rows.length} files (${Object.entries(byKind)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')})`,
  );

  const show = (label: string, list: typeof rows) => {
    console.log(`\n${label}: ${list.length}`);
    for (const r of list) {
      console.log(
        `  ${r.id}  kind=${r.kind}  mime=${JSON.stringify(r.mimeType)}  ` +
          `file=${JSON.stringify(r.fileName)}  band=${r.bandId}  song=${r.conversationId}`,
      );
    }
  };

  show('Not servable (would have been downgraded on serve)', dangerous);
  show('Audio rows with a non-audio type', mismatched);

  if (dangerous.length > 0) {
    console.log(
      '\nTo neutralize them (they will download rather than render):\n' +
        `  update song_files set mime_type = 'application/octet-stream'\n` +
        `   where id in (${dangerous.map((r) => `'${r.id}'`).join(', ')});\n` +
        '\nOr delete the rows outright if they were never legitimate files.',
    );
  } else {
    console.log('\nNothing stored that could be served as an executable type.');
  }

  await closeDb();
  process.exit(dangerous.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
