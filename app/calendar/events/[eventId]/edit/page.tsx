import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser } from '@/lib/db/events';
import { listBandSetlistNames } from '@/lib/db/setlists';
import { listBandVenues } from '@/lib/db/venues';
import { EditEventClient } from './EditEventClient';

/**
 * Edit-event screen. Server shell — access-guarded, and only members of the
 * owning band may edit (others are sent back to the event). Loads the band's
 * setlists for the association selector.
 */
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  const { eventId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) notFound();
  if (!(await getMembership(user.id, event.bandId)))
    redirect(`/calendar/events/${eventId}`);

  const [setlists, venues] = await Promise.all([
    listBandSetlistNames(event.bandId),
    listBandVenues(event.bandId),
  ]);

  return (
    <main className="main-container">
      <EditEventClient
        eventId={eventId}
        bandId={event.bandId}
        bandName={event.bandName}
        setlists={setlists}
        venues={venues.map((v) => ({
          id: v.id,
          name: v.name,
          address: v.address,
        }))}
        initial={{
          title: event.title,
          eventType: event.eventType ?? '',
          date: event.date,
          endDate: event.endDate ?? '',
          time: event.time ?? '',
          endTime: event.endTime ?? '',
          location: event.location ?? '',
          details: event.details ?? '',
          notes: event.notes ?? '',
          setlistId: event.setlistId ?? '',
          venueId: event.venueId ?? '',
        }}
      />
    </main>
  );
}
