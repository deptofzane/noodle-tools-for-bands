'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../../useNavigate';
import { ensureOk } from '@/lib/api';
import { formatTimeAgoOrDate } from '@/lib/format';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../ActionMenu';
import { EyeIcon, LinkIcon, PencilIcon } from '../../icons';
import { ConfirmModal } from '../../ConfirmModal';
import { LoadingBlock } from '../../Spinner';
import { LoadMore } from '../../LoadMore';
import { MinimizeToggle } from './bandDetailShared';
import { usePagedList } from '../../usePagedList';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { usePersistedStringSet } from '../../usePersistedStringSet';
import { PAGE_SIZE } from '@/lib/paging';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { noteHref } from '@/lib/routes';
import { useShareLink } from '../../useShareLink';
import { NoteLinks } from './notes/NoteLinks';
import type { UserNote } from '@/lib/db/user-notes';

/**
 * The Notes tab: either the member's own private notes in this band or the
 * ones the band has shared, newest first, chosen with the Mine/All
 * switch. Only an author sees Edit or Delete on their own.
 *
 * The two are a partition, not overlapping filters: personal is yours *and*
 * unshared, so sharing a note moves it from one view to the other (see
 * `NoteScope`). The scope is applied server-side because the list is paged.
 *
 * Loads on mount rather than with the band payload: most visits to a band
 * aren't about notes, and this way the tab pays for itself, a page at a time.
 *
 * Notes open collapsed — a title is enough to find the one you want, and a
 * body can run long — and which ones you've opened is remembered per band, so
 * navigating away and back leaves the tab as you left it.
 */
