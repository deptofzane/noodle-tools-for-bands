'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureOk } from '@/lib/api';
import { songHref } from '@/lib/routes';
import { useCurrentBand } from '../CurrentBandProvider';
import { useToast } from '../ToastProvider';
import { useTrackPending } from '../PendingActionProvider';
import { LoadingBlock } from '../Spinner';
import {
  DEFAULT_SONG_SORT,
  SongSortButtons,
  nextSongSort,
  songDisplayName,
  sortSongs,
  type SongSort,
} from '../songSort';
import type { Conversation } from '../bands/[bandId]/bandDetailShared';

/** `createdAt` is when the song joined the band, i.e. when it was uploaded. */
const uploadedOn = (c: Conversation) =>
  new Date(c.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

/**
 * History's archived audio: every song the band has archived.
 *
 * This is the only place archived songs appear now — the Songs list dropped
 * its Archived container — so it carries Un-archive. Without that, archiving
 * would be a one-way door.
 *
 * Reuses `/api/bands/[bandId]/conversations`, which already returns the
 * archived ones; a band's songs are a bounded list the Audio page fetches
 * whole anyway, so searching and sorting happen here rather than costing a
 * round trip each. The sort itself is shared with the Songs list, so the two
 * behave identically.
 */
export function ArchivedAudio() {
  const { bandId } = useCurrentBand();
  const showToast = useToast();
  const trackPending = useTrackPending();

  const [songs, setSongs] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sort, setSort] = useState<SongSort>(DEFAULT_SONG_SORT);

  const load = useCallback(async () => {
    if (!bandId) return;
    try {
      const r = await fetch(`/api/bands/${bandId}/conversations`, {
        cache: 'no-store',
      });
      await ensureOk(r);
      const d = (await r.json()) as { conversations: Conversation[] };
      setSongs(d.conversations.filter((c) => c.archived));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const unarchive = async (c: Conversation) => {
    if (busyId) return;
    setBusyId(c.id);
    try {
      const r = await fetch(`/api/conversations/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      await ensureOk(r);
      // Gone from this list by definition, so drop it rather than refetching
      // the whole band's songs to learn the same thing.
      setSongs((prev) => (prev ?? []).filter((s) => s.id !== c.id));
      showToast(`${songDisplayName(c)} is no longer archived`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }
  if (songs === null) return <LoadingBlock />;

  const q = search.trim().toLowerCase();
  const visible = sortSongs(
    songs.filter((c) => !q || songDisplayName(c).toLowerCase().includes(q)),
    sort,
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search archived audio"
        aria-label="Search archived audio"
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <SongSortButtons
        sort={sort}
        onSort={(key) => setSort((prev) => nextSongSort(prev, key))}
      />

      {songs.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          Nothing archived. Archiving a song in Audio keeps it out of the way
          without deleting it, and it turns up here.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          No archived audio matches “{search.trim()}”.
        </p>
      ) : (
        <ul
          aria-label="Archived audio"
          className="divide-y divide-line rounded-lg border border-line"
        >
          {visible.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <Link href={songHref(c.id)} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {songDisplayName(c)}
                </span>
                <span className="block text-xs minor-text-theme-colors">
                  Uploaded {uploadedOn(c)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void unarchive(c)}
                disabled={busyId !== null}
                className="btn-outline shrink-0 text-xs disabled:opacity-40"
              >
                {busyId === c.id ? 'Un-archiving…' : 'Un-archive'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
