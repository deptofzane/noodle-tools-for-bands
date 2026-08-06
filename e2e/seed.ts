import '../scripts/load-env';
import { eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { db } from '../lib/db';
import { bandMembers, users } from '../lib/db/schema';
import { createBand, deleteBand } from '../lib/db/bands';
import { createCredentialUser, getUserByEmail } from '../lib/db/users';
import { findOrCreateConversation } from '../lib/db/conversations';
import { addAudioVersion, addSheetVersion } from '../lib/db/song-files';
import { createSetlist } from '../lib/db/setlists';
import { writeFileSync, rmSync } from 'node:fs';
import { E2E, SEED_FILE } from './fixtures';

/**
 * The band the E2E suite drives, created and destroyed around each run.
 *
 * It shares a database with the node tests, so everything is namespaced and
 * `clearSeed` runs before seeding as well as after: a crashed run must not
 * wedge the next one on a duplicate email.
 */
export async function seed(): Promise<void> {
  await clearSeed();

  const user = await createCredentialUser({
    email: E2E.email,
    password: E2E.password,
    name: E2E.name,
  });
  const band = await createBand(user.id, E2E.bandName);
  const song = await findOrCreateConversation(
    band.id,
    'e2e-drive-file',
    E2E.songName,
  );

  // Real bytes: the offline spec caches this and plays it back, so an empty
  // body would pass the download and fail the playback for the wrong reason.
  const audio = Buffer.alloc(64 * 1024, 7);
  await addAudioVersion({
    conversationId: song.id,
    body: Readable.from(audio),
    sizeBytes: audio.length,
    fileName: 'e2e-take-1.mp3',
    mimeType: 'audio/mpeg',
    driveFileId: 'e2e-audio-1',
  });
  const sheet = Buffer.from('%PDF-1.4\n% e2e chart\n');
  await addSheetVersion({
    conversationId: song.id,
    body: Readable.from(sheet),
    sizeBytes: sheet.length,
    fileName: 'e2e-chart.pdf',
    mimeType: 'application/pdf',
    driveFileId: 'e2e-sheet-1',
  });

  const setlist = await createSetlist({
    bandId: band.id,
    createdBy: user.id,
    name: E2E.setlistName,
    items: [{ conversationId: song.id, label: null }],
  });

  // Ids on disk so specs can navigate straight to a page. Clicking through
  // menus to *reach* the thing under test makes a spec fail for reasons that
  // have nothing to do with what it's checking.
  writeFileSync(
    SEED_FILE,
    JSON.stringify(
      {
        userId: user.id,
        bandId: band.id,
        songId: song.id,
        setlistId: setlist.id,
      },
      null,
      2,
    ),
  );
}

/** Remove the seeded user and every band they belong to. */
export async function clearSeed(): Promise<void> {
  rmSync(SEED_FILE, { force: true });
  const existing = await getUserByEmail(E2E.email);
  if (!existing) return;

  const memberships = await db
    .select({ bandId: bandMembers.bandId })
    .from(bandMembers)
    .where(eq(bandMembers.userId, existing.id));
  for (const m of memberships) await deleteBand(m.bandId);

  await db.delete(users).where(eq(users.id, existing.id));
}
