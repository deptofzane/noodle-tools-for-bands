import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getNoteForUser } from '@/lib/db/user-notes';
import { formatTimeAgoOrDate } from '@/lib/format';
import { PageHeader } from '../../../../PageHeader';
import { NoteLinks } from '../NoteLinks';
import { ViewNoteActions } from './ViewNoteActions';

/**
 * One note, in full.
 *
 * The tab shows notes collapsed and clipped to fit a list; this is where a
 * long one is actually readable, and it's what a shared link points at.
 *
 * Two guards, deliberately: band membership, then the note's own visibility
 * via `getNoteForUser` — which returns null for someone else's private note,
 * so an unshared note 404s for a bandmate exactly as if it didn't exist.
 */
export default async function ViewNotePage({
  params,
}: {
  params: Promise<{ bandId: string; noteId: string }>;
}) {
  const { bandId, noteId } = await params;
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const note = await getNoteForUser(noteId, user.id);
  if (!note || note.bandId !== bandId) notFound();

  const mine = note.authorId === user.id;
  // Back to the view the note actually lives in, so returning doesn't land on
  // whichever tab was last used and leave it apparently missing.
  const backHref = `/bands/${bandId}?tab=notes&notes=${
    note.shared ? 'shared' : 'personal'
  }`;

  return (
    <main className="main-container">
      <PageHeader defaultHref={backHref} defaultHrefName="Notes" />

      <div className="flex items-start justify-between gap-3">
        <h1 className="title-text break-words">{note.title}</h1>
        <div className="shrink-0">
          <ViewNoteActions
            bandId={bandId}
            noteId={note.id}
            title={note.title}
            canManage={mine}
            backHref={backHref}
          />
        </div>
      </div>

      <p className="mt-1 text-xs minor-text-theme-colors">
        {mine ? 'You' : (note.authorName ?? 'A bandmate')} ·{' '}
        {formatTimeAgoOrDate(note.updatedAt)}
        {note.shared && <> · Shared with the band</>}
        {note.pinned && <> · Pinned</>}
      </p>

      {note.body ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
          {note.body}
        </p>
      ) : (
        <p className="mt-4 text-sm minor-text-theme-colors">
          This note has no body — just a title
          {note.links.length > 0 ? ' and its links' : ''}.
        </p>
      )}

      {note.links.length > 0 && (
        <div className="mt-4">
          <NoteLinks links={note.links} bandId={bandId} />
        </div>
      )}
    </main>
  );
}
