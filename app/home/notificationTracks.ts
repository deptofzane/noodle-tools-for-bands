import {
  audioSrc,
  type Conversation,
} from '@/app/bands/[bandId]/bandDetailShared';
import type { PlaylistTrack } from '../player/PlaylistPlayer';

/** The bits of a notification this module needs to find what was uploaded. */
export interface UploadNotification {
  kind: string;
  subjectId: string | null;
  subjectLabel: string | null;
  bandName: string | null;
  createdAt: string;
}

/** Only "audio was added" notifications have anything to play. */
export function isUploadNotification(n: UploadNotification): boolean {
  return n.kind === 'audio-added';
}

/**
 * How many songs a batched upload notification covers.
 *
 * Bulk imports post one notification for the whole batch, and the count only
 * survives in the label our own code wrote (`"7 songs"`), so parsing it back
 * out is reading our own format rather than guessing at prose. A label we
 * can't parse means one song — the shape every non-batched upload has.
 */
export function batchCount(subjectLabel: string | null): number {
  const n = Number.parseInt(subjectLabel ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * The songs an "added audio" notification is about, as a playable queue.
 *
 * A single upload names its conversation, so it resolves exactly. A bulk
 * import doesn't: the notification carries a count and nothing else, because
 * one row can't hold a list of ids. Those are recovered by their timestamps —
 * the batch's songs are the newest ones that existed when the notification
 * was written — which is exact unless someone uploaded into the same band in
 * the seconds between the import finishing and the notification landing.
 *
 * Songs without audio are dropped: a queue entry that can't play is worse
 * than a shorter queue, and a notification whose songs have all since been
 * deleted correctly resolves to nothing.
 */
export function tracksForNotification(
  n: UploadNotification,
  conversations: Conversation[],
): PlaylistTrack[] {
  const playable = conversations.filter((c) => audioSrc(c) !== null);

  // Parsed rather than compared as strings: these two timestamps are
  // serialized by different layers, so they aren't guaranteed to share a
  // format that happens to sort lexicographically.
  const at = (iso: string) => Date.parse(iso);
  const cutoff = at(n.createdAt);

  const songs = n.subjectId
    ? playable.filter((c) => c.id === n.subjectId)
    : playable
        .filter((c) => at(c.createdAt) <= cutoff)
        // Newest first to take the batch, then flipped back below so the
        // queue plays in the order the songs were uploaded.
        .sort((a, b) => at(b.createdAt) - at(a.createdAt))
        .slice(0, batchCount(n.subjectLabel))
        .reverse();

  return songs.map((c) => ({
    id: c.id,
    title: c.audioFileName ?? 'Untitled audio',
    src: audioSrc(c)!,
    fileName: c.audioStoredName ?? undefined,
    mimeType: c.audioMimeType ?? undefined,
    href: `/notes/${c.id}?from=audio`,
    originalBand: c.originalBand ?? undefined,
    bpm: c.bpm,
    songKey: c.key,
    subtitle: n.bandName ?? undefined,
    durationSec: c.songLength ?? undefined,
  }));
}
