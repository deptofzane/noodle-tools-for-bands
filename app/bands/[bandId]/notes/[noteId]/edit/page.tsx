import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { getNoteForUser } from '@/lib/db/user-notes';
import { NoteForm } from '../../NoteForm';

/**
 * Edit a note. Only its author gets here — a shared note is readable by the
 * band but stays the author's to change, so anyone else is sent back to the
 * tab rather than shown a form that can't save.
 */
export default async function EditNotePage({
  params,
}: {
  params: Promise<{ bandId: string; noteId: string }>;
}) {
  const { bandId, noteId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const [band, note] = await Promise.all([
    getBandById(bandId),
    getNoteForUser(noteId, user.id),
  ]);
  if (!band || !note || note.bandId !== bandId) notFound();
  if (note.authorId !== user.id) redirect(`/bands/${bandId}?tab=notes`);

  return (
    <main className="main-container">
      <NoteForm
        bandId={bandId}
        bandName={band.name}
        noteId={note.id}
        initial={{
          title: note.title,
          body: note.body ?? '',
          shared: note.shared,
          links: note.links.map((l) => ({
            kind: l.kind,
            targetId: l.targetId,
            url: l.url,
            label: l.label,
          })),
        }}
      />
    </main>
  );
}
