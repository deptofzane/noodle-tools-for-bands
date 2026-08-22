'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LoadingBlock } from './Spinner';

/**
 * pdfjs v6 relies on Promise.withResolvers, which older Safari/iOS lacks.
 * Polyfill it before loading pdfjs so tablets on older OSes still render.
 */
function ensurePromiseWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === 'function') return;
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * Renders a PDF into a scrollable, zoomable container with PDF.js instead of
 * an <iframe>. iOS Safari won't scroll an iframe-embedded PDF (it shows only
 * the first page), so we rasterize each page onto a canvas inside a normal
 * scroll container — one-finger pan works everywhere, and the shared `zoom`
 * scales the pages via CSS width (cheap, so pinch stays smooth). Attaching the
 * Live pinch handler here (via `containerRef`) also enables pinch on PDFs.
 */
export function PdfView({
  url,
  title,
  zoom,
  containerRef,
  fitHeight = false,
}: {
  url: string;
  title: string;
  zoom: number;
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Run as tall as the pages instead of filling the parent, so the document
   * scrolls the page rather than a box inside it. Practice sets this; Live
   * doesn't — it's a fullscreen mode that pins `body` overflow and needs the
   * viewport-height scroller to page through a chart.
   */
  fitHeight?: boolean;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [targetPx, setTargetPx] = useState(1600);

  useEffect(() => {
    let cancelled = false;
    let task: {
      promise: Promise<PDFDocumentProxy>;
      destroy: () => Promise<void>;
    } | null = null;
    setStatus('loading');
    setPdf(null);

    (async () => {
      try {
        ensurePromiseWithResolvers();
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        // Rasterize at ~1.5× the display width (capped) so zooming in stays
        // crisp without blowing up memory on a phone.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base =
          containerRef.current?.clientWidth || window.innerWidth || 800;
        if (!cancelled)
          setTargetPx(Math.min(Math.round(base * dpr * 1.5), 2600));

        task = pdfjs.getDocument({ url });
        const doc = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        setPdf(doc);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url, containerRef]);

  return (
    <div
      ref={containerRef}
      style={{ touchAction: 'pan-x pan-y' }}
      /*
       * `overflow-x-auto` alone under `fitHeight` — deliberately no
       * `overflow-y-visible` to pair with it. CSS forbids that combination:
       * `visible` on one axis computes to `auto` when the other axis isn't
       * visible, so asking for it changes nothing. The vertical scrollbar
       * stays away because the height is the content's, leaving nothing to
       * scroll, not because this says so.
       */
      className={
        fitHeight
          ? 'w-full overflow-x-auto bg-neutral-100 dark:bg-neutral-900'
          : 'h-full w-full overflow-auto bg-neutral-100 dark:bg-neutral-900'
      }
    >
      <div
        style={{ width: `${zoom}%` }}
        className="mx-auto flex flex-col items-center gap-2 py-4"
      >
        {pdf
          ? Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage
                key={i}
                pdf={pdf}
                pageNumber={i + 1}
                targetPx={targetPx}
                title={title}
              />
            ))
          : null}
        {status === 'loading' && <LoadingBlock label="Loading PDF" />}
        {status === 'error' && (
          <p className="py-8 text-center text-sm minor-text-theme-colors">
            Could not display this PDF.
          </p>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  targetPx,
  title,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  targetPx: number;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const scale = targetPx / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      task = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        // superseded / cancelled render — ignore
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, targetPx]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`${title}, page ${pageNumber}`}
      className="block h-auto w-full bg-white shadow-sm"
    />
  );
}
