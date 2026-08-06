'use client';

import { PlayerProvider } from './notes/[conversationId]/PlayerContext';
import {
  AudioPlayer,
  type PlayerVersion,
} from './notes/[conversationId]/AudioPlayer';
import { PageHeader } from './PageHeader';
import { SetlistNav } from './SetlistNav';
import { usePersistedIndex } from './usePersistedIndex';
import { useIsDesktop } from './useIsDesktop';
import {
  SheetMusic,
  type SheetMusicMeta,
} from './notes/[conversationId]/SheetMusic';
import Link from 'next/link';
import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export interface PracticeSong {
  /** Null for a marker step (set break / custom) — shown without a player. */
  conversationId: string | null;
  /** Display title, also the audio filename (its extension hints the format). */
  title: string;
  /** Audio MIME type; defaults to audio/mpeg when unknown. */
  mimeType?: string;
  /** Who the song is originally by, for covers. */
  originalBand?: string | null;
  /** Tempo / musical key, shown by the player when known. */
  bpm?: number | null;
  songKey?: string | null;
  /** Sheet music to show beneath the player, if the song has any. */
  sheetMusic?: SheetMusicMeta | null;
  /** Every audio version; two or more puts a switcher in the player. */
  audioVersions?: PlayerVersion[];
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
 * sheet music (if any). Narrow screens stack those top to bottom; from `lg` up
 * the nav spans the full width with the player in a narrow rail beneath it,
 * and the sheet music takes the rest. Either way the player alone stays pinned
 * to the top of the viewport while the sheet music scrolls under it — the nav
 * scrolls away with the page. Desktop swaps the player for a vertical variant
 * sized for the rail (see AudioPlayer's `variant`).
 *
 * Each song gets a fresh player (the provider is keyed by conversation id), so
 * switching tears down the old audio engine and spins up a clean one.
 */
export function Practice({
  songs,
  apiKey,
  persistKey,
  index: controlledIndex,
  onIndexChange,
  onNavigate,
  back,
  startIndex,
  shareHref,
}: {
  songs: PracticeSong[];
  apiKey: string;
  /** localStorage key to remember the last-viewed song (per set). */
  persistKey?: string;
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
   * Where the page's back link goes. Given one, Practice renders the page
   * header itself so "Edit song" can sit in it — the link points at whichever
   * song you've stepped to, which only this component knows.
   */
  back?: { href: string; name?: string };
  /**
   * Open on this position instead of wherever you last left off — a shared
   * link naming a song. Only read on mount.
   */
  startIndex?: number | null;
  /**
   * The URL for a given position. Supplying it makes the current song part of
   * the address (so the link in the bar is always the song on screen) and adds
   * a "Copy link" action — a PWA has no address bar to copy from.
   */
  shareHref?: (index: number) => string;
}) {
  const [ownIndex, setOwnIndex] = usePersistedIndex(
    persistKey ?? null,
    songs.length,
    startIndex,
  );
  const [copied, setCopied] = useState(false);
  // The desktop player is a different component, not a restyled one, so the
  // choice can't live in a `lg:` class. Resolves after mount (see the hook),
  // which means a beat of the bar layout before the rail takes over.
  const isDesktop = useIsDesktop();
  const controlled = controlledIndex != null && onIndexChange != null;
  const index = controlled ? controlledIndex : ownIndex;
  const setIndex = controlled ? onIndexChange : setOwnIndex;

  // Keep the address in step with the song on screen, so whatever gets copied
  // — from the bar, or by the button below — points where the user is looking.
  // `replaceState`: no navigation, and no history entry per song.
  const position = Math.min(index, Math.max(0, songs.length - 1));
  const shareUrl = shareHref?.(position);
  useEffect(() => {
    if (!shareUrl || typeof window === 'undefined') return;
    window.history.replaceState(window.history.state, '', shareUrl);
  }, [shareUrl]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(
        new URL(shareUrl, window.location.origin).toString(),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / denied) — the address bar and
      // the share sheet are still there.
    }
  };

  // The page header, when we own it. `song` isn't resolved yet at the empty
  // check below, so the Edit link is passed in by each caller of this.
  const header = (action?: ReactNode) =>
    back && (
      <div className="px-4 py-0">
        <PageHeader defaultHref={back.href} defaultHrefName={back.name}>
          {action}
        </PageHeader>
      </div>
    );

  if (songs.length === 0) {
    return (
      <>
        {header()}
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          This setlist has no songs to practice.
        </p>
      </>
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

  // Desktop (`lg`+): a narrow player rail on the left, sheet music filling the
  // rest. Below `lg` they stack. The song nav sits above both, full width —
  // the rail is too narrow to hold a title and two buttons.
  //
  // `items-start` is what it looks like: the rail sticks on its own now, and
  // its parent is this row, which already runs as tall as the sheet music.
  const rowCls = 'flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4';
  const mainCls = 'min-w-0 lg:flex-1';

  // The player, plus the rail around it on desktop.
  //
  // `contents` takes this wrapper out of the box tree below `lg`, promoting
  // the player to a direct child of `rowCls` — the tall column that also holds
  // the sheet music, which is the box the player's own `sticky top-0` travels
  // inside (it brings an opaque background too; see AudioPlayerView's `sticky`
  // prop). `top-0` is clear there because the app's nav bar is pinned to the
  // bottom on mobile. At `lg` this re-forms as the rail and does the sticking
  // itself, at an offset that clears the desktop nav bar — `fixed` at the top
  // and 4.5rem tall. z-50 keeps it above the sheet music it scrolls across.
  const colCls =
    'contents lg:block lg:w-[8rem] lg:shrink-0 lg:z-50' +
    ' lg:sticky lg:top-[var(--app-nav-h)]';

  const layout = (
    <>
      {header(
        <span className="flex shrink-0 items-center gap-3">
          {shareUrl && (
            <button
              type="button"
              onClick={() => void copyLink()}
              title="Copy a link to this song for a bandmate"
              className="py-4 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          )}
          {song.conversationId && (
            <Link
              href={`/notes/${song.conversationId}/edit`}
              onClick={onNavigate}
              className="py-4 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Edit song
            </Link>
          )}
        </span>,
      )}

      {/* Full width, above both columns: the rail is far too narrow for a
          title flanked by two buttons. Not sticky — it scrolls away with the
          page, leaving the player pinned on its own. */}
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
        <span className="flex min-w-0 items-center gap-3">
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
              <span className="minor-text-theme-colors">
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

      <div className={rowCls}>
        {song.conversationId && (
          <div className={colCls}>
            <AudioPlayer
              src={
                song.src ??
                `/api/conversations/${song.conversationId}/files/audio?name=${encodeURIComponent(
                  song.title,
                )}`
              }
              fileName={song.title}
              mimeType={song.mimeType ?? 'audio/mpeg'}
              conversationId={song.conversationId}
              versions={song.audioVersions}
              originalBand={song.originalBand}
              bpm={song.bpm}
              songKey={song.songKey}
              variant={isDesktop ? 'rail' : 'bar'}
              sticky
            />
          </div>
        )}

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
            <div className="flex flex-col items-center justify-center border-t border-b border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700 lg:mr-4 lg:ml-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Break
              </p>
              <p className="mt-1 text-lg font-medium">{song.title}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // The provider owns the audio engine our player registers; keyed by song so
  // each one gets a fresh engine.
  return song.conversationId ? (
    <PlayerProvider key={song.conversationId}>{layout}</PlayerProvider>
  ) : (
    layout
  );
}
