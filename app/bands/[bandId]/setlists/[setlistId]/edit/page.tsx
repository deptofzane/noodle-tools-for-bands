import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import { getSetlist } from '@/lib/db/setlists';
import { EditSetlistClient } from './EditSetlistClient';

/**
 * Edit a setlist. Server shell — access-guarded, then hands the setlist's
 * ordered songs to the drag-and-drop client editor.
 */
export default async function EditSetlistPage({
  params,
}: {
  params: Promise<{ bandId: string; setlistId: string }>;
}) {
  const { bandId, setlistId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId) notFound();
  if (!(await getMembership(user.id, bandId))) notFound();

  // Candidate pool for adding: the band's unarchived songs.
  const bandSongs = (await listBandConversations(bandId))
    .filter((c) => !c.archived)
    .map((c) => ({
      conversationId: c.id,
      name: c.audioFileName ?? 'Untitled audio',
    }));

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <EditSetlistClient
        bandId={bandId}
        setlistId={setlistId}
        name={setlist.name}
        initialSongs={setlist.songs.map((s) => ({
          conversationId: s.conversationId,
          name: s.audioFileName ?? 'Untitled audio',
        }))}
        bandSongs={bandSongs}
      />
    </main>
  );
}
