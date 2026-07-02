'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '../../../ConfirmModal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { SheetMusic, type SheetMusicMeta } from '../SheetMusic';

interface BandOption {
  id: string;
  name: string;
}

/**
 * Edit a song: rename it, move it to another band you belong to, manage
 * its sheet music, or delete it (cascades all its notes/files). Any band
 * member can edit; the API enforces membership.
 */
export function EditSongClient({
  conversationId,
  initialName,
  initialBandId,
  initialArchived,
  bands,
  sheetMusic,
}: {
  conversationId: string;
  initialName: string;
  initialBandId: string;
  initialArchived: boolean;
  bands: BandOption[];
  sheetMusic: SheetMusicMeta | null;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [bandId, setBandId] = useState(initialBandId);
  const [savedBandId, setSavedBandId] = useState(initialBandId);
  const [archived, setArchived] = useState(initialArchived);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const patch = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message ?? `HTTP ${res.status}`);
    }
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName || busy) return;
    setBusy(true);
    try {
      await trackPending(() => patch({ name: trimmed }));
      setSavedName(trimmed);
      showToast('Song renamed.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async () => {
    if (bandId === savedBandId || busy) return;
    setBusy(true);
    try {
      await trackPending(() => patch({ bandId }));
      setSavedBandId(bandId);
      const target = bands.find((b) => b.id === bandId)?.name ?? 'the band';
      showToast(`Moved to ${target}.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBandId(savedBandId); // revert the select
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchive = async () => {
    if (busy) return;
    const next = !archived;
    setBusy(true);
    try {
      await trackPending(() => patch({ archived: next }));
      setArchived(next);
      showToast(next ? 'Song archived.' : 'Song unarchived.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 204) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
      });
      router.push('/open-conversations');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit song</h1>

      {/* Name */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Name</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={busy || !name.trim() || name.trim() === savedName}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      {/* Band */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Band</label>
        <div className="flex gap-2">
          <select
            value={bandId}
            onChange={(e) => setBandId(e.target.value)}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleMove}
            disabled={busy || bandId === savedBandId}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Move
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Moving changes who can access this song — only members of the new band
          will see it.
        </p>
      </section>

      {/* Sheet music (reuses the song-page panel) */}
      <SheetMusic conversationId={conversationId} initial={sheetMusic} />

      {/* Archive */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Archive</h2>
        <p className="text-[11px] text-neutral-500">
          {archived
            ? 'This song is archived — it appears under “Archived Audio” on the band page.'
            : 'Archiving moves this song into a separate “Archived Audio” list on the band page. It keeps all of its notes and files.'}
        </p>
        <div>
          <button
            type="button"
            onClick={handleToggleArchive}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {archived ? 'Unarchive song' : 'Archive song'}
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="flex flex-col gap-2 rounded-lg border border-red-200 p-4 dark:border-red-900">
        <h2 className="text-sm font-medium text-red-700 dark:text-red-400">
          Delete song
        </h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Permanently deletes this song and all of its notes, sheet music, and
          activity. This can’t be undone.
        </p>
        <div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete song
          </button>
        </div>
      </section>

      <ConfirmModal
        open={deleteOpen}
        title="Delete song?"
        description="This permanently deletes the song and all of its notes, sheet music, and activity. This can’t be undone."
        confirmLabel="Delete song"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
