'use client';

import { useEffect, useId, useState } from 'react';
import type { BandFile, FileWarning } from '@/lib/db/song-files';
import { formatBytes } from '@/lib/format';
import { Modal } from '../../../Modal';

export type DeleteResult = {
  deleted: string[];
  skipped: string[];
  freedBytes: number;
  usage: { bytes: number; files: number };
};

/**
 * Confirms a batch delete, with every file's warnings gathered in one place.
 *
 * The point of the list is that it's editable: a warning is only useful if
 * you can act on it, so each row can be dropped from the batch here rather
 * than making someone cancel and rebuild the selection.
 */
export function DeleteFilesDialog({
  bandId,
  files,
  onCancel,
  onDeleted,
}: {
  bandId: string;
  /** The selection being confirmed. Fixed for the dialog's lifetime. */
  files: BandFile[];
  onCancel: () => void;
  /** The server's answer, including the band's fresh storage total. */
  onDeleted: (result: DeleteResult) => void;
}) {
  const titleId = useId();
  /*
   * What's still going. Unchecking leaves the row on the list rather than
   * removing it — someone reading a warning may well change their mind back,
   * and a row that vanishes takes that option with it.
   */
  const [keep, setKeep] = useState<Set<string>>(
    () => new Set(files.map((f) => f.id)),
  );
  const [warnings, setWarnings] = useState<Map<string, FileWarning>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doomed = files.filter((f) => keep.has(f.id));
  const totalBytes = doomed.reduce((sum, f) => sum + f.sizeBytes, 0);
  const key = [...keep].sort().join(',');

  /*
   * Warnings are judged against the whole batch — "the last audio" means the
   * last one *left after this delete* — so dropping a row can clear another
   * row's warning. That's why this re-runs on every change to the set rather
   * than once when the dialog opens. Stale warnings stay on screen while the
   * next answer is in flight; blanking them would make the list flicker on
   * every checkbox.
   */
  useEffect(() => {
    if (keep.size === 0) return;
    let live = true;
    fetch(`/api/bands/${bandId}/files/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [...keep] }),
    })
      .then((res) => (res.ok ? res.json() : { warnings: [] }))
      .then((data: { warnings: FileWarning[] }) => {
        if (live) setWarnings(new Map(data.warnings.map((w) => [w.fileId, w])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // `key` is the set's contents; `ids` itself is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandId, key]);

  const toggle = (id: string) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bands/${bandId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: [...keep] }),
      });
      if (!res.ok) {
        setError(
          res.status === 403
            ? 'Only a band owner can delete files.'
            : 'Those files could not be deleted.',
        );
        return;
      }
      onDeleted((await res.json()) as DeleteResult);
    } catch {
      setError('Those files could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onCancel} busy={busy} labelledBy={titleId} size="lg">
      <h2 id={titleId} className="text-base font-semibold">
        Delete {doomed.length} file{doomed.length === 1 ? '' : 's'}?
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        This frees {formatBytes(totalBytes)} and can’t be undone. Uncheck
        anything you’d rather keep.
      </p>

      <ul className="mt-3 max-h-[45vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
        {files.map((file) => {
          const warning = keep.has(file.id) ? warnings.get(file.id) : undefined;
          const notes = [
            warning?.lastAudio && 'This is the song’s only audio file.',
            warning?.chosenByOthers
              ? `${warning.chosenByOthers} other member${
                  warning.chosenByOthers === 1 ? '' : 's'
                } read this chart.`
              : null,
          ].filter(Boolean) as string[];

          return (
            <li key={file.id} className="flex gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={keep.has(file.id)}
                onChange={() => toggle(file.id)}
                disabled={busy}
                aria-label={`Delete ${file.fileName}`}
                className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
              />
              <div
                className={
                  'min-w-0 flex-1 ' + (keep.has(file.id) ? '' : 'opacity-50')
                }
              >
                <p className="break-all text-sm">{file.fileName}</p>
                <p className="text-xs text-fg-muted">
                  {file.songName}
                  {file.songArchived ? ' · Archived' : ''} ·{' '}
                  {formatBytes(file.sizeBytes)}
                </p>
                {notes.map((note) => (
                  <p key={note} className="mt-1 text-xs text-warn">
                    {note}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-sm text-danger-strong" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || doomed.length === 0}
          className="rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 md:px-3 md:py-1.5"
        >
          {busy
            ? 'Deleting…'
            : `Delete ${doomed.length} file${doomed.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}
