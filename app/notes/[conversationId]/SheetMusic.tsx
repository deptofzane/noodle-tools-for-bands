'use client';

import { useEffect, useRef, useState } from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';

export interface SheetMusicMeta {
  fileName: string;
  mimeType: string;
  /** Last-write timestamp — used to cache-bust the preview on replace. */
  updatedAt: string;
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

/** How to render a file inline, from its MIME type (with extension fallback). */
function previewKind(mime: string, fileName: string): PreviewKind {
  const m = (mime || '').toLowerCase();
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (m === 'image/svg+xml' || ext === 'svg') return 'other'; // never inline SVG
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('text/') || ['txt', 'md', 'markdown', 'csv'].includes(ext))
    return 'text';
  return 'other';
}

/**
 * Sheet music attached to a song. Shows the uploaded file inline (image /
 * PDF / text), with view-in-new-tab, replace, and remove. Any band member
 * can manage it.
 *
 * Safe to embed: the upload route restricts to an allowlist (no HTML/SVG)
 * and serves with `X-Content-Type-Options: nosniff`, so a malicious file
 * can't execute scripts same-origin. The preview is only mounted while the
 * panel is expanded, so large files aren't fetched until opened.
 */
export function SheetMusic({
  conversationId,
  initial = null,
}: {
  conversationId: string;
  initial?: SheetMusicMeta | null;
}) {
  const [meta, setMeta] = useState<SheetMusicMeta | null>(initial);
  const [busy, setBusy] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [textContent, setTextContent] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const showToast = useToast();

  const endpoint = `/api/conversations/${conversationId}/files/sheet_music`;
  const viewUrl = meta
    ? `${endpoint}?v=${encodeURIComponent(meta.updatedAt)}`
    : endpoint;
  const kind = meta ? previewKind(meta.mimeType, meta.fileName) : 'other';

  // Lazily fetch text content when the panel is open and the file is text.
  useEffect(() => {
    if (isMinimized || !meta || kind !== 'text') return;
    let cancelled = false;
    setTextContent(null);
    fetch(viewUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        if (!cancelled) setTextContent(t);
      })
      .catch(() => {
        if (!cancelled) setTextContent('(Could not load file.)');
      });
    return () => {
      cancelled = true;
    };
  }, [isMinimized, kind, meta, viewUrl]);

  const handleFile = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(endpoint, { method: 'POST', body: form });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { sheetMusic: SheetMusicMeta };
        setMeta(data.sheetMusic);
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
      });
      setMeta(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            aria-label={isMinimized ? 'Expand sheet music' : 'Minimize sheet music'}
            aria-expanded={!isMinimized}
            title={isMinimized ? 'Expand sheet music' : 'Minimize sheet music'}
            className="-mr-1 px-1 text-sm leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <span aria-hidden="true">{isMinimized ? '▸' : '▾'}</span>
          </button>
          <h2 className="text-sm font-medium">Sheet music</h2>
          {isMinimized && meta && (
            <span className="truncate text-xs text-neutral-500">
              <span aria-hidden="true">·</span> {meta.fileName}
            </span>
          )}
          {isMinimized && !meta && (
            <span className="truncate text-xs text-red-300">
              <span aria-hidden="true">·</span> None provided
            </span>
          )}
        </span>
        {meta && !isMinimized && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="shrink-0 text-xs text-neutral-500 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          >
            Remove
          </button>
        )}
      </div>

      {!isMinimized &&
        (meta ? (
          <div className="flex flex-col gap-2">
            {kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewUrl}
                alt={meta.fileName}
                className="max-h-[60vh] w-full rounded-md border border-neutral-200 object-contain dark:border-neutral-800"
              />
            )}
            {kind === 'pdf' && (
              <iframe
                title={meta.fileName}
                src={viewUrl}
                className="h-[60vh] w-full rounded-md border border-neutral-200 dark:border-neutral-800"
              />
            )}
            {kind === 'text' && (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                {textContent ?? 'Loading…'}
              </pre>
            )}
            {kind === 'other' && (
              <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
                Preview isn’t available for this file type.
              </p>
            )}

            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-blue-600 hover:underline dark:text-blue-400"
              >
                Open “{meta.fileName}” in a new tab
              </a>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                {busy ? 'Uploading…' : 'Replace'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-blue-500 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
            {busy ? 'Uploading…' : '+ Add sheet music (PDF, text, image)'}
          </button>
        ))}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </section>
  );
}
