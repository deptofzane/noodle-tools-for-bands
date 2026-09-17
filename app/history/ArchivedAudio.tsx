'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureOk } from '@/lib/api';
import { songHref } from '@/lib/routes';
import { useCurrentBand } from '../CurrentBandProvider';
import { useToast } from '../ToastProvider';
import { useTrackPending } from '../PendingActionProvider';
import { LoadingBlock } from '../Spinner';
import type { Conversation } from '../bands/[bandId]/bandDetailShared';

type SortKey = 'name' | 'date';

/** A song's display name — the same fallback the Songs list uses. */
const songName = (c: Conversation) => c.audioFileName ?? 'Untitled audio';

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
 * round trip each.
 */
export function ArchivedAudio() {
  const { bandId } = useCurrentBand();
  const showToast = useToast();
  const trackPending = useTrackPending();

  const [songs, setSongs] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Newest first: an archive is read from the most recently put away.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  });

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
      showToast(`${songName(c)} is no longer archived`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  /** Clicking the active column flips it; a new one starts on its own default. */
  const sortBy = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // Dates read newest-first; names read A–Z.
          { key, dir: key === 'date' ? 'desc' : 'asc' },
    );

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }
  if (songs === null) return <LoadingBlock />;

  const q = search.trim().toLowerCase();
  const visible = songs
    .filter((c) => !q || songName(c).toLowerCase().includes(q))
    .sort((a, b) => {
      const by =
        sort.key === 'name'
          ? songName(a).localeCompare(songName(b))
          : // ISO timestamps, so a string compare is a date compare.
            a.createdAt.localeCompare(b.createdAt);
      return sort.dir === 'asc' ? by : -by;
    });

  const SortButton = ({ id, label }: { id: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => sortBy(id)}
      aria-pressed={sort.key === id}
      className={
        'rounded-md border px-2.5 py-1 text-xs font-medium transition ' +
        (sort.key === id
          ? 'border-line-strong text-accent'
          : 'border-line minor-text-theme-colors hover:text-fg-strong')
      }
    >
      {label}
      {sort.key === id && (
        <span aria-hidden="true"> {sort.dir === 'asc' ? '▲' : '▼'}</span>
      )}
    </button>
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

      <div className="flex items-center gap-2">
        <span className="text-xs minor-text-theme-colors">Sort by</span>
        <SortButton id="name" label="Name" />
        <SortButton id="date" label="Date uploaded" />
      </div>

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
                  {songName(c)}
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
