'use client';

import { ensureOk } from '@/lib/api';
import { useRef, useState } from 'react';
import { ConfirmModal } from '../../../ConfirmModal';
import { Modal } from '../../../Modal';
import { PickerButton, type PickedFile } from '../../../PickerButton';
import { AUDIO_PICKER_FILTER } from '@/lib/picker-filters';
import {
  DropboxChooserButton,
  type DropboxPickedFile,
} from '../../../DropboxChooserButton';
import { ConnectDriveButton } from '../../../ConnectDriveButton';

const AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
];
import { useCanUseDrive } from '../../../DriveCapabilityProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { todayKey } from '../../../bands/[bandId]/audio/uploadDays';
import { formatDuration } from '@/lib/format';

export interface AudioVersionMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  songLength: number | null;
  isDefault: boolean;
  label: string | null;
  updatedAt: string;
}

/**
 * Manage a song's audio versions: list them, mark one the default (what the
 * player loads), delete one, and add more from Google Drive or a local file.
 * The default is enforced server-side; this UI just reflects it.
 */
export function AudioVersions({
  conversationId,
  apiKey,
  initial,
}: {
  conversationId: string;
  /** Google Picker API key, passed from a server component (see SheetMusic). */
  apiKey: string;
  initial: AudioVersionMeta[];
}) {
  const [versions, setVersions] = useState<AudioVersionMeta[]>(initial);
  const [busy, setBusy] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AudioVersionMeta | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const canUseDrive = useCanUseDrive();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const endpoint = `/api/conversations/${conversationId}/audio-versions`;
  // Uploads roll up per band per *local* day, and only the browser knows
  // which day that is (see lib/upload-day).
  const uploadEndpoint = () => `${endpoint}?day=${todayKey()}`;

  const refresh = async () => {
    const r = await fetch(endpoint, { cache: 'no-store' });
    if (r.ok) {
      const d = (await r.json()) as { versions: AudioVersionMeta[] };
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
        const res = await fetch(uploadEndpoint(), {
          method: 'POST',
          body: form,
        });
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

  const addFromJson = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(uploadEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  const addDrive = (file: PickedFile) => addFromJson({ driveFileId: file.id });
  const addDropbox = (file: DropboxPickedFile) =>
    addFromJson({ dropboxUrl: file.link, name: file.name, bytes: file.bytes });

  const makeDefault = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${endpoint}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default: true }),
        });
        await ensureOk(res);
      });
      // Reflect locally without a round-trip.
      setVersions((prev) =>
        prev.map((v) => ({ ...v, isDefault: v.id === id })),
      );
      showToast('Default version updated.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (v: AudioVersionMeta) => {
    setEditingId(v.id);
    setEditValue(v.label ?? '');
  };

  const saveLabel = async (id: string) => {
    if (busy) return;
    const label = editValue.trim() || null;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${endpoint}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        });
        await ensureOk(res);
      });
      setVersions((prev) =>
        prev.map((v) => (v.id === id ? { ...v, label } : v)),
      );
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
        const res = await fetch(`${endpoint}/${deleteTarget.id}`, {
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

  const openChooser = () => setChooseOpen(true);

  const isOnlyVersion = versions.length === 1;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Audio versions</h2>
      <p className="text-[0.6875rem] minor-text-theme-colors">
        The default version is what plays when the song loads. Notes are shared
        across all versions.
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
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.625rem] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[0.6875rem] minor-text-theme-colors">
                      {v.label ? `${v.fileName} · ` : ''}
                      {v.songLength != null
                        ? formatDuration(v.songLength)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(v)}
                      disabled={busy}
                      aria-label={`Edit label for ${v.label || v.fileName}`}
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
                      aria-label={`Delete version ${v.label || v.fileName}`}
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
        <p className="rounded-md border border-neutral-200 px-3 py-4 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          No audio yet. Add a version below.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={openChooser}
          disabled={busy}
          className="btn-outline"
        >
          {busy ? 'Adding…' : 'Add version'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.flac,.aac"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addLocal(file);
        }}
      />

      {chooseOpen && (
        <Modal
          onClose={() => setChooseOpen(false)}
          busy={busy}
          labelledBy="version-source-title"
          size="sm"
        >
          <h2 id="version-source-title" className="text-base font-semibold">
            Add audio version
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {canUseDrive
              ? 'Choose a file from Google Drive or upload one from this device.'
              : 'Sign in with Google to import from Drive, or upload one from this device.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {canUseDrive ? (
              <PickerButton
                apiKey={apiKey}
                multiple={false}
                filter={AUDIO_PICKER_FILTER}
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
            <DropboxChooserButton
              label="Choose from Dropbox"
              multiple={false}
              extensions={AUDIO_EXTENSIONS}
              onPick={(files) => {
                setChooseOpen(false);
                const file = files[0];
                if (file) void addDropbox(file);
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
        </Modal>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete this version?"
        description={
          isOnlyVersion
            ? 'This is the song’s only audio version — deleting it leaves the song with no audio. Notes are kept. This can’t be undone.'
            : 'Permanently deletes this audio version. If it’s the default, the newest remaining version becomes the default. Notes are kept. This can’t be undone.'
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
