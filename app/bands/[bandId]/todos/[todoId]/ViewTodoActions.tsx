'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigate } from '../../../../useNavigate';
import { ensureOk } from '@/lib/api';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../../ActionMenu';
import { LinkIcon, PencilIcon } from '../../../../icons';
import { todoHref } from '@/lib/routes';
import { ConfirmModal } from '../../../../ConfirmModal';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { useShareLink } from '../../../../useShareLink';
import type { TodoStatus } from '@/lib/db/todos';

const MOVES: { to: TodoStatus; label: string }[] = [
  { to: 'active', label: 'Mark active' },
  { to: 'complete', label: 'Mark complete' },
  { to: 'cancelled', label: 'Mark cancelled' },
];

/**
 * A todo's own actions.
 *
 * Everything except unsharing is open to any band member on a shared todo.
 * Unsharing is offered disabled to everyone else, with the tooltip explaining
 * how to earn it — claiming a todo is a legitimate move, not a trick.
 */
export function ViewTodoActions({
  bandId,
  todoId,
  title,
  status,
  shared,
  canUnshare,
}: {
  bandId: string;
  todoId: string;
  title: string;
  status: TodoStatus;
  shared: boolean;
  canUnshare: boolean;
}) {
  const router = useRouter();
  const go = useNavigate();
  const share = useShareLink();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(fn);
      showToast(done, 'success');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (to: TodoStatus) =>
    void act(async () => {
      const res = await fetch(`/api/bands/${bandId}/todos/${todoId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      await ensureOk(res);
    }, `Marked ${to}.`);

  const setShared = (next: boolean) =>
    void act(
      async () => {
        const res = await fetch(`/api/bands/${bandId}/todos/${todoId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shared: next }),
        });
        await ensureOk(res);
      },
      next ? 'Shared with the band.' : 'Taken out of the band.',
    );

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`/api/bands/${bandId}/todos/${todoId}`, {
          method: 'DELETE',
        });
        await ensureOk(res, [204]);
      });
      showToast('Todo deleted.', 'success');
      // `replace`: this page has just stopped existing, so Back must not
      // return to it.
      router.replace(`/bands/${bandId}?tab=todos`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <ActionMenu label={`Actions for ${title}`} disabled={busy}>
        {/* No View: this is the todo's own page. "Share" here copies a link;
            the public/private pair below changes who can see it. */}
        <MenuSectionLabel>Todo</MenuSectionLabel>
        <MenuIconRow
          items={[
            {
              key: 'edit',
              icon: <PencilIcon size={18} />,
              label: `Edit ${title}`,
              title: 'Edit todo',
              onClick: () => go(`/bands/${bandId}/todos/${todoId}/edit`),
            },
            {
              key: 'share',
              icon: <LinkIcon size={18} />,
              label: `Copy a link to ${title}`,
              title: 'Share todo',
              onClick: () => void share(todoHref(bandId, todoId), 'Todo'),
            },
          ]}
        />
        {MOVES.filter((m) => m.to !== status).map((m) => (
          <ActionMenuItem key={m.to} onClick={() => setStatus(m.to)}>
            {m.label}
          </ActionMenuItem>
        ))}
        {shared ? (
          <ActionMenuItem
            disabled={!canUnshare}
            title={canUnshare ? undefined : 'Make yourself owner to unshare'}
            onClick={() => setShared(false)}
          >
            Make private
          </ActionMenuItem>
        ) : (
          <ActionMenuItem onClick={() => setShared(true)}>
            Make visible to band
          </ActionMenuItem>
        )}
        <ActionMenuItem destructive onClick={() => setConfirmOpen(true)}>
          Delete todo
        </ActionMenuItem>
      </ActionMenu>

      <ConfirmModal
        open={confirmOpen}
        title={`Delete “${title}”?`}
        description="This removes the todo and its links. This can’t be undone."
        confirmLabel="Delete todo"
        busyLabel="Deleting…"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
