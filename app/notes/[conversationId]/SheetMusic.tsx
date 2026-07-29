'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../../Modal';
import { PickerButton, type PickedFile } from '../../PickerButton';
import {
  DropboxChooserButton,
  type DropboxPickedFile,
} from '../../DropboxChooserButton';
import { ConnectDriveButton } from '../../ConnectDriveButton';

export const SHEET_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.cho',
  '.chopro',
  '.chordpro',
  '.pro',
  '.crd',
];
import { useCanUseDrive } from '../../DriveCapabilityProvider';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import {
  previewKind,
  SHEET_TEXT_FORMATS,
  sheetFormatFile,
  type SheetTextFormat,
} from '@/lib/sheet-preview';
import { SheetText } from './SheetText';
import { PdfView } from '../../PdfView';
import {
  usePersistedZoom,
  ZOOM_MIN,
  ZOOM_MAX,
} from '../../usePersistedZoom';

/** Kept for callers that still pass a default-version meta as `initial`. */
export interface SheetMusicMeta {
  fileName: string;
  mimeType: string;
  updatedAt: string;
}

interface SheetVersion {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isDefault: boolean;
  label: string | null;
  updatedAt: string;
}

/**
 * Sheet music attached to a song. A song can have multiple versions (e.g. a
 * transposed or instrument-specific chart); this panel shows the version the
 * viewer prefers (their saved choice, else the song's default), lets them
 * switch — persisting that choice per-user — and add more. Full management
 * (rename / set default / delete) lives on the edit screen.
 *
 * Safe to embed: uploads are allowlisted (no HTML/SVG) and served with
 * `X-Content-Type-Options: nosniff`.
 */
