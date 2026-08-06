'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { ConfirmModal } from '../../ConfirmModal';
import { LoadingBlock } from '../../Spinner';
import { LoadMore } from '../../LoadMore';
import { usePagedList } from '../../usePagedList';
import { usePersistedStringSet } from '../../usePersistedStringSet';
import { PAGE_SIZE } from '@/lib/paging';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { NOTE_LINK_KINDS, noteLinkHref } from '@/lib/note-links';
import type { NoteLink, UserNote } from '@/lib/db/user-notes';

function kindLabel(kind: NoteLink['kind']): string {
  return NOTE_LINK_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/** A note's link as a chip — a link when it leads somewhere, text when it doesn't. */
function LinkChip({ link, bandId }: { link: NoteLink; bandId: string }) {
  const href = noteLinkHref(link, bandId);
  const external = link.kind === 'other' && /^https?:\/\//i.test(href ?? '');
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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
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
 * The Notes tab: the member's own notes in this band, plus any a bandmate has
 * shared, newest first. Notes are private by default — the "Shared" marker is
 * what says otherwise — and only an author sees Edit or Delete on their own.
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

  // Collapsed unless the id is in the set, so notes start minimized and a
  // brand-new one doesn't spring open on the next visit.
  const [expanded, toggleExpanded] = usePersistedStringSet(
    `bandNotesExpanded:${bandId}`,
  );

  const fetchPage = useCallback(
    (offset: number) =>
      fetch(`/api/bands/${bandId}/notes?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: 'no-store',
      }),
    [bandId],
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
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <Link href={`/bands/${bandId}/notes/new`} className="btn-outline">
            New note
          </Link>
        </div>
        <span className="block truncate text-xs minor-text-theme-colors">
          These are private unless you share them with the band
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {notes === null ? (
        <LoadingBlock label="Loading notes" />
      ) : notes.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          No notes yet. “New note” starts one — it’s private to you unless you
          share it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => {
            const mine = note.authorId === currentUserId;
            const open = expanded.has(note.id);
            const hasBody = Boolean(note.body) || note.links.length > 0;
            return (
              <li
                key={note.id}
                className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
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
                      {note.shared && (
                        <span
                          title={
                            mine
                              ? 'The band can read this'
                              : `Shared by ${note.authorName ?? 'a bandmate'}`
                          }
                          className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        >
                          Shared
                        </span>
                      )}
                    </span>
                    <span className="text-xs minor-text-theme-colors">
                      {mine ? 'You' : (note.authorName ?? 'A bandmate')} ·{' '}
                      {formatRelativeTime(note.updatedAt)}
                    </span>
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
                      <ActionMenuItem
                        destructive
                        onClick={() => setDeleteTarget(note)}
                      >
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
                      <LinkChip key={l.id} link={l} bandId={bandId} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
