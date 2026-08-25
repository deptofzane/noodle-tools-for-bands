import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getTodoForUser } from '@/lib/db/todos';
import { formatTimeAgoOrDate } from '@/lib/format';
import { PageHeader } from '../../../../PageHeader';
import { NoteLinks } from '../../notes/NoteLinks';
import { ViewTodoActions } from './ViewTodoActions';
import { todoTone } from '../todoTone';

const STATUS_LABEL = {
  active: 'Active',
  complete: 'Complete',
  cancelled: 'Cancelled',
} as const;

/**
 * One todo, in full.
 *
 * Two guards: band membership, then the todo's own visibility — a private
 * todo belongs to its creator, so a bandmate gets a 404 exactly as if it
 * weren't there.
 */
export default async function ViewTodoPage({
  params,
}: {
  params: Promise<{ bandId: string; todoId: string }>;
}) {
  const { bandId, todoId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const todo = await getTodoForUser(todoId, user.id);
  if (!todo || todo.bandId !== bandId) notFound();

  const mineNow = todo.ownerId === user.id;
  const canUnshare = todo.creatorId === user.id || todo.ownerId === user.id;

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}?tab=todos`}
        defaultHrefName="Todos"
      />

      {/* Same colour the row in the Todos tab carried, so a link opens on
          something that matches what was clicked. See `todoTone`. */}
      <div
        data-event-type={todoTone(todo.status, todo.shared)}
        className="flex items-start justify-between gap-3 border-l-[3px] border-l-[color:var(--event-accent)] pl-3"
      >
        <h1 className="title-text break-words text-[color:var(--event-accent)]">
          {todo.title}
        </h1>
        <div className="shrink-0">
          <ViewTodoActions
            bandId={bandId}
            todoId={todo.id}
            title={todo.title}
            status={todo.status}
            shared={todo.shared}
            canUnshare={canUnshare}
          />
        </div>
      </div>

      <p className="mt-1 text-xs minor-text-theme-colors">
        {STATUS_LABEL[todo.status]}
        {' · '}
        {todo.shared
          ? todo.ownerName
            ? `${mineNow ? 'You' : todo.ownerName}`
            : 'Unassigned'
          : 'Private'}
        {' · raised by '}
        {todo.creatorId === user.id
          ? 'you'
          : (todo.creatorName ?? 'a bandmate')}
        {' · '}
        {formatTimeAgoOrDate(todo.createdAt)}
        {todo.deadline && <> · due {todo.deadline}</>}
      </p>

      {todo.description ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
          {todo.description}
        </p>
      ) : (
        <p className="mt-4 text-sm minor-text-theme-colors">
          No description — just the title
          {todo.links.length > 0 ? ' and its links' : ''}.
        </p>
      )}

      {todo.links.length > 0 && (
        <div className="mt-4">
          <NoteLinks links={todo.links} bandId={bandId} />
        </div>
      )}
    </main>
  );
}
