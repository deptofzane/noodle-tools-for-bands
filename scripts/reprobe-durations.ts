import './load-env';
import { closeDb } from '../lib/db';
import { reprobeAudioDurations } from '../lib/db/song-files';

/**
 * One-off maintenance: re-probe every stored audio file's duration and update
 * `song_files.song_length`. Fixes rows written before the CBR-MP3 duration fix
 * (headerless CBR MP3s that collapsed to a constant ~probe-window ÷ bitrate).
 *
 * Run with the target DB + object-storage env available:
 *   node --import tsx scripts/reprobe-durations.ts
 * (loads .env.local by default; export DATABASE_URL / S3 vars to target prod).
 */
async function main() {
  console.log('Re-probing audio durations…');
  const res = await reprobeAudioDurations({
    onChange: ({ fileName, from, to }) =>
      console.log(`  ${from ?? 'null'}s -> ${to ?? 'null'}s  ${fileName}`),
  });
  console.log(
    `Done. Scanned ${res.scanned} audio file(s); updated ${res.updated}.`,
  );
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
