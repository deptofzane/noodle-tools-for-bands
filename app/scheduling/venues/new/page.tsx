import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { PageHeader } from '../../../PageHeader';
import { EMPTY_VENUE, VenueForm } from '../VenueForm';

/**
 * New-venue page. Server shell — checks band membership, then hands an empty
 * form to the client.
 *
 * The band arrives as `?bandId=`, the way `/scheduling/events/new` takes its
 * own. A venue belongs to a band, but this route no longer names one, and
 * there's nothing yet to read it off — so the list it's reached from passes
 * the band it was showing.
 */
export default async function NewVenuePage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string }>;
}) {
  const { bandId } = await searchParams;
  if (!bandId) notFound();

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const band = await getBandById(bandId);
  if (!band) notFound();

  return (
    <main className="main-container">
      <PageHeader defaultHref="/scheduling?view=venues" />
      <VenueForm bandId={bandId} bandName={band.name} initial={EMPTY_VENUE} />
    </main>
  );
}
