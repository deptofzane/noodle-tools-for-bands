'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { formatTimeAgoOrDate } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
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
import {
  NOTE_LINK_KINDS,
  externalNoteUrl,
  noteLinkHref,
} from '@/lib/note-links';
import type { NoteLink, UserNote } from '@/lib/db/user-notes';

function kindLabel(kind: NoteLink['kind']): string {
  return NOTE_LINK_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/** A note's link as a chip — a link when it leads somewhere, text when it doesn't. */
function LinkChip({
  link,
  bandId,
  onExternal,
}: {
  link: NoteLink;
  bandId: string;
  /** Asked to confirm before leaving the app. */
  onExternal: (url: string) => void;
}) {
  const href = noteLinkHref(link, bandId);
  // `other` links are free text; this is what decides whether one is openable
  // and supplies the scheme when the author didn't type one.
  const externalUrl = link.kind === 'other' ? externalNoteUrl(href) : null;
  const external = externalUrl !== null;
  const inner = (
    <>
      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide minor-text-theme-colors dark:bg-neutral-900">
        {kindLabel(link.kind)}
      </span>
      <span className="truncate">{link.label}</span>
    </>
  );
  const shell =
    'flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800';

  // `other` holds whatever was pasted, which may not be a URL at all.
  if (!href || (link.kind === 'other' && !external))
    return <span className={shell}>{inner}</span>;
  if (external)
    return (
      // Still a real anchor, not a button: right-click "copy link address" and
      // middle-click keep working, and those bypass the prompt deliberately —
      // someone doing either has already said where they're going.
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onExternal(externalUrl);
        }}
        className={`${shell} hover:bg-neutral-50 dark:hover:bg-neutral-900`}
      >
        {inner}
      </a>
    );
  return (
    <Link
      href={href}
      className={`${shell} hover:bg-neutral-50 dark:hover:bg-neutral-900`}
    >
      {inner}
    </Link>
  );
}

/**
 * The Notes tab: either the member's own private notes in this band or the
 * ones the band has shared, newest first, chosen with the Personal/Shared
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
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [deleteTarget, setDeleteTarget] = useState<UserNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  // External link awaiting confirmation. One modal for the whole tab rather
  // than one per chip — only one can be open at a time.
  const [externalUrl, setExternalUrl] = useState<string | null>(null);

  /*
   * Which slice is showing. Personal first: notes are private by default, so
   * the list someone arrives expecting is their own.
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
  // Personal and Shared are different selections, not two views of one.
  useEffect(() => {
    void loadPinned(false);
  }, [loadPinned]);

  /*
   * A note arriving from a notification link names the view it lives in
   * (`?notes=shared`), because Personal/Shared is otherwise a remembered
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
        className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
      >
        <div className="flex items-start justify-between gap-1">
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
            <span className="flex min-w-0 items-center gap-2">
              {hasBody && (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-sm leading-none text-neutral-400"
                >
                  {open ? '▾' : '▸'}
                </span>
              )}
              <span className="truncate font-medium">{note.title}</span>
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
          {mine && (
            <ActionMenu label={`Actions for ${note.title}`}>
              <ActionMenuItem
                onClick={() =>
                  router.push(`/bands/${bandId}/notes/${note.id}/edit`)
                }
              >
                Edit note
              </ActionMenuItem>
              <ActionMenuItem destructive onClick={() => setDeleteTarget(note)}>
                Delete note
              </ActionMenuItem>
            </ActionMenu>
          )}
        </div>

        {open && note.body && (
          <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
            {note.body}
          </p>
        )}

        {open && note.links.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {note.links.map((l) => (
              <LinkChip
                key={l.id}
                link={l}
                bandId={bandId}
                onExternal={setExternalUrl}
              />
            ))}
          </div>
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
            {/* Personal or shared. A two-state segmented control rather than a
                checkbox: both destinations are named, so neither reads as the
                "off" position of the other. Same control as Songs/Albums. */}
            <span
              role="group"
              aria-label="Notes"
              className="flex items-center rounded-md border border-neutral-300 p-0.5 text-xs dark:border-neutral-700"
            >
              {([false, true] as const).map((wantShared) => (
                <button
                  key={String(wantShared)}
                  type="button"
                  onClick={() => setSharedView(wantShared)}
                  aria-pressed={sharedView === wantShared}
                  className={
                    'rounded px-2 py-1 ' +
                    (sharedView === wantShared
                      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'minor-text-theme-colors hover:text-neutral-800 dark:hover:text-neutral-200')
                  }
                >
                  {wantShared ? 'Shared' : 'Personal'}
                </button>
              ))}
            </span>
            <ActionMenu label="Notes actions">
              <ActionMenuItem
                onClick={() => router.push(`/bands/${bandId}/notes/new`)}
              >
                New note
              </ActionMenuItem>
            </ActionMenu>
          </span>
        </div>
        <span className="block truncate text-xs minor-text-theme-colors">
          {sharedView
            ? 'Notes you and your bandmates have shared with the band'
            : 'Private to you — sharing one moves it to Shared'}
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
                  className="self-center rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Load all {pinnedTotal}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {notes === null ? (
        <LoadingBlock label="Loading notes" />
      ) : notes.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
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

      {/*
        Leaving the app is worth a beat's confirmation: a note's links are
        pasted by a bandmate, and in the installed app a tap otherwise hands
        the screen to a site with no address bar explaining where you went.

        `window.open` covers both cases the same way — a new tab in a browser,
        and the system browser from the installed app, because the destination
        is cross-origin and so isn't captured back into the app's scope. It's
        called straight from the confirm click, so it counts as a user gesture
        and isn't treated as a popup.
      */}
      <ConfirmModal
        open={externalUrl !== null}
        title="Open this link?"
        description={`Are you sure you want to open this link to ${externalUrl ?? ''}?`}
        confirmLabel="Open link"
        onConfirm={() => {
          if (externalUrl)
            window.open(externalUrl, '_blank', 'noopener,noreferrer');
          setExternalUrl(null);
        }}
        onCancel={() => setExternalUrl(null)}
      />

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
