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
import type { Dispatch, ReactNode, SetStateAction } from 'react';

export interface PracticeSong {
  /** Null for a marker step (set break / custom) — shown without a player. */
  conversationId: string | null;
  /** Display title, also the audio filename (its extension hints the format). */
  title: string;
  /** Audio MIME type; defaults to audio/mpeg when unknown. */
  mimeType?: string;
  /** Sheet music to show beneath the player, if the song has any. */
  sheetMusic?: SheetMusicMeta | null;
  /**
   * Audio URL to stream. Defaults to the song's default audio version —
   * callers that already know the exact URL (the player's queue) pass theirs
   * so practice plays the same file the queue does.
   */
  src?: string;
}

/**
 * Step through a setlist one song at a time for practice: a nav bar with
 * back/forward plus "{title} - {n}/{total}", the music player, and the song's
 * sheet music (if any). Narrow screens stack those top to bottom; from `lg`
 * up (unless `wideLayout` is off) the nav and player move into a sticky left
 * rail and the sheet music takes the rest of the width.
 *
 * By default each song gets a fresh player (the provider is keyed by
 * conversation id), so switching tears down the old audio engine and spins up
 * a clean one for the new song. Pass `playerSlot` to supply a player instead —
 * the full-screen player does, so its Practice tab drives the queue's engine
 * rather than opening a second one.
 */
export function Practice({
  songs,
  apiKey,
  persistKey,
  index: controlledIndex,
  onIndexChange,
  onNavigate,
  wideLayout = true,
  playerSlot,
}: {
  songs: PracticeSong[];
  apiKey: string;
  /** localStorage key to remember the last-viewed song (per set). */
  persistKey?: string;
  /**
   * Allow the two-column desktop layout. Off for callers that render Practice
   * inside a narrow container (the full-screen player), where the viewport
   * being wide says nothing about the space actually available.
   */
  wideLayout?: boolean;
  /**
   * Controlled position. When passed (with `onIndexChange`), the owner keeps
   * the current song — used by the full-screen player, whose Practice tab
   * opens on whatever the queue is playing.
   */
  index?: number;
  onIndexChange?: Dispatch<SetStateAction<number>>;
  /** Called when a link inside leaves the page (lets an overlay close). */
  onNavigate?: () => void;
  /**
   * Player to show above the sheet music instead of Practice's own. Supplying
   * one means Practice owns no audio engine — the slot's player is the only
   * one, and stepping songs is the caller's business (see `onIndexChange`).
   */
  playerSlot?: ReactNode;
}) {
  const [ownIndex, setOwnIndex] = usePersistedIndex(
    persistKey ?? null,
    songs.length,
  );
  const controlled = controlledIndex != null && onIndexChange != null;
  const index = controlled ? controlledIndex : ownIndex;
  const setIndex = controlled ? onIndexChange : setOwnIndex;

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

  // Desktop (`lg`+): nav + player in a fixed-width sticky rail on the left,
  // sheet music filling the rest. Below `lg` — and whenever `wideLayout` is
  // off — everything stacks in one column, as it always has.
  const rowCls =
    'flex flex-col gap-2' +
    (wideLayout ? ' lg:flex-row lg:items-start lg:gap-4' : '');
  // z-50 keeps the sticky player above the sheet music it scrolls over.
  // The rail pins below the desktop nav bar (which is `fixed` at the top and
  // 4.5rem tall) rather than at top-0, where it would slide up underneath it.
  // Capping its height keeps a tall rail — options panel open — reachable.
  const railCls =
    'flex flex-col gap-2 z-50' +
    (wideLayout
      ? ' lg:sticky lg:top-[var(--app-nav-h)] lg:max-h-[calc(100vh_-_var(--app-nav-h))]' +
        ' lg:overflow-y-auto lg:w-[22rem] lg:shrink-0 xl:w-[26rem]'
      : '');
  const mainCls = 'min-w-0' + (wideLayout ? ' lg:flex-1' : '');

  const layout = (
    <div className={rowCls}>
      <div>
        <div className={railCls}>
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

            {/* In the rail the title and Edit stack, so the title keeps its
              width instead of fighting the button for it. */}
            <span
              className={
                'flex min-w-0 gap-3 items-center' +
                (wideLayout ? ' lg:flex-col lg:items-start lg:gap-1' : '')
              }
            >
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
          <div className="w-[6rem] m-auto h-[4rem]">
            {song.conversationId && (
              <Link
                href={`/notes/${song.conversationId}/edit`}
                onClick={onNavigate}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Edit song
              </Link>
            )}
          </div>
        </div>

        {song.conversationId &&
          (playerSlot ?? (
            <AudioPlayer
              src={
                song.src ??
                `/api/conversations/${song.conversationId}/files/audio?name=${encodeURIComponent(
                  song.title,
                )}`
              }
              fileName={song.title}
              mimeType={song.mimeType ?? 'audio/mpeg'}
              sticky
            />
          ))}
      </div>

      <div className={mainCls}>
        {song.conversationId ? (
          <SheetMusic
            conversationId={song.conversationId}
            apiKey={apiKey}
            initial={song.sheetMusic}
            startClosed={false}
            zoomKey={song.conversationId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700 mr-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Break
            </p>
            <p className="mt-1 text-lg font-medium">{song.title}</p>
          </div>
        )}
      </div>
    </div>
  );

  // The provider owns the audio engine our player registers; keyed by song so
  // each one gets a fresh engine. With a `playerSlot` there's no engine of
  // ours to hold, so there's nothing to provide.
  return song.conversationId && !playerSlot ? (
    <PlayerProvider key={song.conversationId}>{layout}</PlayerProvider>
  ) : (
    layout
  );
}
