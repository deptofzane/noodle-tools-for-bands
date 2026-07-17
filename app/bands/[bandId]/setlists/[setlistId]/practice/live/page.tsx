import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist, getSetlistPracticeSongs } from '@/lib/db/setlists';
import { Live } from '../../../../../../Live';

/**
 * Live mode for a setlist — a full-screen, chrome-free sheet-music view for
 * performing. Same access guard as Practice; the client component takes over
 * the viewport (no app header / player).
 */
export default async function LiveSetlistPage({
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
    <Live songs={songs} exitHref={`/bands/${bandId}/setlists/${setlistId}`} />
  );
}
