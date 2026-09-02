import { PageHeader } from '../../../PageHeader';
import { redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { listMyBands, getMembership } from '@/lib/db/bands';
import { getEventForUser } from '@/lib/db/events';
import { daySpan } from '@/lib/event-dates';
import { NewEventClient } from './NewEventClient';

/**
 * New-event screen. Server shell — the event is owned by a band, so it
 * hands the user's bands to the client for the owner selector.
 *
 * `?cloneFrom=` prefills from an existing event ("Clone event"). The source
 * is resolved here rather than passed through the URL because `details` and
 * `notes` are multi-line free text, and a link is a poor place for them.
 */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    bandId?: string;
    setlistId?: string;
    cloneFrom?: string;
  }>;
}) {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const { date, bandId, setlistId, cloneFrom } = await searchParams;

  /*
   * Two separate permissions, and both are needed.
   *
   * `getEventForUser` answers "may this person see it" — which admits an
   * attendee added to one event of a band they don't belong to. Creating the
   * copy needs more than that: the clone is owned by the source's band, so
   * without membership there is no band to put it in. Failing either check
   * drops the prefill and leaves an ordinary blank form, rather than 404ing
   * a screen the user is perfectly entitled to use.
   */
  const [source, myBands] = await Promise.all([
    cloneFrom ? getEventForUser(user.id, cloneFrom) : null,
    listMyBands(user.id),
  ]);
  const clone =
    source && (await getMembership(user.id, source.bandId))
      ? {
          bandId: source.bandId,
          title: source.title,
          eventType: source.eventType ?? '',
          time: source.time ?? '',
          endTime: source.endTime ?? '',
          // The date is deliberately not carried over, so an absolute end
          // date can't be either — its *length* is what survives.
          spanDays: daySpan(source.date, source.endDate),
          location: source.location ?? '',
          details: source.details ?? '',
          notes: source.notes ?? '',
          setlistId: source.setlistId ?? '',
          venueId: source.venueId ?? '',
        }
      : null;

  const bands = myBands.map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return (
    <main className="main-container">
      <PageHeader defaultHref="/calendar" />

      <NewEventClient
        bands={bands}
        defaultDate={typeof date === 'string' ? date : ''}
        // The clone's own band and setlist ride the existing props, so they
        // inherit the checks already there: a band the user isn't in falls
        // back, and a setlist is dropped unless that band's list confirms it.
        defaultBandId={
          clone?.bandId ?? (typeof bandId === 'string' ? bandId : '')
        }
        defaultSetlistId={
          clone?.setlistId ?? (typeof setlistId === 'string' ? setlistId : '')
        }
        clone={clone}
      />
    </main>
  );
}
