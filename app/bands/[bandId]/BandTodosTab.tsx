'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '../../useNavigate';
import { ensureOk } from '@/lib/api';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { ConfirmModal } from '../../ConfirmModal';
import { LoadingBlock } from '../../Spinner';
import { LoadMore } from '../../LoadMore';
import { MinimizeToggle } from './bandDetailShared';
import { TodoRow } from './TodoRow';
import { usePagedList } from '../../usePagedList';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { PAGE_SIZE } from '@/lib/paging';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import type { Todo, TodoStatus } from '@/lib/db/todos';

type Counts = Record<TodoStatus, number>;

const SECTIONS: { status: TodoStatus; label: string; empty: string }[] = [
  { status: 'active', label: 'Active', empty: 'Nothing on the list.' },
  { status: 'complete', label: 'Complete', empty: 'Nothing finished yet.' },
  { status: 'cancelled', label: 'Cancelled', empty: 'Nothing cancelled.' },
];

/**
 * One status's list.
 *
 * A component of its own so it can hold its own paging — and so the parent
 * can simply not render it while the section is collapsed, which is what
 * makes Complete and Cancelled cost nothing on a visit that never opens them.
 */
function TodoSection({
  bandId,
  currentUserId,
  scope,
  status,
  empty,
  busy,
  reloadKey,
  onCounts,
  onStatus,
  onShare,
  onDelete,
}: {
  bandId: string;
  currentUserId: string;
  scope: 'all' | 'mine';
  status: TodoStatus;
  empty: string;
  busy: boolean;
  reloadKey: number;
  onCounts: (c: Counts) => void;
  onStatus: (t: Todo, s: TodoStatus) => void;
  onShare: (t: Todo, shared: boolean) => void;
  onDelete: (t: Todo) => void;
}) {
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/bands/${bandId}/todos?scope=${scope}&status=${status}&limit=${PAGE_SIZE}&offset=${offset}&k=${reloadKey}`,
        { cache: 'no-store' },
      ),
    [bandId, scope, status, reloadKey],
  );
  // `pick` has to keep a stable identity or usePagedList refetches forever,
  // and the callback it needs doesn't — so it reads it through a ref.
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;
  const pick = useCallback((d: unknown) => {
    const data = d as { todos: Todo[]; counts: Counts | null };
    // The first page carries all three counts, so a collapsed section can
    // show a number without anyone having to open it. Later pages send null
    // rather than recomputing something that hasn't changed — keep what we
    // already have.
    if (data.counts) onCountsRef.current(data.counts);
    return data.todos;
  }, []);

  const { items, hasMore, loadingMore, error, loadMore } = usePagedList<Todo>(
    fetchPage,
    pick,
  );

  if (error)
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  if (items === null) return <LoadingBlock size="sm" className="py-6" />;
  if (items.length === 0)
    return (
      <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
        {empty}
      </p>
    );

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <TodoRow
            key={t.id}
            todo={t}
            bandId={bandId}
            currentUserId={currentUserId}
            busy={busy}
            onStatus={onStatus}
            onShare={onShare}
            onDelete={onDelete}
          />
        ))}
      </ul>
      <LoadMore
        shown={items.length}
        noun="todo"
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={() => void loadMore()}
      />
    </>
  );
}

/**
 * The Todos tab: three status sections over one band's list.
 *
 * Active opens by default and the other two don't — a todo list is about what
 * is still to do, and the finished pile grows without ever getting more
 * interesting. Collapsed sections are not rendered at all, so they cost
 * nothing until opened.
 *
 * All / Mine narrows by who it belongs to rather than by status: All is every
 * shared todo, Mine is your private ones plus the shared ones you're on the
 * hook for.
 */
export function BandTodosTab({
  bandId,
  currentUserId,
}: {
  bandId: string;
  currentUserId: string;
}) {
  const go = useNavigate();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [mine, setMine] = usePersistedBoolean('bandTodosMine', false);
  const scope = mine ? 'mine' : 'all';

  /*
   * Arriving with `?todos=` names the view to open, overriding whatever was
   * last used. It matters most straight after creating one: a private todo
   * isn't in All, so without this you'd be returned to a list that visibly
   * doesn't contain the thing you just made.
   *
   * A plain effect, so it runs after `usePersistedBoolean` has applied the
   * stored value in its layout effect — the URL is the more specific intent.
   */
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('todos');
    if (want === 'mine') setMine(true);
    else if (want === 'all') setMine(false);
  }, [setMine]);
  const [counts, setCounts] = useState<Counts>({
    active: 0,
    complete: 0,
    cancelled: 0,
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /*
   * Three separate booleans rather than one set of open ids: the defaults
   * differ per section, and "open unless closed" and "closed unless open"
   * can't both come out of one persisted collection.
   */
  const [activeOpen, setActiveOpen] = usePersistedBoolean(
    'bandTodosActiveOpen',
    true,
  );
  const [completeOpen, setCompleteOpen] = usePersistedBoolean(
    'bandTodosCompleteOpen',
    false,
  );
  const [cancelledOpen, setCancelledOpen] = usePersistedBoolean(
    'bandTodosCancelledOpen',
    false,
  );
  const openFor: Record<TodoStatus, boolean> = {
    active: activeOpen,
    complete: completeOpen,
    cancelled: cancelledOpen,
  };
  const toggleFor: Record<TodoStatus, () => void> = {
    active: () => setActiveOpen((v) => !v),
    complete: () => setCompleteOpen((v) => !v),
    cancelled: () => setCancelledOpen((v) => !v),
  };

  /**
   * A todo that changes status moves between sections, so every open one has
   * to look again — and so do the counts on the closed ones.
   *
   * Bumping this counter is the whole mechanism: it is part of the URL each
   * section builds, so a new value hands `usePagedList` a new `fetchPage`,
   * and it reloads from the first page by itself.
   */
  const reloadAll = useCallback(() => setReloadKey((k) => k + 1), []);

  const act = async (fn: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(fn);
      showToast(done, 'success');
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onStatus = (todo: Todo, status: TodoStatus) =>
    void act(async () => {
      // The dedicated endpoint, not PATCH: PATCH replaces the whole todo, so
      // ticking one off from a list would resend every field as this screen
      // last read them — and overwrite anything a bandmate changed since.
      const res = await fetch(`/api/bands/${bandId}/todos/${todo.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await ensureOk(res);
    }, `Marked ${status}.`);

  const onShare = (todo: Todo, shared: boolean) =>
    void act(
      async () => {
        const res = await fetch(`/api/bands/${bandId}/todos/${todo.id}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shared }),
        });
        await ensureOk(res);
      },
      shared ? 'Shared with the band.' : 'Taken out of the band.',
    );

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/bands/${bandId}/todos/${deleteTarget.id}`,
          { method: 'DELETE' },
        );
        await ensureOk(res, [204]);
      });
      showToast('Todo deleted.', 'success');
      setDeleteTarget(null);
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Todos</h2>
          <span className="flex shrink-0 items-center gap-1">
            {/* Same two-state control as the notes scope: both destinations
                are named, so neither reads as the "off" position. */}
            <span
              role="group"
              aria-label="Todos"
              className="flex items-center rounded-md border border-line-strong p-0.5 text-xs"
            >
              {([false, true] as const).map((wantMine) => (
                <button
                  key={String(wantMine)}
                  type="button"
                  onClick={() => setMine(wantMine)}
                  aria-pressed={mine === wantMine}
                  className={
                    'rounded px-2 py-1 ' +
                    (mine === wantMine
                      ? 'bg-fill-2 font-medium text-fg'
                      : 'minor-text-theme-colors hover:text-fg-strong')
                  }
                >
                  {wantMine ? 'Mine' : 'All'}
                </button>
              ))}
            </span>
            <ActionMenu label="Todo actions">
              <ActionMenuItem onClick={() => go(`/bands/${bandId}/todos/new`)}>
                New todo
              </ActionMenuItem>
            </ActionMenu>
          </span>
        </div>
        <span className="block text-xs minor-text-theme-colors">
          {mine
            ? 'Yours: private todos, and shared ones you’re on the hook for'
            : 'Everything the band has shared'}
        </span>
      </div>

      {SECTIONS.map(({ status, label, empty }) => (
        <section key={status} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={!openFor[status]}
              onToggle={toggleFor[status]}
              label={`${label} todos`}
            >
              <h3 className="text-sm font-medium">{label}</h3>
            </MinimizeToggle>
            <span className="text-xs minor-text-theme-colors">
              <span aria-hidden="true">·</span> {counts[status]}
            </span>
          </div>
          {openFor[status] && (
            <TodoSection
              bandId={bandId}
              currentUserId={currentUserId}
              scope={scope}
              status={status}
              empty={empty}
              busy={busy}
              reloadKey={reloadKey}
              onCounts={setCounts}
              onStatus={onStatus}
              onShare={onShare}
              onDelete={setDeleteTarget}
            />
          )}
        </section>
      ))}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.title ?? ''}”?`}
        description="This removes the todo and its links. This can’t be undone."
        confirmLabel="Delete todo"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
