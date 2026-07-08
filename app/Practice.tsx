'use client';

import { useState } from 'react';
import { PlayerProvider } from './notes/[conversationId]/PlayerContext';
import { AudioPlayer } from './notes/[conversationId]/AudioPlayer';
import {
  SheetMusic,
  type SheetMusicMeta,
} from './notes/[conversationId]/SheetMusic';

export interface PracticeSong {
  conversationId: string;
  /** Display title, also the audio filename (its extension hints the format). */
  title: string;
  /** Audio MIME type; defaults to audio/mpeg when unknown. */
  mimeType?: string;
  /** Sheet music to show beneath the player, if the song has any. */
  sheetMusic?: SheetMusicMeta | null;
}

/**
 * Step through a setlist one song at a time for practice: the music player
 * on top, its sheet music (if any) below, and a nav bar with back/forward
 * plus "{title} - {n}/{total}". Each song gets a fresh player (the provider
 * is keyed by conversation id), so switching tears down the old audio engine
 * and spins up a clean one for the new song.
 */
export function Practice({ songs }: { songs: PracticeSong[] }) {
  const [index, setIndex] = useState(0);

  if (songs.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        This setlist has no songs to practice.
      </p>
    );
  }

  const total = songs.length;
  // Clamp in case the list shrank since the last render.
  const current = Math.min(index, total - 1);
  const song = songs[current]!;
  const canBack = current > 0;
  const canForward = current < total - 1;

  const src = `/api/conversations/${song.conversationId}/files/audio?name=${encodeURIComponent(
    song.title,
  )}`;

  const navBtn =
    'shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-lg leading-none font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={!canBack}
          aria-label="Previous song"
          className={navBtn}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="min-w-0 text-center text-sm">
          <span className="font-medium">{song.title}</span>
          <span className="text-neutral-500">
            {' '}
            - {current + 1}/{total}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={!canForward}
          aria-label="Next song"
          className={navBtn}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <PlayerProvider key={song.conversationId}>
        <div className="flex flex-col gap-6">
          <AudioPlayer
            src={src}
            fileName={song.title}
            mimeType={song.mimeType ?? 'audio/mpeg'}
          />
          {song.sheetMusic && (
            <SheetMusic
              conversationId={song.conversationId}
              initial={song.sheetMusic}
            />
          )}
        </div>
      </PlayerProvider>
    </div>
  );
}
