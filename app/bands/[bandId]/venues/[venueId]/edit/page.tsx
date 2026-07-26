import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getBandById, getMembership } from '@/lib/db/bands';
import { getVenue } from '@/lib/db/venues';
import { PageHeader } from '../../../../../PageHeader';
import { VenueForm } from '../../VenueForm';

/**
 * Edit-venue page. Server shell — checks band membership and that the venue
 * belongs to the band, then hands its fields to the client form.
 */
export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ bandId: string; venueId: string }>;
}) {
  const { bandId, venueId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const band = await getBandById(bandId);
  if (!band) notFound();

  const venue = await getVenue(venueId);
  if (!venue || venue.bandId !== bandId) notFound();

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}?tab=venues`} />
      <VenueForm
        bandId={bandId}
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
