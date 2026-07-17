'use client';

import { useEffect, useRef, useState } from 'react';
import { PickerButton, type PickedFile } from '../../PickerButton';
import { ConnectDriveButton } from '../../ConnectDriveButton';
import { useCanUseDrive } from '../../DriveCapabilityProvider';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { previewKind } from '@/lib/sheet-preview';

export interface SheetMusicMeta {
  fileName: string;
  mimeType: string;
  /** Last-write timestamp — used to cache-bust the preview on replace. */
  updatedAt: string;
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
  startClosed = true,
  variant = 'panel',
}: {
  conversationId: string;
  initial?: SheetMusicMeta | null;
  startClosed?: boolean;
  /**
   * 'panel' — the full container with preview + manage controls.
   * 'notice' — renders nothing when sheet music exists; otherwise a small
   * notice with an "Add sheet music" button (reuses the same add flow).
   */
  variant?: 'panel' | 'notice';
}) {
  const [meta, setMeta] = useState<SheetMusicMeta | null>(initial);
  const [busy, setBusy] = useState(false);
  const [isMinimized, setIsMinimized] = useState(startClosed);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const showToast = useToast();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';
  const canUseDrive = useCanUseDrive();

  // Drive users get a source picker (Drive vs. local); everyone else
  // goes straight to the local file input.
  const openChooser = () => setChooseOpen(true);

  const closeChooser = () => {
    if (busy) return;
    setChooseOpen(false);
    setPasteMode(false);
    setPasteText('');
  };

  // Save pasted text/markdown by turning it into a file and reusing the
  // local-upload path (the server allowlists text/markdown).
  const savePaste = async () => {
    const text = pasteText;
    if (!text.trim() || busy) return;
    const file = new File([text], 'sheet-music.md', { type: 'text/markdown' });
    setChooseOpen(false);
    setPasteMode(false);
    setPasteText('');
    await handleFile(file);
  };

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
        showToast('Sheet music saved.', 'success');
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDriveImport = async (file: PickedFile) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId: file.id }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { sheetMusic: SheetMusicMeta };
        setMeta(data.sheetMusic);
        showToast('Sheet music saved.', 'success');
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Close the source-choice modal on Escape.
  useEffect(() => {
    if (!chooseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setChooseOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chooseOpen, busy]);

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

  // Notice variant: nothing to show once sheet music exists.
  if (variant === 'notice' && meta) return null;

  return (
    <section
      className={
        variant === 'notice'
          ? 'flex items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-300 px-4 py-3 dark:border-neutral-700'
          : 'flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-800'
      }
    >
      {variant === 'notice' ? (
        <>
          <span className="text-sm text-neutral-500">
            No sheet music for this track.
          </span>
          <button
            type="button"
            onClick={openChooser}
            disabled={busy}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {busy ? 'Uploading…' : 'Add sheet music'}
          </button>
        </>
      ) : (
        <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            aria-label={isMinimized ? 'Expand sheet music' : 'Minimize sheet music'}
            aria-expanded={!isMinimized}
            title={isMinimized ? 'Expand sheet music' : 'Minimize sheet music'}
            className="-mr-1 px-2 py-2 text-xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
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
              <span aria-hidden="true">·</span> None available
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
                onClick={openChooser}
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
            onClick={openChooser}
            disabled={busy}
            className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-blue-500 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
            {busy ? 'Uploading…' : '+ Add sheet music (PDF, text, image)'}
          </button>
        ))}
        </>
      )}

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

      {chooseOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-source-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeChooser}
        >
          <div
            className={
              'w-full rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 ' +
              (pasteMode ? 'max-w-lg' : 'max-w-sm')
            }
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sheet-source-title" className="text-base font-semibold">
              Add sheet music
            </h2>

            {pasteMode ? (
              <>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Paste text or Markdown to save as sheet music.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={12}
                  autoFocus
                  placeholder="Paste lyrics, chords, or Markdown…"
                  className="mt-3 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasteMode(false);
                      setPasteText('');
                    }}
                    disabled={busy}
                    className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePaste()}
                    disabled={busy || !pasteText.trim()}
                    className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {canUseDrive
                    ? 'Choose a file from Google Drive, upload one from this device, or paste text.'
                    : 'Sign in with Google to import from Drive, upload from this device, or paste text.'}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {canUseDrive ? (
                    <PickerButton
                      apiKey={apiKey}
                      multiple={false}
                      label="Choose from Google Drive"
                      onPick={(files) => {
                        setChooseOpen(false);
                        const file = files[0];
                        if (file) void handleDriveImport(file);
                      }}
                    />
                  ) : (
                    <ConnectDriveButton label="Sign in with Google" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setChooseOpen(false);
                      inputRef.current?.click();
                    }}
                    className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Upload a local file
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasteMode(true)}
                    className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Paste text or Markdown
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeChooser}
                    disabled={busy}
                    className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
