import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership, listMembers } from '@/lib/db/bands';
import { TodoForm } from '../TodoForm';

/** New todo. Members only; the owner picker needs the band's roster. */
export default async function NewTodoPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const members = (await listMembers(bandId)).map((m) => ({
    id: m.userId,
    name: m.name ?? m.email ?? 'Bandmate',
  }));

  return (
    <main className="main-container">
      <TodoForm bandId={bandId} members={members} />
    </main>
  );
}
