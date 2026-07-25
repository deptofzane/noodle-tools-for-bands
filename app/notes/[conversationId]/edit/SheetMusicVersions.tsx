'use client';

import { ensureOk } from '@/lib/api';
import { useRef, useState } from 'react';
import { ConfirmModal } from '../../../ConfirmModal';
import { Modal } from '../../../Modal';
import { PickerButton, type PickedFile } from '../../../PickerButton';
import { ConnectDriveButton } from '../../../ConnectDriveButton';
import { useCanUseDrive } from '../../../DriveCapabilityProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import {
  SHEET_TEXT_FORMATS,
  sheetFormatFile,
  type SheetTextFormat,
} from '@/lib/sheet-preview';

export interface SheetVersionMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isDefault: boolean;
  label: string | null;
  updatedAt: string;
}

/**
 * Manage a song's sheet-music versions: list them, mark one the default (what
 * a member sees unless they've picked their own), rename, delete, and add more
 * (upload, Drive, or a pasted Markdown/ChordPro chart). Mirrors AudioVersions.
 */
export function SheetMusicVersions({
  conversationId,
  apiKey,
  initial,
}: {
  conversationId: string;
  apiKey: string;
  initial: SheetVersionMeta[];
}) {
  const [versions, setVersions] = useState<SheetVersionMeta[]>(initial);
  const [busy, setBusy] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<SheetTextFormat>('markdown');
  const [deleteTarget, setDeleteTarget] = useState<SheetVersionMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const canUseDrive = useCanUseDrive();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const versionsUrl = `/api/conversations/${conversationId}/sheet-music-versions`;
  const addUrl = `/api/conversations/${conversationId}/files/sheet_music`;

  const refresh = async () => {
    const r = await fetch(versionsUrl, { cache: 'no-store' });
    if (r.ok) {
      const d = (await r.json()) as { versions: SheetVersionMeta[] };
      setVersions(d.versions);
    }
  };

  const addLocal = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(addUrl, { method: 'POST', body: form });
        await ensureOk(res);
        await refresh();
      });
      showToast('Version added.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const addDrive = async (file: PickedFile) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(addUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId: file.id }),
        });
        await ensureOk(res);
        await refresh();
      });
      showToast('Version added.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const savePaste = async () => {
    const text = pasteText;
    if (!text.trim() || busy) return;
    const f = sheetFormatFile(pasteFormat);
    const file = new File([text], f.name, { type: f.type });
    setChooseOpen(false);
    setPasteMode(false);
    setPasteText('');
    await addLocal(file);
  };

  const makeDefault = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${versionsUrl}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default: true }),
        });
        await ensureOk(res);
      });
      setVersions((prev) => prev.map((v) => ({ ...v, isDefault: v.id === id })));
      showToast('Default version updated.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (v: SheetVersionMeta) => {
    setEditingId(v.id);
    setEditValue(v.label ?? '');
  };

  const saveLabel = async (id: string) => {
    if (busy) return;
    const label = editValue.trim() || null;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${versionsUrl}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        });
        await ensureOk(res);
      });
      setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, label } : v)));
      setEditingId(null);
      showToast('Label updated.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${versionsUrl}/${deleteTarget.id}`, {
          method: 'DELETE',
        });
        await ensureOk(res);
        await refresh();
      });
      showToast('Version deleted.', 'success');
      setDeleteTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const isOnlyVersion = versions.length === 1;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Sheet music versions</h2>
      <p className="text-[11px] text-neutral-500">
        The default is what members see unless they’ve chosen their own version
        to view. Notes are shared across all versions.
      </p>

      {versions.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              {editingId === v.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveLabel(v.id);
                  }}
                >
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    maxLength={100}
                    placeholder={v.fileName}
                    aria-label="Version label"
                    className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm">
                        {v.label || v.fileName}
                      </span>
                      {v.isDefault && (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Default
                        </span>
                      )}
                    </span>
                    {v.label && (
                      <span className="truncate text-[11px] text-neutral-500">
                        {v.fileName}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(v)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      {v.label ? 'Rename' : 'Label'}
                    </button>
                    {!v.isDefault && (
                      <button
                        type="button"
                        onClick={() => makeDefault(v.id)}
                        disabled={busy}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(v)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-neutral-200 px-3 py-4 text-center text-sm text-neutral-500 dark:border-neutral-800">
          No sheet music yet. Add a version below.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setChooseOpen(true)}
          disabled={busy}
          className="btn-outline"
        >
          {busy ? 'Adding…' : 'Add version'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,.cho,.chopro,.chordpro,.pro,.crd,image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addLocal(file);
        }}
      />

      {chooseOpen && (
        <Modal
          onClose={() => {
            if (busy) return;
            setChooseOpen(false);
            setPasteMode(false);
            setPasteText('');
          }}
          busy={busy}
          labelledBy="sheet-version-source-title"
          size={pasteMode ? 'lg' : 'sm'}
        >
          <h2 id="sheet-version-source-title" className="text-base font-semibold">
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
                      if (file) void addDrive(file);
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
                  onClick={() => setChooseOpen(false)}
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

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete this version?"
        description={
          isOnlyVersion
            ? 'This is the song’s only sheet-music version — deleting it leaves the song with none. This can’t be undone.'
            : 'Permanently deletes this sheet-music version. If it’s the default, the newest remaining version becomes the default. This can’t be undone.'
        }
        confirmLabel="Delete version"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
