/**
 * Whether a downloaded setlist has fallen behind the band's copy.
 *
 * Pure, and deliberately the only place this rule lives — the badge is only
 * worth having if people trust it, and a rule spread across components drifts.
 */

/** The parts of a downloaded record this rule reads. */
export interface StaleRecord {
  /** Every content URL the download cached, in setlist order. */
  urls?: string[];
  choices: { sheets: boolean; audio: boolean };
}

/** The parts of the band's current setlist this rule reads. */
export interface StaleSetlist {
  songs: {
    conversationId: string | null;
    audioVersionId: string | null;
    sheetVersions: { id: string; updatedAt: string }[];
  }[];
}

/**
 * One cached file, reduced to what identifies its *bytes*.
 *
 * Not the URL itself: that carries a `?name=` built from the song's display
 * name, so comparing URLs would report a renamed song as out of date. A rename
 * changes nothing you would re-download.
 */
type Fingerprint = string;

const audioPrint = (conversationId: string, versionId: string): Fingerprint =>
  `audio:${conversationId}:${versionId}`;

const sheetPrint = (
  conversationId: string,
  versionId: string,
  updatedAt: string,
): Fingerprint => `sheet:${conversationId}:${versionId}:${updatedAt}`;

/**
 * What the download actually saved, recovered from the URLs it recorded.
 *
 * Reading it back out of `urls` rather than a field written at download time
 * means setlists already on people's devices start reporting correctly the
 * moment this ships — no new field, no migration, nothing to re-download first.
 *
 * Returns null when the record predates `urls` being tracked at all: those are
 * genuinely unknowable, and guessing would either nag or lie.
 */
function downloadedFingerprints(
  record: StaleRecord,
): Fingerprint[] | null {
  if (!record.urls) return null;

  const prints: Fingerprint[] = [];
  for (const raw of record.urls) {
    const url = new URL(raw, 'https://noodle.invalid');
    const conversationId = url.pathname.split('/')[3];
    const version = url.searchParams.get('version');
    if (!conversationId || !version) continue;

    if (url.pathname.endsWith('/files/audio')) {
      prints.push(audioPrint(conversationId, version));
    } else if (url.pathname.endsWith('/files/sheet_music')) {
      // `v` is the version's updatedAt — see the download's sheet URLs.
      prints.push(
        sheetPrint(conversationId, version, url.searchParams.get('v') ?? ''),
      );
    }
  }
  return prints;
}

/**
 * What a download of the band's current setlist would save, given the same
 * choices. Ordered, so a pure reorder — same files, different running order —
 * still counts as a change worth re-downloading.
 */
function currentFingerprints(
  setlist: StaleSetlist,
  choices: StaleRecord['choices'],
): Fingerprint[] {
  const prints: Fingerprint[] = [];
  for (const song of setlist.songs) {
    // Markers have no files of their own.
    if (!song.conversationId) continue;
    // Sheets first, then audio — the order the download writes them in.
    if (choices.sheets) {
      for (const v of song.sheetVersions) {
        prints.push(sheetPrint(song.conversationId, v.id, v.updatedAt));
      }
    }
    if (choices.audio && song.audioVersionId) {
      prints.push(audioPrint(song.conversationId, song.audioVersionId));
    }
  }
  return prints;
}

/**
 * True when the copy on this device differs from the band's.
 *
 * Only the parts that were actually downloaded count: someone who saved sheets
 * alone isn't told to re-download because a new audio take landed. And only
 * files and running order count — a tempo or key edit changes what Practice
 * displays, not what it would fetch, so it stays quiet.
 */
export function isStale(record: StaleRecord, setlist: StaleSetlist): boolean {
  const downloaded = downloadedFingerprints(record);
  if (downloaded === null) return false;

  const current = currentFingerprints(setlist, record.choices);
  if (downloaded.length !== current.length) return true;
  return downloaded.some((print, i) => print !== current[i]);
}
