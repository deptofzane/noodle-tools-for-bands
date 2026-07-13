'use client';

import { useRef, useState } from 'react';
import { ConfirmModal } from '../../../ConfirmModal';
import { PickerButton, type PickedFile } from '../../../PickerButton';
import { useCanUseDrive } from '../../../DriveCapabilityProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
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
  initial,
}: {
  conversationId: string;
  initial: AudioVersionMeta[];
}) {
  const [versions, setVersions] = useState<AudioVersionMeta[]>(initial);
  const [busy, setBusy] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AudioVersionMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUseDrive = useCanUseDrive();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';

  const endpoint = `/api/conversations/${conversationId}/audio-versions`;

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
        const res = await fetch(endpoint, { method: 'POST', body: form });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
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
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId: file.id }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
        await refresh();
      });
      showToast('Version added.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
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

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${endpoint}/${deleteTarget.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
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

  const openChooser = () =>
    canUseDrive ? setChooseOpen(true) : inputRef.current?.click();

  const isOnlyVersion = versions.length === 1;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Audio versions</h2>
      <p className="text-[11px] text-neutral-500">
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
                <span className="truncate text-[11px] text-neutral-500">
                  {v.label ? `${v.fileName} · ` : ''}
                  {v.songLength != null ? formatDuration(v.songLength) : '—'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-neutral-200 px-3 py-4 text-center text-sm text-neutral-500 dark:border-neutral-800">
          No audio yet. Add a version below.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={openChooser}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="version-source-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!busy) setChooseOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="version-source-title" className="text-base font-semibold">
              Add audio version
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Choose a file from Google Drive or upload one from this device.
            </p>
            <div className="mt-4 flex flex-col gap-2">
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
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setChooseOpen(false)}
                disabled={busy}
                className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
