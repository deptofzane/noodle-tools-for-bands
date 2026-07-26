import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { PageHeader } from '../../../../PageHeader';
import { EMPTY_VENUE, VenueForm } from '../VenueForm';

/**
 * New-venue page. Server shell — checks band membership, then hands an empty
 * form to the client.
 */
export default async function NewVenuePage({
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
      <PageHeader defaultHref={`/bands/${bandId}?tab=venues`} />
      <VenueForm bandId={bandId} bandName={band.name} initial={EMPTY_VENUE} />
    </main>
  );
}
