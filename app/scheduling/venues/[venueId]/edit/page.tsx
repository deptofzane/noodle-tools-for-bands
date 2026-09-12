import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { getVenue } from '@/lib/db/venues';
import { PageHeader } from '../../../../PageHeader';
import { VenueForm } from '../../VenueForm';

/**
 * Edit-venue page. Server shell — the venue names its band, so membership is
 * checked against that, then its fields go to the client form.
 */
export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const venue = await getVenue(venueId);
  if (!venue) notFound();
  if (!(await getMembership(user.id, venue.bandId))) notFound();

  const band = await getBandById(venue.bandId);
  if (!band) notFound();

  return (
    <main className="main-container">
      <PageHeader defaultHref="/scheduling?view=venues" />
      <VenueForm
        bandId={venue.bandId}
        venueId={venueId}
        bandName={band.name}
        initial={{
          name: venue.name,
          address: venue.address ?? '',
          phone: venue.phone ?? '',
          email: venue.email ?? '',
          contactName: venue.contactName ?? '',
          notes: venue.notes ?? '',
        }}
      />
    </main>
  );
}
