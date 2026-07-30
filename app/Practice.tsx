'use client';

import { PlayerProvider } from './notes/[conversationId]/PlayerContext';
import { AudioPlayer } from './notes/[conversationId]/AudioPlayer';
import { SetlistNav } from './SetlistNav';
import { usePersistedIndex } from './usePersistedIndex';
import {
  SheetMusic,
  type SheetMusicMeta,
} from './notes/[conversationId]/SheetMusic';
import Link from 'next/link';

export interface PracticeSong {
  /** Null for a marker step (set break / custom) — shown without a player. */
  conversationId: string | null;
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
export function Practice({
  songs,
  apiKey,
  persistKey,
}: {
  songs: PracticeSong[];
  apiKey: string;
  /** localStorage key to remember the last-viewed song (per set). */
  persistKey?: string;
}) {
  const [index, setIndex] = usePersistedIndex(persistKey ?? null, songs.length);

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

  const navBtn =
    'shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-lg leading-none font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={!canBack}
          aria-label="Previous song"
          className={navBtn}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <span className="flex gap-3 items-center">
          <SetlistNav
            songs={songs.map((s) => ({
              title: s.title,
              isMarker: !s.conversationId,
            }))}
            current={current}
            onSelect={setIndex}
            align="center"
          >
            <span className="text-sm">
              <span className="font-medium">{song.title}</span>
              <span className="text-neutral-500">
                {' '}
                - {current + 1}/{total}
              </span>
            </span>
          </SetlistNav>

          {song.conversationId && (
            <Link
              href={`/notes/${song.conversationId}/edit`}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Edit song
            </Link>
          )}
        </span>

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

      {song.conversationId ? (
        <PlayerProvider key={song.conversationId}>
          <div className="flex flex-col">
            <AudioPlayer
              src={`/api/conversations/${song.conversationId}/files/audio?name=${encodeURIComponent(
                song.title,
              )}`}
              fileName={song.title}
              mimeType={song.mimeType ?? 'audio/mpeg'}
              sticky
            />
            <SheetMusic
              conversationId={song.conversationId}
              apiKey={apiKey}
              initial={song.sheetMusic}
              startClosed={false}
              zoomKey={song.conversationId}
            />
          </div>
        </PlayerProvider>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Break
          </p>
          <p className="mt-1 text-lg font-medium">{song.title}</p>
        </div>
      )}
    </div>
  );
}
