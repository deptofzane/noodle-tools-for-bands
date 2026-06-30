'use client';

import { useRef, useState } from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';

export interface SheetMusicMeta {
  fileName: string;
  mimeType: string;
}

/**
 * Sheet music attached to a song. Any band member can view, upload,
 * replace, or remove it. Stored alongside the audio in `song_files`
 * (kind `sheet_music`); served from / posted to
 * `/api/conversations/[id]/files/sheet_music`.
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
  const [isMinimized, setIsMinimized] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const showToast = useToast();

  const endpoint = `/api/conversations/${conversationId}/files/sheet_music`;
  // Cache-bust so a freshly replaced file isn't served from cache.
  const viewUrl = `${endpoint}?v=${encodeURIComponent(meta?.fileName ?? '')}`;

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
          <div className="flex items-center justify-between gap-3 text-sm">
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
            >
              {meta.fileName}
            </a>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
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
        accept=".pdf,.txt,.md,image/*,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </section>
  );
}
