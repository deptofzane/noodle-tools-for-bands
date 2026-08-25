import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getVenue } from '@/lib/db/venues';
import { PageHeader } from '../../../../PageHeader';
import { MapLink } from '../../../../MapLink';
import { ViewVenueActions } from './ViewVenueActions';

/**
 * One venue, in full.
 *
 * The Venues tab shows these as expandable rows in a list; this is the page a
 * shared link points at, and where a long set of notes is actually readable.
 *
 * Server shell, like the edit page beside it: band membership first, then that
 * the venue belongs to *this* band — otherwise a venue id from another band
 * would render under this band's URL.
 */
export default async function ViewVenuePage({
  params,
}: {
  params: Promise<{ bandId: string; venueId: string }>;
}) {
  const { bandId, venueId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const venue = await getVenue(venueId);
  if (!venue || venue.bandId !== bandId) notFound();

  const hasDetails = Boolean(
    venue.address ||
    venue.phone ||
    venue.email ||
    venue.contactName ||
    venue.notes,
  );

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}?tab=venues`}
        defaultHrefName="Venues"
      />

      <div className="flex items-start justify-between gap-3">
        <h1 className="title-text break-words">{venue.name}</h1>
        <div className="shrink-0">
          <ViewVenueActions
            bandId={bandId}
            venueId={venue.id}
            name={venue.name}
          />
        </div>
      </div>

      {hasDetails ? (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {venue.address && (
            <div>
              <span className="font-medium">Address:</span>{' '}
              <MapLink address={venue.address} />
            </div>
          )}
          {venue.phone && (
            <div>
              <span className="font-medium">Phone:</span>{' '}
              <a
                href={`tel:${venue.phone}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {venue.phone}
              </a>
            </div>
          )}
          {venue.email && (
            <div>
              <span className="font-medium">Email:</span>{' '}
              <a
                href={`mailto:${venue.email}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {venue.email}
              </a>
            </div>
          )}
          {venue.contactName && (
            <div>
              <span className="font-medium">Contact:</span> {venue.contactName}
            </div>
          )}
          {venue.notes && (
            <div className="mt-2 flex flex-col gap-0.5">
              <span className="font-medium">Notes:</span>
              <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                {venue.notes}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm minor-text-theme-colors">
          No details saved for this venue yet.
        </p>
      )}
    </main>
  );
}
