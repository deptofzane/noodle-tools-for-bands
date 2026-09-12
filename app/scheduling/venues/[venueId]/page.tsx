import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getVenue } from '@/lib/db/venues';
import { PageHeader } from '../../../PageHeader';
import { MapLink } from '../../../MapLink';
import { ViewVenueActions } from './ViewVenueActions';

/**
 * One venue, in full.
 *
 * The Venues list shows these as expandable rows; this is the page a shared
 * link points at, and where a long set of notes is actually readable.
 *
 * The venue names its own band, so — unlike when this lived under
 * `/bands/[bandId]/` — there is no band id in the URL that could disagree with
 * it. That removes the mismatch case entirely; what's left to check is whether
 * the viewer belongs to the band that owns it.
 */
export default async function ViewVenuePage({
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
        defaultHref="/scheduling?view=venues"
        defaultHrefName="Venues"
      />

      <div className="flex items-start justify-between gap-3">
        <h1 className="title-text break-words">{venue.name}</h1>
        <div className="shrink-0">
          <ViewVenueActions venueId={venue.id} name={venue.name} />
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
                className="text-accent hover:underline"
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
                className="text-accent hover:underline"
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
              <p className="whitespace-pre-wrap text-fg-muted">{venue.notes}</p>
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
