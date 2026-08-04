import type { ReactNode } from 'react';
import type { PlaylistTrack } from '../../player/PlaylistPlayer';

export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: 'owner' | 'member';
}

export interface Conversation {
  id: string;
  audioFileName: string | null;
  closed: boolean;
  archived: boolean;
  /** Who the song is originally by, for covers; null when it's the band's own. */
  originalBand: string | null;
  bpm: number | null;
  key: string | null;
  /** When the song was added to the band — the Uploads history's sort key. */
  createdAt: string;
  updatedAt: string;
  /** Default audio version's duration in seconds; null when unknown. */
  songLength: number | null;
  /** Stored audio file name; null when the song has no audio yet. */
  audioStoredName: string | null;
  /** Stored audio MIME type; null when the song has no audio yet. */
  audioMimeType: string | null;
  /** Whether the song has sheet music — i.e. whether Live has anything to show. */
  hasSheetMusic: boolean;
}

/** A song's streaming URL, or null when it has no audio to play. */
export function audioSrc(c: Conversation): string | null {
  if (!c.audioStoredName) return null;
  return `/api/conversations/${c.id}/files/audio?name=${encodeURIComponent(
    c.audioStoredName,
  )}`;
}

export interface Setlist {
  id: string;
  name: string;
  updatedAt: string;
  archived: boolean;
  songs: {
    id: string;
    conversationId: string | null;
    name: string;
    originalBand: string | null;
    bpm: number | null;
    key: string | null;
    /** Duration in seconds; null for markers / unknown. */
    songLength: number | null;
    /**
     * Stored file name / MIME of the song's default audio version — null for
     * markers and songs with no audio yet, which is how callers tell what can
     * be played.
     */
    audioStoredName: string | null;
    audioMimeType: string | null;
  }[];
}

/**
 * A setlist's songs as a player queue, in order. Markers (set breaks) and
 * songs with no audio drop out — a queue position isn't a setlist position.
 */
export function setlistQueue(sl: Setlist): PlaylistTrack[] {
  return sl.songs
    .filter((s) => s.conversationId && s.audioStoredName)
    .map((s) => ({
      id: s.conversationId!,
      title: s.name,
      src: `/api/conversations/${s.conversationId}/files/audio?name=${encodeURIComponent(
        s.audioStoredName!,
      )}`,
      fileName: s.audioStoredName!,
      mimeType: s.audioMimeType ?? undefined,
      href: `/notes/${s.conversationId}`,
      originalBand: s.originalBand ?? undefined,
      bpm: s.bpm,
      songKey: s.key,
      subtitle: sl.name,
      durationSec: s.songLength ?? undefined,
    }));
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
}

export interface Show {
  id: string;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  notes: string | null;
  setlistId: string | null;
  setlistName: string | null;
  venueId: string | null;
  venueName: string | null;
}

/** "N songs" — counts actual songs, ignoring markers (set breaks etc.). */
export function songCountLabel(
  songs: { conversationId: string | null }[],
): string {
  const n = songs.filter((s) => s.conversationId).length;
  return `${n} ${n === 1 ? 'song' : 'songs'}`;
}

/** ▸/▾ toggle for collapsing a band-page section. */
export function MinimizeToggle({
  minimized,
  onToggle,
  label,
  children,
}: {
  minimized: boolean;
  onToggle: () => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!minimized}
      aria-label={minimized ? `Expand ${label}` : `Minimize ${label}`}
      title={minimized ? `Expand ${label}` : `Minimize ${label}`}
      className="-mr-1 px-2 py-2 text-xl leading-none flex items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        {minimized ? '▸' : '▾'}
      </span>
      {children}
    </button>
  );
}
