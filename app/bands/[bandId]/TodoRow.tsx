'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem, MenuIconRow } from '../../ActionMenu';
import { useShareLink } from '../../useShareLink';
import { EyeIcon, LinkIcon, PencilIcon } from '../../icons';
import { NoteLinks } from './notes/NoteLinks';
import { formatTimeAgoOrDate } from '@/lib/format';
import { todoHref } from '@/lib/routes';
import type { Todo, TodoStatus } from '@/lib/db/todos';

/** Local midnight, for deciding whether a deadline has passed. */
function isOverdue(deadline: string | null, status: TodoStatus): boolean {
  if (!deadline || status !== 'active') return false;
  const today = new Date();
  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return new Date(`${deadline}T00:00:00`) < midnight;
}

const STATUS_MOVES: { to: TodoStatus; label: string }[] = [
  { to: 'active', label: 'Mark active' },
  { to: 'complete', label: 'Mark complete' },
  { to: 'cancelled', label: 'Mark cancelled' },
];

/**
 * One todo in the list.
 *
 * A shared todo is the band's: anyone may edit, restatus, reassign or delete
 * it. The one exception is taking it back out of the band, which is offered
 * disabled to everyone else — with a tooltip saying how to earn it, because
 * claiming it is a legitimate move rather than something to hide.
 */
export function TodoRow({
  todo,
  bandId,
  currentUserId,
  busy,
  onStatus,
  onShare,
  onDelete,
}: {
  todo: Todo;
  bandId: string;
  currentUserId: string;
  busy: boolean;
  onStatus: (todo: Todo, status: TodoStatus) => void;
  onShare: (todo: Todo, shared: boolean) => void;
  onDelete: (todo: Todo) => void;
}) {
  const router = useRouter();
  const share = useShareLink();
  const overdue = isOverdue(todo.deadline, todo.status);
  const canUnshare =
    todo.creatorId === currentUserId || todo.ownerId === currentUserId;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={() => router.push(`/bands/${bandId}/todos/${todo.id}`)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <span className="flex min-w-0 items-start gap-2">
            <span className="min-w-0 break-words font-medium">
              {todo.title}
            </span>
            {todo.shared && (
              <span className="mt-0.5 shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Shared
              </span>
            )}
          </span>
          <span className="text-xs minor-text-theme-colors">
            {todo.shared
              ? todo.ownerName
                ? `${todo.ownerId === currentUserId ? 'You' : todo.ownerName}`
                : 'Unassigned'
              : 'Private'}
            {' · '}
            {todo.deadline ? (
              /* Overdue is a property of an active todo, not a fourth
                 status — a cancelled one being "late" means nothing. */
              <span
                className={
                  overdue ? 'font-medium text-red-600 dark:text-red-400' : ''
                }
              >
                Due {todo.deadline}
                {overdue ? ' · overdue' : ''}
              </span>
            ) : (
              <>Added {formatTimeAgoOrDate(todo.createdAt)}</>
            )}
          </span>
        </button>

        <ActionMenu label={`Actions for ${todo.title}`} disabled={busy}>
          {/* "Share" here copies a link. The band-visibility toggle below
              is a different thing entirely, which is why that one keeps its
              words and this one says "Copy a link to…" to a screen reader. */}
          <MenuIconRow
            items={[
              {
                key: 'view',
                icon: <EyeIcon size={18} />,
                label: `View ${todo.title}`,
                title: 'View todo',
                onClick: () => router.push(todoHref(bandId, todo.id)),
              },
              {
                key: 'edit',
                icon: <PencilIcon size={18} />,
                label: `Edit ${todo.title}`,
                title: 'Edit todo',
                onClick: () =>
                  router.push(`/bands/${bandId}/todos/${todo.id}/edit`),
              },
              {
                key: 'share',
                icon: <LinkIcon size={18} />,
                label: `Copy a link to ${todo.title}`,
                title: 'Share todo',
                onClick: () =>
                  void share(todoHref(bandId, todo.id), 'Todo'),
              },
            ]}
          />
          {STATUS_MOVES.filter((m) => m.to !== todo.status).map((m) => (
            <ActionMenuItem key={m.to} onClick={() => onStatus(todo, m.to)}>
              {m.label}
            </ActionMenuItem>
          ))}
          {todo.shared ? (
            <ActionMenuItem
              disabled={!canUnshare}
              title={canUnshare ? undefined : 'Make yourself owner to unshare'}
              onClick={() => onShare(todo, false)}
            >
              Make private
            </ActionMenuItem>
          ) : (
            <ActionMenuItem onClick={() => onShare(todo, true)}>
              Make public
            </ActionMenuItem>
          )}
          <ActionMenuItem destructive onClick={() => onDelete(todo)}>
            Delete todo
          </ActionMenuItem>
        </ActionMenu>
      </div>

      {todo.links.length > 0 && (
        <NoteLinks links={todo.links} bandId={bandId} />
      )}
    </li>
  );
}
