'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { previewKind } from '@/lib/sheet-preview';
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
}: {
  songs: PracticeSong[];
  exitHref: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const total = songs.length;
  const current = Math.min(index, Math.max(0, total - 1));
  const song = songs[current];
  const canBack = current > 0;
  const canForward = current < total - 1;

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total],
  );
  const exit = useCallback(() => router.push(exitHref), [router, exitHref]);

  // One zoom control (percent) drives image width, PDF viewer zoom, and text
  // font size. Persists across items as you flip through.
  const [zoom, setZoom] = useState(100);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(400, z + 25)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(50, z - 25)), []);
  const resetZoom = useCallback(() => setZoom(100), []);

  // For pinch-to-zoom: read the live value without re-subscribing, and set a
  // clamped absolute value.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const getZoom = useCallback(() => zoomRef.current, []);
  const applyZoom = useCallback(
    (n: number) => setZoom(Math.min(400, Math.max(50, Math.round(n)))),
    [],
  );

  const sheet = song?.sheetMusic ?? null;
  const kind =
    song?.conversationId && sheet
      ? previewKind(sheet.mimeType, sheet.fileName)
      : null;
  const zoomable = kind === 'image' || kind === 'pdf' || kind === 'text';

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
    'flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-900';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-neutral-950">
      {/* Controls header. */}
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-2 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canBack}
            aria-label="Previous"
            className={navBtn}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canForward}
            aria-label="Next"
            className={navBtn}
          >
            ›
          </button>
          <span className="ml-1 text-xs tabular-nums text-neutral-500">
            {total === 0 ? '0 / 0' : `${current + 1} / ${total}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {zoomable && (
            <div className="flex items-center gap-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= 50}
                aria-label="Zoom out"
                className="flex h-9 w-9 items-center justify-center rounded-l-md text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
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
                className="flex h-9 w-9 items-center justify-center rounded-r-md text-xl leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
              >
                +
              </button>
            </div>
          )}
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
      </header>

      {/* Sheet fills the rest. */}
      <div className="relative min-h-0 flex-1">
        {song ? (
          <SheetView
            song={song}
            zoom={zoom}
            getZoom={getZoom}
            setZoom={applyZoom}
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
 * the container's scroll. PDFs are excluded — the browser's PDF viewer
 * handles pinch inside the iframe itself.
 */
function usePinchZoom(getZoom: () => number, setZoom: (n: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 100;
    const dist = (t: TouchList) =>
      Math.hypot(
        t[0]!.clientX - t[1]!.clientX,
        t[0]!.clientY - t[1]!.clientY,
      );
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

function SheetView({
  song,
  zoom,
  getZoom,
  setZoom,
}: {
  song: PracticeSong;
  zoom: number;
  getZoom: () => number;
  setZoom: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const pinchRef = usePinchZoom(getZoom, setZoom);

  const sheet = song.sheetMusic ?? null;
  const kind = sheet ? previewKind(sheet.mimeType, sheet.fileName) : null;
  const url =
    song.conversationId && sheet
      ? `/api/conversations/${song.conversationId}/files/sheet_music?v=${encodeURIComponent(
          sheet.updatedAt,
        )}`
      : null;

  // Fetch text content lazily for text/markdown sheets.
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
  if (!song.conversationId) {
    return (
      <Centered>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Break
        </p>
        <p className="mt-2 text-2xl font-semibold">{song.title}</p>
      </Centered>
    );
  }

  if (!sheet || !url) {
    return (
      <Centered>
        <p className="text-lg font-medium">{song.title}</p>
        <p className="mt-1 text-sm text-neutral-500">No sheet music.</p>
      </Centered>
    );
  }

  if (kind === 'image') {
    // width = zoom% of the viewport: 100% fits the width; zooming in grows
    // it and the container scrolls (mx-auto centers when it's narrower).
    return (
      <div
        ref={pinchRef}
        style={{ touchAction: 'pan-x pan-y' }}
        className="h-full w-full overflow-auto bg-neutral-100 py-4 dark:bg-neutral-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={song.title}
          style={{ width: `${zoom}%`, maxWidth: 'none' }}
          className="mx-auto block h-auto"
        />
      </div>
    );
  }

  if (kind === 'pdf') {
    // #toolbar=0 hides the built-in PDF chrome; #zoom uses the viewer's own
    // (crisp) zoom rather than raster-scaling the iframe.
    return (
      <iframe
        title={song.title}
        src={`${url}#toolbar=0&navpanes=0&zoom=${zoom}`}
        className="h-full w-full border-0"
      />
    );
  }

  if (kind === 'text') {
    // Pasted text must NOT wrap — `whitespace-pre` keeps lines intact and the
    // container scrolls horizontally. Zoom drives the font size.
    return (
      <div
        ref={pinchRef}
        style={{ touchAction: 'pan-x pan-y' }}
        className="h-full w-full overflow-auto"
      >
        <pre
          style={{ fontSize: `${(zoom / 100) * 1.125}rem` }}
          className="w-max whitespace-pre px-6 py-12 font-mono leading-relaxed"
        >
          {text ?? 'Loading…'}
        </pre>
      </div>
    );
  }

  return (
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

/**
 * A tap-to-advance zone along one edge of the sheet, tablet-only (hidden on
 * phones and desktop). Fires only on a clean tap — a short, nearly-stationary
 * press by the primary pointer — so panning or pinching a zoomed sheet near
 * the edge doesn't accidentally change items.
 */
function EdgeTap({ side, onTap }: { side: 'left' | 'right'; onTap: () => void }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        if (e.isPrimary) start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
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
