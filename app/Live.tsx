'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { previewKind } from '@/lib/sheet-preview';
import { ActionMenu, ActionMenuItem } from './ActionMenu';
import { SetlistNav } from './SetlistNav';
import { usePersistedIndex } from './usePersistedIndex';
import { usePersistedZoom, useDefaultSheetZoom } from './usePersistedZoom';
import { PdfView } from './PdfView';
import { LoadingBlock, Spinner } from './Spinner';
import { SheetText } from './notes/[conversationId]/SheetText';
import type { PracticeSong } from './Practice';

/** Minimal typing for the (still-experimental) Screen Wake Lock API. */
interface WakeLockSentinel {
  release: () => Promise<void>;
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
}

/**
 * Live mode: a full-screen, chrome-free view of a setlist's sheet music for
 * performing. No app header, no audio player — just the current item's sheet
 * filling the screen, with forward/back and an exit. Navigation works via
 * on-screen arrows, edge taps, arrow keys, and PageUp/PageDown (foot
 * pedals). Keeps the screen awake while open.
 */
export function Live({
  songs,
  exitHref,
  persistKey,
  startIndex,
  shareHref,
}: {
  songs: PracticeSong[];
  exitHref: string;
  /** localStorage key to remember the last-viewed song (per set). */
  persistKey?: string;
  /**
   * Open on this position instead of wherever you last left off — a shared
   * link naming a song. Only read on mount.
   */
  startIndex?: number | null;
  /**
   * The URL for a given position, mirrored into the address as you move so a
   * copied link points at the song on screen. No button for it here: Live is
   * chrome-free on purpose.
   */
  shareHref?: (index: number) => string;
}) {
  const router = useRouter();
  const [index, setIndex] = usePersistedIndex(
    persistKey ?? null,
    songs.length,
    startIndex,
  );

  const total = songs.length;
  const current = Math.min(index, Math.max(0, total - 1));
  const song = songs[current];
  const convId = song?.conversationId ?? null;
  const canBack = current > 0;
  const canForward = current < total - 1;

  const goPrev = useCallback(
    () => setIndex((i) => Math.max(0, i - 1)),
    [setIndex],
  );
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total, setIndex],
  );
  const exit = useCallback(() => router.push(exitHref), [router, exitHref]);

  // Mirror the position into the address (no navigation, no history entry) so
  // a link copied or shared from here opens on the same song.
  const shareUrl = shareHref?.(current);
  useEffect(() => {
    if (!shareUrl || typeof window === 'undefined') return;
    window.history.replaceState(window.history.state, '', shareUrl);
  }, [shareUrl]);

  const sheet = song?.sheetMusic ?? null;
  const kind =
    song?.conversationId && sheet
      ? previewKind(sheet.mimeType, sheet.fileName)
      : null;
  const zoomable = kind === 'image' || kind === 'pdf' || kind === 'text';

  // Zoom (percent) drives image width, PDF viewer zoom, and text font size.
  // It's per-song and persisted (keyed by the song's conversation id), so each
  // song keeps its own zoom as you flip through the set and come back. Until
  // it has one, it starts where Practice starts it.
  const defaultZoom = useDefaultSheetZoom(kind);
  const [zoom, setZoom] = usePersistedZoom(convId, defaultZoom);
  const zoomIn = useCallback(() => setZoom((z) => z + 10), [setZoom]);
  const zoomOut = useCallback(() => setZoom((z) => z - 10), [setZoom]);
  const resetZoom = useCallback(
    () => setZoom(defaultZoom),
    [setZoom, defaultZoom],
  );

  // For pinch-to-zoom: read the live value without re-subscribing.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const getZoom = useCallback(() => zoomRef.current, []);

  // Sheet-music versions for the current song + this user's preferred one.
  // Chosen from the header kebab; the choice persists per-user.
  const [sheetVersions, setSheetVersions] = useState<LiveSheetVersion[] | null>(
    null,
  );
  const [sheetSelectedId, setSheetSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!convId) {
      setSheetVersions([]);
      setSheetSelectedId(null);
      return;
    }
    let cancelled = false;
    setSheetVersions(null);
    setSheetSelectedId(null);
    fetch(`/api/conversations/${convId}/sheet-music-versions`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(
        (d: { versions: LiveSheetVersion[]; preferredId: string | null }) => {
          if (cancelled) return;
          setSheetVersions(d.versions);
          setSheetSelectedId(d.preferredId);
        },
      )
      .catch(() => {
        if (!cancelled) setSheetVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [convId]);

  const selectSheetVersion = useCallback(
    (id: string) => {
      setSheetSelectedId(id);
      if (convId)
        void fetch(`/api/conversations/${convId}/sheet-music-preference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId: id }),
        }).catch(() => {});
    },
    [convId],
  );

  // Keyboard + foot-pedal navigation; Esc exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        goNext();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exit();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, exit, zoomIn, zoomOut, resetZoom]);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keep the screen awake during a set (best-effort; re-acquire when the tab
  // becomes visible again, since the lock drops while hidden).
  useEffect(() => {
    const nav = navigator as Navigator & WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen');
      } catch {
        // unsupported / denied — nothing to do
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  const navBtn =
    'flex h-12 w-12 items-center justify-center rounded-md border border-neutral-300 text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-900';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-neutral-950">
      {/* Controls header. */}
      {/* <header className="flex items-center justify-between border-b border-neutral-200 px-2 py-2 dark:border-neutral-800"> */}
      <header className="w-100 flex flex-col">
        <p className="mt-1 mb-1 text-sm mx-auto ">{song?.title}</p>
        <span className="flex items-center justify-between border-b border-neutral-200 px-2 pb-2 dark:border-neutral-800">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canBack}
            aria-label="Previous"
            className={navBtn}
          >
            ‹
          </button>
          <SetlistNav
            songs={songs.map((s) => ({
              title: s.title,
              isMarker: !s.conversationId,
            }))}
            current={current}
            onSelect={setIndex}
            align="left"
          >
            <span className="text-xs tabular-nums text-neutral-300">
              {total === 0 ? '0 / 0' : `${current + 1} / ${total}`}
            </span>
          </SetlistNav>

          <div className="flex items-center gap-2">
            {zoomable ? (
              <div className="flex items-center gap-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= 50}
                  aria-label="Zoom out"
                  className="flex h-12 w-9 items-center justify-center rounded-l-md text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  aria-label="Reset zoom"
                  className="min-w-[3.25rem] px-1 text-center text-xs font-medium tabular-nums hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= 400}
                  aria-label="Zoom in"
                  className="flex h-12 w-9 items-center justify-center rounded-r-md text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
                >
                  +
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-0.5 w-[11.75rem] h-[3.125rem]"></div>
            )}
            {sheetVersions && sheetVersions.length > 1 ? (
              <ActionMenu label="Sheet music version">
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-default px-4 py-2 text-[0.625rem] font-semibold uppercase tracking-wide text-neutral-400 sm:px-3 sm:py-1.5"
                >
                  Select version
                </div>
                {sheetVersions.map((v) => (
                  <ActionMenuItem
                    key={v.id}
                    onClick={() => selectSheetVersion(v.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
                        {v.id === sheetSelectedId ? '✓' : ''}
                      </span>
                      <span className="truncate">
                        {(v.label || v.fileName) +
                          (v.isDefault ? ' (default)' : '')}
                      </span>
                    </span>
                  </ActionMenuItem>
                ))}
              </ActionMenu>
            ) : zoomable ? (
              <span className="rounded-md px-6 py-3 md:px-2 md:py-1 w-[2rem] h-[2rem]"></span>
            ) : null}
            {/* Exit lives in the header on desktop. */}
            <button
              type="button"
              onClick={exit}
              aria-label="Exit live mode"
              className="hidden h-9 items-center rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50 lg:inline-flex dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              ✕ Exit
            </button>
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={!canForward}
            aria-label="Next"
            className={navBtn}
          >
            ›
          </button>
        </span>
      </header>

      {/* Sheet fills the rest. */}
      <div className="relative min-h-0 flex-1">
        {song ? (
          <SheetView
            song={song}
            versions={sheetVersions}
            selectedId={sheetSelectedId}
            zoom={zoom}
            getZoom={getZoom}
            setZoom={setZoom}
          />
        ) : (
          <Centered>Nothing to show.</Centered>
        )}

        {/* Tablet-only tap-to-advance edges (clean taps only). */}
        {canBack && <EdgeTap side="left" onTap={goPrev} />}
        {canForward && <EdgeTap side="right" onTap={goNext} />}
      </div>

      {/* On phones/tablets, Exit moves to a high-contrast bottom-left button. */}
      <button
        type="button"
        onClick={exit}
        aria-label="Exit live mode"
        className="absolute bottom-4 left-4 z-10 rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 lg:hidden"
      >
        ✕ Exit
      </button>
    </div>
  );
}

/**
 * Two-finger pinch → zoom, mapped to the shared zoom state. Attaches native
 * non-passive touch listeners (React's are passive, so preventDefault
 * wouldn't stick) to the given element. One-finger panning stays native via
 * the container's scroll. Attached to image, text, and (now PDF.js-rendered)
 * PDF containers alike.
 */
function usePinchZoom(getZoom: () => number, setZoom: (n: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 100;
    const dist = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = getZoom();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        setZoom((startZoom * dist(e.touches)) / startDist);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [getZoom, setZoom]);
  return ref;
}

interface LiveSheetVersion {
  id: string;
  fileName: string;
  mimeType: string;
  isDefault: boolean;
  label: string | null;
  updatedAt: string;
}

function SheetView({
  song,
  versions,
  selectedId,
  zoom,
  getZoom,
  setZoom,
}: {
  song: PracticeSong;
  /** Sheet-music versions (owned by Live, chosen from the header kebab). */
  versions: LiveSheetVersion[] | null;
  selectedId: string | null;
  zoom: number;
  getZoom: () => number;
  setZoom: (n: number) => void;
}) {
  const convId = song.conversationId;
  const [text, setText] = useState<string | null>(null);
  const pinchRef = usePinchZoom(getZoom, setZoom);

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const kind = selected
    ? previewKind(selected.mimeType, selected.fileName)
    : null;
  const url =
    convId && selected
      ? `/api/conversations/${convId}/files/sheet_music?version=${selected.id}&v=${encodeURIComponent(
          selected.updatedAt,
        )}`
      : null;

  // Fetch text content lazily for text/markdown/ChordPro sheets.
  useEffect(() => {
    if (kind !== 'text' || !url) {
      setText(null);
      return;
    }
    let cancelled = false;
    setText(null);
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error())))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setText('(Could not load sheet music.)'));
    return () => {
      cancelled = true;
    };
  }, [kind, url]);

  // A marker (set break / custom): no sheet, just its label.
  if (!convId) {
    return (
      <Centered>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Break
        </p>
        <p className="mt-2 text-2xl font-semibold">{song.title}</p>
      </Centered>
    );
  }

  let content: ReactNode;
  if (versions === null) {
    content = (
      <Centered>
        <Spinner size="lg" />
      </Centered>
    );
  } else if (!selected || !url) {
    content = (
      <Centered>
        <p className="text-lg font-medium">{song.title}</p>
        <p className="mt-1 text-sm text-neutral-500">No sheet music.</p>
      </Centered>
    );
  } else if (kind === 'image') {
    // The zoom % lives on a WRAPPER (no max-width cap); the img fills it, so
    // zooming isn't fighting `img { max-width: 100% }`.
    content = (
      <div
        ref={pinchRef}
        style={{ touchAction: 'pan-x pan-y' }}
        className="h-full w-full overflow-auto bg-neutral-100 py-4 dark:bg-neutral-900"
      >
        <div style={{ width: `${zoom}%` }} className="mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={song.title} className="block h-auto w-full" />
        </div>
      </div>
    );
  } else if (kind === 'pdf') {
    content = (
      <PdfView
        url={url}
        title={song.title}
        zoom={zoom}
        containerRef={pinchRef}
      />
    );
  } else if (kind === 'text') {
    // Formatted Markdown / ChordPro. Zoom drives the base font size; the
    // rendered content uses em units so it scales with it.
    content = (
      <div
        ref={pinchRef}
        style={{ touchAction: 'pan-x pan-y' }}
        className="h-full w-full overflow-auto"
      >
        <div
          style={{
            fontSize: `calc(var(--sheet-base) * ${(zoom / 100) * 1.03})`,
          }}
          className="px-6 py-6 leading-relaxed"
        >
          {text === null ? (
            <LoadingBlock label="Loading sheet music" />
          ) : (
            <SheetText
              text={text}
              fileName={selected.fileName}
              controls={false}
            />
          )}
        </div>
      </div>
    );
  } else {
    content = (
      <Centered>
        <p className="text-lg font-medium">{song.title}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-sm text-blue-600 underline dark:text-blue-400"
        >
          Open sheet music
        </a>
      </Centered>
    );
  }

  return content;
}

/**
 * A tap-to-advance zone along one edge of the sheet, tablet-only (hidden on
 * phones and desktop). Fires only on a clean tap — a short, nearly-stationary
 * press by the primary pointer — so panning or pinching a zoomed sheet near
 * the edge doesn't accidentally change items.
 */
function EdgeTap({
  side,
  onTap,
}: {
  side: 'left' | 'right';
  onTap: () => void;
}) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        if (e.isPrimary)
          start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      }}
      onPointerUp={(e) => {
        if (!e.isPrimary) return;
        const s = start.current;
        start.current = null;
        if (!s) return;
        const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
        if (moved < 12 && Date.now() - s.t < 500) onTap();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      aria-hidden="true"
      className={`absolute inset-y-0 hidden w-[18%] md:block lg:hidden ${
        side === 'left' ? 'left-0' : 'right-0'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-3xl text-neutral-400/40 ${
          side === 'left' ? 'left-2' : 'right-2'
        }`}
      >
        {side === 'left' ? '‹' : '›'}
      </span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
