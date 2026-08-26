'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../../../Modal';
import { Select } from '../../../Select';
import { LoadingBlock } from '../../../Spinner';
import { NOTE_LINK_KINDS, noteLinkListUrl } from '@/lib/note-links';
import type { NoteLinkInput, NoteLinkKind } from '@/lib/db/user-notes';

/** One pickable row, normalized from whichever list endpoint supplied it. */
interface Choice {
  id: string;
  label: string;
  hint?: string;
  /**
   * Songs only: nothing uploaded at all, neither audio nor sheet music.
   *
   * Worth surfacing here because the list is otherwise just names, and a song
   * with nothing attached is the one you're least likely to have meant —
   * particularly when linking to Practice, which would open empty.
   */
  noMedia?: boolean;
}

/**
 * Pull the id + display name out of each list endpoint's payload. They each
 * name their collection and their label differently, which is why this lives
 * in one place rather than in five branches at the call site.
 */
function toChoices(kind: NoteLinkKind, data: unknown): Choice[] {
  const d = data as Record<string, unknown>;
  const rows = (
    kind === 'song'
      ? d.conversations
      : kind === 'event'
        ? d.events
        : kind === 'venue'
          ? d.venues
          : kind === 'setlist'
            ? d.setlists
            : d.polls
  ) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const id = typeof r.id === 'string' ? r.id : '';
      const label =
        kind === 'song'
          ? ((r.audioFileName as string | null) ?? 'Untitled audio')
          : kind === 'event' || kind === 'poll'
            ? ((r.title as string) ?? '')
            : ((r.name as string) ?? '');
      const hint =
        kind === 'event'
          ? (r.date as string | undefined)
          : kind === 'venue'
            ? ((r.address as string | null) ?? undefined)
            : undefined;
      /*
       * Both signals already ride along in /api/bands/[id]/conversations, so
       * this costs no extra request: `audioVersionId` is the default audio
       * version (null when there's none) and `hasSheetMusic` is a subquery
       * over sheet versions.
       */
      const noMedia =
        kind === 'song' ? !r.audioVersionId && !r.hasSheetMusic : undefined;
      return { id, label: label || 'Untitled', hint, noMedia };
    })
    .filter((c) => c.id);
}

/**
 * Pick something for a note to link to: choose a kind, then the thing itself.
 *
 * Each kind's list is fetched the first time it's chosen and kept for the rest
 * of the modal's life — a note usually links to one or two things, so loading
 * all five bands' worth up front would be wasted work.
 *
 * "Other" skips the list entirely and takes whatever the user pastes.
 */
export function NoteLinkModal({
  bandId,
  onAdd,
  onClose,
}: {
  bandId: string;
  onAdd: (link: NoteLinkInput) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<NoteLinkKind>('song');
  const [cache, setCache] = useState<Partial<Record<NoteLinkKind, Choice[]>>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [otherUrl, setOtherUrl] = useState('');
  const [otherLabel, setOtherLabel] = useState('');

  useEffect(() => {
    if (kind === 'other' || cache[kind]) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(noteLinkListUrl(kind, bandId), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        if (!cancelled)
          setCache((prev) => ({ ...prev, [kind]: toChoices(kind, d) }));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load that list.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, bandId, cache]);

  const choices = cache[kind] ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? choices.filter((c) => c.label.toLowerCase().includes(needle))
    : choices;

  const addOther = () => {
    const url = otherUrl.trim();
    if (!url) return;
    onAdd({
      kind: 'other',
      targetId: null,
      url,
      label: otherLabel.trim() || url,
      practice: false,
    });
  };

  return (
    <Modal onClose={onClose} labelledBy="note-link-title" size="md">
      <h2 id="note-link-title" className="text-base font-semibold">
        Link to something
      </h2>

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="note-link-kind" className="text-sm font-medium">
          Type
        </label>
        <Select
          id="note-link-kind"
          value={kind}
          onChange={(v) => {
            setKind(v as NoteLinkKind);
            setFilter('');
          }}
          options={NOTE_LINK_KINDS.map((k) => ({
            value: k.id,
            label: k.label,
          }))}
        />
      </div>

      {kind === 'other' ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="note-link-url" className="text-sm font-medium">
              Link or reference
            </label>
            <input
              id="note-link-url"
              value={otherUrl}
              onChange={(e) => setOtherUrl(e.target.value)}
              placeholder="https://… or anything you want to note"
              autoFocus
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="note-link-label" className="text-sm font-medium">
              Label <span className="minor-text-theme-colors">(optional)</span>
            </label>
            <input
              id="note-link-label"
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              placeholder="What to call it"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {choices.length > 8 && (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              aria-label="Filter the list"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          )}
          {loading ? (
            <LoadingBlock size="sm" className="py-8" label="Loading" />
          ) : error ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          ) : shown.length === 0 ? (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
              {choices.length === 0
                ? 'Nothing of this type in the band yet.'
                : 'Nothing matches that.'}
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onAdd({
                        kind,
                        targetId: c.id,
                        url: null,
                        label: c.label,
                        // Vestigial: a song link has one destination now
                        // that Practice is the song's only screen.
                        practice: false,
                      })
                    }
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{c.label}</span>
                      {c.noMedia && (
                        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium minor-text-theme-colors dark:bg-neutral-800">
                          No media attached
                        </span>
                      )}
                    </span>
                    {c.hint && (
                      <span className="truncate text-xs minor-text-theme-colors">
                        {c.hint}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        {kind === 'other' && (
          <button
            type="button"
            onClick={addOther}
            disabled={!otherUrl.trim()}
            className="btn-primary"
          >
            Add link
          </button>
        )}
      </div>
    </Modal>
  );
}
