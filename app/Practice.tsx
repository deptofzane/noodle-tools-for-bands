'use client';

import { PlayerProvider } from './notes/[conversationId]/PlayerContext';
import { AudioPlayer } from './notes/[conversationId]/AudioPlayer';
import { PageHeader } from './PageHeader';
import { SetlistNav } from './SetlistNav';
import { usePersistedIndex } from './usePersistedIndex';
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
 * sheet music (if any). Narrow screens stack those top to bottom, with the nav
 * and player pinned to the top of the viewport while the sheet music scrolls
 * under them; from `lg` up (unless `wideLayout` is off) the nav and player
 * move into a sticky left rail and the sheet music takes the rest of the
 * width.
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
  back,
  startIndex,
  shareHref,
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
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
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

  // Mobile: pin the whole control group — song nav and player — to the top so
  // it's still there once you've scrolled into the sheet music. It has to be
  // this element rather than the player itself: a sticky box can only travel
  // inside its parent, and the player is the last thing in this one. `top-0`
  // is clear on mobile (the app's nav bar is pinned to the bottom there).
  // Desktop is unaffected — the rail inside does its own sticking.
  const colCls =
    'sticky top-0 z-40 bg-white dark:bg-neutral-950' +
    (wideLayout ? ' lg:static lg:z-auto lg:bg-transparent' : '');

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

      <div className={rowCls}>
        <div className={colCls}>
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
  // each one gets a fresh engine. With a `playerSlot` there's no engine of
  // ours to hold, so there's nothing to provide.
  return song.conversationId && !playerSlot ? (
    <PlayerProvider key={song.conversationId}>{layout}</PlayerProvider>
  ) : (
    layout
  );
}