export function SheetMusic({
  conversationId,
  apiKey,
  startClosed = true,
  zoomKey,
}: {
  conversationId: string;
  /** Google Picker API key, passed from a server component. */
  apiKey: string;
  startClosed?: boolean;
  /** Legacy: a default-version meta for first paint (currently ignored). */
  initial?: SheetMusicMeta | null;
  /**
   * Opt-in per-song zoom (Practice). When set (a stable key such as the song's
   * conversation id), the panel shows a zoom control, persists the zoom under
   * this key, and renders PDFs with PDF.js so they scale. Omitted on the song
   * page, which keeps its plain, un-zoomed rendering.
   */
  zoomKey?: string | null;
}) {
  const [versions, setVersions] = useState<SheetVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(startClosed);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<SheetTextFormat>('markdown');
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const trackPending = useTrackPending();
  const showToast = useToast();
  const canUseDrive = useCanUseDrive();

  const base = `/api/conversations/${conversationId}`;
  const versionsUrl = `${base}/sheet-music-versions`;
  const addUrl = `${base}/files/sheet_music`;

  const loadVersions = useCallback(
    async (selectId?: string) => {
      try {
        const r = await fetch(versionsUrl, { cache: 'no-store' });
        if (!r.ok) {
          setVersions([]);
          return;
        }
        const d = (await r.json()) as {
          versions: SheetVersion[];
          preferredId: string | null;
        };
        setVersions(d.versions);
        setSelectedId((prev) =>
          selectId ??
          (prev && d.versions.some((v) => v.id === prev) ? prev : d.preferredId),
        );
      } catch {
        setVersions([]);
      }
    },
    [versionsUrl],
  );

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const viewUrl = selected
    ? `${addUrl}?version=${selected.id}&v=${encodeURIComponent(selected.updatedAt)}`
    : addUrl;
  const kind = selected ? previewKind(selected.mimeType, selected.fileName) : 'other';

  // Opt-in per-song zoom (Practice passes a stable `zoomKey`). Persisted under
  // that key and shared with Live, so a song keeps its zoom across modes.
  const zoomEnabled = zoomKey != null;
  const [zoom, setZoom] = usePersistedZoom(zoomKey ?? null);
  const zoomable =
    zoomEnabled &&
    !!selected &&
    (kind === 'image' || kind === 'pdf' || kind === 'text');
  const zoomIn = () => setZoom((z) => z + 10);
  const zoomOut = () => setZoom((z) => z - 10);
  const resetZoom = () => setZoom(100);

  // Lazily fetch text content when the panel is open and the file is text.
  useEffect(() => {
    if (isMinimized || !selected || kind !== 'text') {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    setTextContent(null);
    fetch(viewUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => !cancelled && setTextContent(t))
      .catch(() => !cancelled && setTextContent('(Could not load file.)'));
    return () => {
      cancelled = true;
    };
  }, [isMinimized, kind, viewUrl, selected]);

  // Switching versions persists the choice for this user (best-effort).
  const selectVersion = (id: string) => {
    setSelectedId(id);
    void fetch(`${base}/sheet-music-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: id }),
    }).catch(() => {});
  };

  const openChooser = () => setChooseOpen(true);
  const closeChooser = () => {
    if (busy) return;
    setChooseOpen(false);
    setPasteMode(false);
    setPasteText('');
  };

  const addVersionFrom = async (
    doPost: () => Promise<Response>,
    onDone?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await doPost();
        await ensureOk(res);
        const { version } = (await res.json()) as { version: SheetVersion };
        await loadVersions(version.id);
      });
      showToast('Sheet music added.', 'success');
      onDone?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFile = (file: File) =>
    addVersionFrom(() => {
      const form = new FormData();
      form.append('file', file);
      return fetch(addUrl, { method: 'POST', body: form });
    });

  const handleDriveImport = (file: PickedFile) =>
    addVersionFrom(() =>
      fetch(addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId: file.id }),
      }),
    );

  const handleDropboxImport = (file: DropboxPickedFile) =>
    addVersionFrom(() =>
      fetch(addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dropboxUrl: file.link,
          name: file.name,
          bytes: file.bytes,
        }),
      }),
    );

  const savePaste = async () => {
    const text = pasteText;
    if (!text.trim() || busy) return;
    const f = sheetFormatFile(pasteFormat);
    const file = new File([text], f.name, { type: f.type });
    setChooseOpen(false);
    setPasteMode(false);
    setPasteText('');
    await handleFile(file);
  };

  const hasSheet = (versions?.length ?? 0) > 0;

  return (
    <section className="flex flex-col gap-2 border-b border-neutral-200 py-2 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            aria-label={isMinimized ? 'Expand sheet music' : 'Minimize sheet music'}
            aria-expanded={!isMinimized}
            className="-mr-1 flex gap-2 w-full px-2 py-2 text-xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <span aria-hidden="true">{isMinimized ? '▸' : '▾'}</span>
            <h2 className="text-sm text-nowrap font-medium">Sheet music</h2>
          </button>
          {isMinimized && !hasSheet && versions !== null && (
            <span className="truncate text-xs text-red-300">
              <span aria-hidden="true">·</span> None available
            </span>
          )}
        </span>
        {!isMinimized && hasSheet && (zoomable || versions!.length > 1) && (
          <div className="flex items-center gap-2">
            {zoomable && (
              <div className="flex items-center rounded-md border border-neutral-300 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Zoom out"
                  className="px-2 py-1 text-base leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  aria-label="Reset zoom"
                  title="Reset zoom"
                  className="min-w-[2.75rem] px-1 text-center text-xs font-medium tabular-nums hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Zoom in"
                  className="px-2 py-1 text-base leading-none hover:bg-neutral-50 disabled:opacity-30 dark:hover:bg-neutral-900"
                >
                  +
                </button>
              </div>
            )}
            {versions!.length > 1 && (
              <select
                value={selectedId ?? ''}
                onChange={(e) => selectVersion(e.target.value)}
                aria-label="Sheet music version"
                title="Version to view"
                className="min-w-0 max-w-[12rem] shrink truncate rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                {versions!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {(v.label || v.fileName) + (v.isDefault ? ' (default)' : '')}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {!isMinimized &&
        (versions === null ? (
          <p className="text-xs text-neutral-500">Loading…</p>
        ) : hasSheet && selected ? (
          <div className="flex flex-col gap-2">
            {kind === 'image' &&
              (zoomEnabled ? (
                // Zoom % lives on a wrapper (no max-width cap) inside a scroll
                // container; the img fills it so zooming isn't fighting
                // `img { max-width: 100% }`.
                <div className="max-h-[60vh] overflow-auto rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900">
                  <div style={{ width: `${zoom}%` }} className="mx-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={viewUrl}
                      alt={selected.label || selected.fileName}
                      className="block h-auto w-full"
                    />
                  </div>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewUrl}
                  alt={selected.label || selected.fileName}
                  className="max-h-[60vh] w-full rounded-md border border-neutral-200 object-contain dark:border-neutral-800"
                />
              ))}
            {kind === 'pdf' &&
              (zoomEnabled ? (
                // PDF.js renders each page to a canvas that scales with `zoom`
                // (an <iframe> can't be zoomed and won't scroll on iOS).
                <div className="h-[60vh] w-full overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
                  <PdfView
                    url={viewUrl}
                    title={selected.label || selected.fileName}
                    zoom={zoom}
                    containerRef={pdfRef}
                  />
                </div>
              ) : (
                <iframe
                  title={selected.label || selected.fileName}
                  src={viewUrl}
                  className="h-[60vh] w-full rounded-md border border-neutral-200 dark:border-neutral-800"
                />
              ))}
            {kind === 'text' && (
              <div
                style={
                  zoomEnabled
                    ? { fontSize: `calc(var(--sheet-base) * ${zoom / 100})` }
                    : undefined
                }
                className={
                  'overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900' +
                  (zoomEnabled ? '' : ' sheet-base')
                }
              >
                {textContent === null ? (
                  <span className="text-xs text-neutral-500">Loading…</span>
                ) : (
                  <SheetText text={textContent} fileName={selected.fileName} />
                )}
              </div>
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
                Open “{selected.label || selected.fileName}” in a new tab
              </a>
              <button
                type="button"
                onClick={openChooser}
                disabled={busy}
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                {busy ? 'Adding…' : 'Add version'}
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

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,.cho,.chopro,.chordpro,.pro,.crd,image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {chooseOpen && (
        <Modal
          onClose={closeChooser}
          busy={busy}
          labelledBy="sheet-source-title"
          size={pasteMode ? 'lg' : 'sm'}
        >
          <h2 id="sheet-source-title" className="text-base font-semibold">
            Add sheet music version
          </h2>

          {pasteMode ? (
            <>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Write or paste Markdown, a ChordPro chart ([C]lyrics with{' '}
                {'{directives}'}), or plain source text.
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Format:</span>
                {SHEET_TEXT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPasteFormat(f.id)}
                    aria-pressed={pasteFormat === f.id}
                    className={
                      'rounded-md px-2 py-1 text-xs font-medium ' +
                      (pasteFormat === f.id
                        ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                        : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={12}
                autoFocus
                placeholder="Lyrics, chords, or Markdown…"
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
                  className="btn-ghost"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void savePaste()}
                  disabled={busy || !pasteText.trim()}
                  className="btn-primary"
                >
                  {busy ? 'Saving…' : 'Add version'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {canUseDrive
                  ? 'Choose a file from Google Drive, upload one, or paste text.'
                  : 'Sign in with Google to import from Drive, upload one, or paste text.'}
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
                <DropboxChooserButton
                  label="Choose from Dropbox"
                  multiple={false}
                  extensions={SHEET_EXTENSIONS}
                  onPick={(files) => {
                    setChooseOpen(false);
                    const file = files[0];
                    if (file) void handleDropboxImport(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setChooseOpen(false);
                    inputRef.current?.click();
                  }}
                  className="btn-outline"
                >
                  Upload a local file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasteFormat('markdown');
                    setPasteMode(true);
                  }}
                  className="btn-outline"
                >
                  Paste text or Markdown
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={closeChooser}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
