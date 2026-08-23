import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership, listMembers } from '@/lib/db/bands';
import { getTodoForUser } from '@/lib/db/todos';
import { TodoForm } from '../../TodoForm';

/**
 * Edit a todo.
 *
 * A shared todo is the band's, so any member gets here. A private one belongs
 * to its creator alone, and `getTodoForUser` returns null for anyone else —
 * so a bandmate gets a 404 rather than a form that won't save.
 */
export default async function EditTodoPage({
  params,
}: {
  params: Promise<{ bandId: string; todoId: string }>;
}) {
  const { bandId, todoId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const [todo, roster] = await Promise.all([
    getTodoForUser(todoId, user.id),
    listMembers(bandId),
  ]);
  if (!todo || todo.bandId !== bandId) notFound();

  return (
    <main className="main-container">
      <TodoForm
        bandId={bandId}
        todoId={todo.id}
        members={roster.map((m) => ({
          id: m.userId,
          name: m.name ?? m.email ?? 'Bandmate',
        }))}
        initial={{
          title: todo.title,
          description: todo.description ?? '',
          status: todo.status,
          shared: todo.shared,
          ownerId: todo.ownerId,
          deadline: todo.deadline,
          links: todo.links.map((l) => ({
            kind: l.kind,
            targetId: l.targetId,
            url: l.url,
            label: l.label,
            practice: l.practice,
          })),
        }}
      />
    </main>
  );
}
