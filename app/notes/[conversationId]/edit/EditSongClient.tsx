'use client';

import { ensureOk } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCanGoBack } from '../../../NavigationHistoryProvider';
import { ConfirmModal } from '../../../ConfirmModal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { SheetMusic, type SheetMusicMeta } from '../SheetMusic';
import { AudioVersions, type AudioVersionMeta } from './AudioVersions';

interface BandOption {
  id: string;
  name: string;
}

/**
 * Edit a song: rename it, move it to another band you belong to, and set its
 * tempo/key — all committed together via "Save all changes" (Cancel discards
 * and returns to the song). Sheet music and audio versions manage themselves;
 * archive and delete stay separate actions. Any band member can edit; the API
 * enforces membership.
 */
const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

export function EditSongClient({
  conversationId,
  apiKey,
  initialName,
  initialBandId,
  initialArchived,
  initialBpm,
  initialKey,
  bands,
  audioVersions,
  sheetMusic,
}: {
  conversationId: string;
  apiKey: string;
  initialName: string;
  initialBandId: string;
  initialArchived: boolean;
  initialBpm: number | null;
  initialKey: string | null;
  bands: BandOption[];
  audioVersions: AudioVersionMeta[];
  sheetMusic: SheetMusicMeta | null;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [name, setName] = useState(initialName);
  const [bandId, setBandId] = useState(initialBandId);
  const [archived, setArchived] = useState(initialArchived);
  const [bpm, setBpm] = useState(initialBpm != null ? String(initialBpm) : '');
  const [key, setKey] = useState(initialKey ?? '');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Baselines to diff against. A successful save navigates away, so these
  // never need to change after mount.
  const savedName = initialName;
  const savedBandId = initialBandId;
  const savedBpm = initialBpm != null ? String(initialBpm) : '';
  const savedKey = initialKey ?? '';

  const songHref = `/notes/${conversationId}`;
  const nameTrim = name.trim();
  const bpmTrim = bpm.trim();
  const keyTrim = key.trim();
  const dirty =
    nameTrim !== savedName ||
    bandId !== savedBandId ||
    bpmTrim !== savedBpm ||
    keyTrim !== savedKey;
  const canSave = dirty && nameTrim !== '' && !busy;

  // Guard a hard unload (refresh / tab close) while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Return to the page the user came from (in-app history), falling back to
  // the song itself on a fresh load / deep link.
  const leave = () => {
    if (canGoBack()) router.back();
    else router.push(songHref);
  };

  // Cancel: confirm first if there are unsaved edits, otherwise leave directly.
  const handleCancel = () => {
    if (dirty) setLeaveOpen(true);
    else leave();
  };

  const patch = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await ensureOk(res);
  };

  const handleSaveAll = async () => {
    if (!canSave) return;
    const nextBpm = bpmTrim === '' ? null : Number(bpmTrim);
    if (
      nextBpm !== null &&
      (!Number.isInteger(nextBpm) || nextBpm < 1 || nextBpm > 400)
    ) {
      showToast('BPM must be a whole number from 1 to 400.');
      return;
    }
    const nextKey = keyTrim === '' ? null : keyTrim;

    // Send only what changed, so the API doesn't emit a spurious update.
    const payload: Record<string, unknown> = {};
    if (nameTrim !== savedName) payload.name = nameTrim;
    if (bandId !== savedBandId) payload.bandId = bandId;
    if (bpmTrim !== savedBpm) payload.bpm = nextBpm;
    if (keyTrim !== savedKey) payload.key = nextKey;

    setBusy(true);
    try {
      await trackPending(() => patch(payload));
      showToast('Song saved.', 'success');
      router.push(songHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
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
        await ensureOk(res, [204]);
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
    <div className="flex flex-col gap-6 mt-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={handleCancel} className="btn-outline">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={!canSave}
          className="btn-primary"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <h1 className="title-text">Edit song</h1>

      {/* Name */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          className={inputCls}
        />
      </section>

      {/* Band */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Band</label>
        <select
          value={bandId}
          onChange={(e) => setBandId(e.target.value)}
          className={inputCls}
        >
          {bands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-neutral-500">
          Moving changes who can access this song — only members of the new band
          will see it.
        </p>
      </section>

      {/* Details (tempo / key) */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Details</label>
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">BPM</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={400}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="—"
              className={inputCls}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">Key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={24}
              placeholder="e.g. Am"
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">
          Optional — tempo and musical key. Leave blank if unknown.
        </p>
      </section>

      {/* Audio versions */}
      <AudioVersions
        conversationId={conversationId}
        apiKey={apiKey}
        initial={audioVersions}
      />

      {/* Sheet music (reuses the song-page panel) */}
      <SheetMusic
        conversationId={conversationId}
        apiKey={apiKey}
        initial={sheetMusic}
        startClosed={false}
      />

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
            className="btn-outline"
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
            className="rounded-md border border-red-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
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

      <ConfirmModal
        open={leaveOpen}
        title="Leave without saving?"
        description="Changes have been made. Are you sure you want to leave without saving?"
        confirmLabel="Leave without saving"
        onConfirm={leave}
        onCancel={() => setLeaveOpen(false)}
      />
    </div>
  );
}