export function BandNotesTab({
  bandId,
  currentUserId,
}: {
  bandId: string;
  currentUserId: string;
}) {
  const go = useNavigate();
  const share = useShareLink();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [deleteTarget, setDeleteTarget] = useState<UserNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  /*
   * Which slice is showing. All is drawn first, matching the Todos tab's
   * control, but Mine is what's *selected* by default: notes are private
   * unless shared, so the list someone arrives expecting is their own.
   *
   * Boolean rather than a scope string because there are exactly two
   * positions, matching the Songs/Albums control this mirrors.
   */
  const [sharedView, setSharedView] = usePersistedBoolean(
    'bandNotesSharedView',
    false,
  );
  const scope = sharedView ? 'shared' : 'personal';

  /*
   * The pinned section is fetched separately from the list below it, because
   * the two answer different questions: the list is paged history, this is a
   * short standing selection. Ten to begin with, all of them on request —
   * `total` is the real count either way, so a band whose pinned section has
   * run away from them can see that from the header even while ten show.
   */
  const [pinned, setPinned] = useState<UserNote[] | null>(null);
  const [pinnedTotal, setPinnedTotal] = useState(0);
  const [showAllPinned, setShowAllPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  const [pinnedMinimized, setPinnedMinimized] = usePersistedBoolean(
    'bandNotesPinnedMinimized',
    false,
  );

  // Collapsed unless the id is in the set, so notes start minimized and a
  // brand-new one doesn't spring open on the next visit.
  const [expanded, toggleExpanded] = usePersistedStringSet(
    `bandNotesExpanded:${bandId}`,
  );

  // `scope` in the dependencies is what reloads the list when the switch
  // moves: usePagedList refetches from the first page whenever this identity
  // changes. Filtering client-side wouldn't work here — it would only ever see
  // the page already loaded, and leave "Load more" counting the wrong rows.
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/bands/${bandId}/notes?limit=${PAGE_SIZE}&offset=${offset}&scope=${scope}`,
        { cache: 'no-store' },
      ),
    [bandId, scope],
  );
  const pick = useCallback(
    (d: unknown) => (d as { notes: UserNote[] }).notes,
    [],
  );
  const {
    items: notes,
    hasMore,
    loadingMore,
    error,
    loadMore,
    reload,
  } = usePagedList<UserNote>(fetchPage, pick);

  const loadPinned = useCallback(
    async (all: boolean) => {
      try {
        const res = await fetch(
          `/api/bands/${bandId}/notes?scope=${scope}&pinned=1${
            all ? '&all=1' : ''
          }`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const d = (await res.json()) as { notes: UserNote[]; total: number };
        setPinned(d.notes);
        setPinnedTotal(d.total);
        setShowAllPinned(all);
      } catch {
        // Best-effort: the list below still renders without this.
      }
    },
    [bandId, scope],
  );

  // Refetches when the scope changes, which also drops back to the first ten —
  // Mine and All are different selections, not two views of one.
  useEffect(() => {
    void loadPinned(false);
  }, [loadPinned]);

  /*
   * A note arriving from a notification link names the view it lives in
   * (`?notes=shared`), because Mine/All is otherwise a remembered
   * choice and the note may not be in the one you left behind.
   *
   * A plain effect, so it runs after `usePersistedBoolean` has applied the
   * stored value in its *layout* effect — the URL is the more specific
   * intent and has to win.
   */
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('notes');
    if (want === 'shared') setSharedView(true);
    else if (want === 'personal') setSharedView(false);
  }, [setSharedView]);

  const togglePin = async (note: UserNote) => {
    if (pinBusy) return;
    setPinBusy(note.id);
    try {
      await trackPending(async () => {
        const res = await fetch(`/api/bands/${bandId}/notes/${note.id}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: !note.pinned }),
        });
        await ensureOk(res);
      });
      showToast(note.pinned ? 'Note unpinned.' : 'Note pinned.', 'success');
      // Both lists move: the note crosses between them.
      await Promise.all([loadPinned(showAllPinned), reload()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setPinBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/bands/${bandId}/notes/${deleteTarget.id}`,
          { method: 'DELETE' },
        );
        await ensureOk(res, [204]);
      });
      showToast('Note deleted.', 'success');
      setDeleteTarget(null);
      await Promise.all([reload(), loadPinned(showAllPinned)]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  /**
   * One note row. Lifted out of the list so the pinned section renders
   * exactly the same thing — a pinned note is the same note, just held
   * somewhere else, and two copies of this markup would drift.
   */
  const renderNote = (note: UserNote) => {
    const mine = note.authorId === currentUserId;
    const open = expanded.has(note.id);
    const hasBody = Boolean(note.body) || note.links.length > 0;
    return (
      <li
        key={note.id}
        className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3"
      >
        <div className="flex items-start justify-between gap-1 items-center">
          {/* The whole heading toggles, so the target is the note, not
                a 12px chevron. Notes with nothing to reveal don't. */}
          <button
            type="button"
            onClick={() => hasBody && toggleExpanded(note.id)}
            aria-expanded={hasBody ? open : undefined}
            disabled={!hasBody}
            className={
              'flex min-w-0 flex-1 flex-col gap-0.5 text-left ' +
              (hasBody ? '' : 'cursor-default')
            }
          >
            {/* Titles wrap rather than truncate: a note is found by its
                title, and "Van rental for the Nov…" is the half that stops
                being useful. `items-start` keeps the chevron on the first
                line instead of floating to the middle of a wrapped one, and
                `break-words` handles a long unbroken string, which would
                otherwise push the row wider than the card. */}
            <span className="flex min-w-0 items-start gap-2">
              {hasBody && (
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-sm leading-none text-neutral-400"
                >
                  {open ? '▾' : '▸'}
                </span>
              )}
              <span className="min-w-0 break-words font-medium">
                {note.title}
              </span>
            </span>
            <span className="text-xs minor-text-theme-colors">
              {mine ? (
                <span className="minor-text-band-theme-colors">You</span>
              ) : (
                (note.authorName ?? 'A bandmate')
              )}{' '}
              · {formatTimeAgoOrDate(note.updatedAt)}
            </span>
          </button>
          {/*
            The star is both the marker and the control. It can't live in the
            kebab beside it: that menu is the author's alone, and in the shared
            view anyone may pin.
          */}
          <button
            type="button"
            onClick={() => void togglePin(note)}
            disabled={pinBusy !== null}
            aria-pressed={note.pinned}
            aria-label={
              note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`
            }
            title={note.pinned ? 'Unpin' : 'Pin to the top'}
            className={
              'shrink-0 rounded-md px-2 py-1 text-base leading-none disabled:opacity-40 ' +
              (note.pinned
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300')
            }
          >
            <span aria-hidden="true">{note.pinned ? '★' : '☆'}</span>
          </button>
          {/*
            Rendered for everyone now, not just the author. Viewing and
            sharing are open to anyone who can already read the note — which,
            for a shared one, is the whole band; only changing or removing it
            stays with whoever wrote it.
          */}
          <ActionMenu label={`Actions for ${note.title}`}>
            {/* Edit is the note owner's alone, so someone else's note gets a
                two-icon row rather than a third glyph that refuses. */}
            <MenuSectionLabel>Note</MenuSectionLabel>
            <MenuIconRow
              items={[
                {
                  key: 'view',
                  icon: <EyeIcon size={18} />,
                  label: `View ${note.title}`,
                  title: 'View note',
                  onClick: () => go(noteHref(bandId, note.id)),
                },
                ...(mine
                  ? [
                      {
                        key: 'edit',
                        icon: <PencilIcon size={18} />,
                        label: `Edit ${note.title}`,
                        title: 'Edit note',
                        onClick: () =>
                          go(`/bands/${bandId}/notes/${note.id}/edit`),
                      },
                    ]
                  : []),
                {
                  key: 'share',
                  icon: <LinkIcon size={18} />,
                  label: `Copy a link to ${note.title}`,
                  title: 'Share note',
                  onClick: () => void share(noteHref(bandId, note.id), 'Note'),
                },
              ]}
            />
            {mine && (
              <ActionMenuItem destructive onClick={() => setDeleteTarget(note)}>
                Delete note
              </ActionMenuItem>
            )}
          </ActionMenu>
        </div>

        {open && note.body && (
          <p className="whitespace-pre-wrap text-sm text-fg-muted">
            {note.body}
          </p>
        )}

        {open && note.links.length > 0 && (
          <NoteLinks links={note.links} bandId={bandId} />
        )}
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <span className="flex shrink-0 items-center gap-1">
            {/* Mine or shared. A two-state segmented control rather than a
                checkbox: both destinations are named, so neither reads as the
                "off" position of the other. Same control as Songs/Albums. */}
            <span
              role="group"
              aria-label="Notes"
              className="flex items-center rounded-md border border-line-strong p-0.5 text-xs"
            >
              {([true, false] as const).map((wantShared) => (
                <button
                  key={String(wantShared)}
                  type="button"
                  onClick={() => setSharedView(wantShared)}
                  aria-pressed={sharedView === wantShared}
                  className={
                    'rounded px-2 py-1 ' +
                    (sharedView === wantShared
                      ? 'bg-fill-2 font-medium text-fg'
                      : 'minor-text-theme-colors hover:text-fg-strong')
                  }
                >
                  {wantShared ? 'All' : 'Mine'}
                </button>
              ))}
            </span>
            <ActionMenu label="Notes actions">
              <ActionMenuItem onClick={() => go(`/bands/${bandId}/notes/new`)}>
                New note
              </ActionMenuItem>
            </ActionMenu>
          </span>
        </div>
        <span className="block truncate text-xs minor-text-theme-colors">
          {sharedView
            ? 'Notes you and your bandmates have shared with the band'
            : 'Private to you — sharing one moves it to All'}
        </span>
      </div>

      {/*
        Pinned notes, above whichever view is showing. Hidden entirely when
        there are none — an empty dropdown is a control that does nothing.
        The count in the heading is the true total, not how many are drawn,
        so a section that has outgrown its ten still says so.
      */}
      {pinned !== null && pinned.length > 0 && (
        // Named, so it's a landmark a screen reader can jump to and skip —
        // it sits between the view switch and the list people came to read.
        <section aria-label="Pinned notes" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={pinnedMinimized}
              onToggle={() => setPinnedMinimized((v) => !v)}
              label="Pinned notes"
            >
              <h2 className="text-sm font-medium">Pinned</h2>
            </MinimizeToggle>
            <span className="text-xs minor-text-theme-colors">
              <span aria-hidden="true">·</span> {pinnedTotal}
            </span>
          </div>
          {!pinnedMinimized && (
            <>
              <ul className="flex flex-col gap-2">{pinned.map(renderNote)}</ul>
              {/* One press brings the rest down; the section is short enough
                  that paging it would be ceremony. */}
              {pinnedTotal > pinned.length && (
                <button
                  type="button"
                  onClick={() => void loadPinned(true)}
                  className="self-center rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-soft"
                >
                  Load all {pinnedTotal}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {error && (
        <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
          {error}
        </p>
      )}

      {notes === null ? (
        <LoadingBlock label="Loading notes" />
      ) : notes.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          {sharedView
            ? 'No shared notes yet. Notes you or a bandmate share with the band show up here.'
            : '“New note” in the menu starts one — it stays here until you share it with the band.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{notes.map(renderNote)}</ul>
      )}

      {notes !== null && notes.length > 0 && (
        <LoadMore
          shown={notes.length}
          noun="note"
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => void loadMore()}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.title ?? ''}”?`}
        description="This removes the note and its links. This can’t be undone."
        confirmLabel="Delete note"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
