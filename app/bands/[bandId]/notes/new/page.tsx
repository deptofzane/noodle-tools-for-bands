import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { NoteForm } from '../NoteForm';

/** Write a new note in this band. Members only. */
export default async function NewNotePage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();
  const band = await getBandById(bandId);
  if (!band) notFound();

  return (
    <main className="main-container">
      <NoteForm bandId={bandId} bandName={band.name} />
    </main>
  );
}
