'use client';

import { useCallback, useEffect, useState } from 'react';
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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-neutral-950">
      {/* Sheet fills everything; controls float on top. */}
      <div className="relative min-h-0 flex-1">
        {song ? (
          <SheetView song={song} zoom={zoom} />
        ) : (
          <Centered>Nothing to show.</Centered>
        )}

        {/* Edge tap zones for prev / next. */}
        {canBack && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous"
            className="group absolute inset-y-0 left-0 flex w-[15%] items-center justify-start pl-2 text-neutral-400"
          >
            <span className="rounded-full bg-black/5 px-2 py-3 text-2xl opacity-0 transition group-hover:opacity-100 dark:bg-white/10">
              ‹
            </span>
          </button>
        )}
        {canForward && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next"
            className="group absolute inset-y-0 right-0 flex w-[15%] items-center justify-end pr-2 text-neutral-400"
          >
            <span className="rounded-full bg-black/5 px-2 py-3 text-2xl opacity-0 transition group-hover:opacity-100 dark:bg-white/10">
              ›
            </span>
          </button>
        )}
      </div>

      {/* Top overlay: position + exit. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <span className="pointer-events-auto rounded-full bg-black/10 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
          {total === 0 ? '0 / 0' : `${current + 1} / ${total}`}
        </span>
        <button
          type="button"
          onClick={exit}
          aria-label="Exit live mode"
          className="pointer-events-auto rounded-full bg-black/10 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-black/20 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20"
        >
          ✕ Exit
        </button>
      </div>

      {/* Zoom control (only for viewable sheets). */}
      {zoomable && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/10 p-1 text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= 50}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              aria-label="Reset zoom"
              className="min-w-[3.25rem] rounded-full px-2 text-center text-xs font-medium tabular-nums hover:bg-black/10 dark:hover:bg-white/10"
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= 400}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetView({ song, zoom }: { song: PracticeSong; zoom: number }) {
  const [text, setText] = useState<string | null>(null);

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
      <div className="h-full w-full overflow-auto bg-neutral-100 py-4 dark:bg-neutral-900">
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
      <pre
        style={{ fontSize: `${(zoom / 100) * 1.125}rem` }}
        className="h-full w-full overflow-auto whitespace-pre px-6 py-12 font-mono leading-relaxed"
      >
        {text ?? 'Loading…'}
      </pre>
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
