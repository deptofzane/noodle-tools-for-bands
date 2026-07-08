import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist, getSetlistPracticeSongs } from '@/lib/db/setlists';
import { PageHeader } from '../../../../../PageHeader';
import { Practice } from '../../../../../Practice';

/**
 * Practice a setlist — step through its songs one at a time. Server shell:
 * the setlist must exist, belong to this band, and the viewer must be a
 * band member; then it loads the songs (with audio + sheet metadata).
 */
export default async function PracticeSetlistPage({
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

  const songs = await getSetlistPracticeSongs(setlistId);

  return (
    // <main className="main-container">
    <main className="">
      <div className="px-4 py-0">
      <PageHeader
        defaultHref={`/bands/${bandId}/setlists/${setlistId}`}
        defaultHrefName="Setlist"
      />

      </div>

      {/* <div className="flex flex-col gap-1 pb-4">
        <h1 className="title-text">{setlist.name}</h1>
        <p className="text-sm text-neutral-500">Practice</p>
      </div> */}

      <Practice songs={songs} />
    </main>
  );
}
