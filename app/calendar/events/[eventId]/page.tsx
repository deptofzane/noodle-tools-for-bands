import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser, listEventMembers } from '@/lib/db/events';
import { getSetlist } from '@/lib/db/setlists';
import { formatDateLong, formatDuration, formatTimeRange } from '@/lib/format';
import { PageHeader } from '../../../PageHeader';
import { MapLink } from '../../../MapLink';
import { CollapsibleSection } from '../../../CollapsibleSection';
import { EventMembersClient } from './EventMembersClient';
import { EventSetlistActions } from './EventSetlistActions';
import { EventSetlistSongs } from './EventSetlistSongs';

/**
 * Event detail. Server shell — access-guarded via getEventForUser (band
 * member or added attendee). Owning-band members can manage the guest list.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  const { eventId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) notFound();

  const [members, bandMembership, setlist] = await Promise.all([
    listEventMembers(eventId),
    getMembership(user.id, event.bandId),
    event.setlistId ? getSetlist(event.setlistId) : Promise.resolve(null),
  ]);
  const canManage = bandMembership !== null;

  // Duration reflects actual songs, not markers (set breaks etc.).
  const setlistPlayable = setlist
    ? setlist.songs.filter((s) => s.conversationId)
    : [];
  const setlistTotal = setlistPlayable.reduce(
    (sum, s) => sum + (s.songLength ?? 0),
    0,
  );
  const setlistAllKnown = setlistPlayable.every((s) => s.songLength != null);

  return (
    <main className="mx-auto flex h-max max-w-2xl flex-col px-6 pb-4">
      <PageHeader defaultHref="/calendar">
        {canManage && (
          <Link
            href={`/calendar/events/${eventId}/edit`}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {/* className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900" */}
            Edit event
          </Link>
        )}
      </PageHeader>

      <div className="pb-4">
        <h1 className="title-text">{event.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          <Link
            href={`/bands/${event.bandId}`}
            className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            {event.bandName}
          </Link>
        </p>
      </div>

      {/* <section className="flex flex-col gap-2 rounded-lg text-sm mb-4"> */}
      <section className="flex flex-col gap-2 rounded-lg text-sm mb-4">
        <div>
          <span className="font-medium">Date:</span>{' '}
          {formatDateLong(event.date)}
        </div>
        {event.time && (
          <div>
            <span className="font-medium">Time:</span>{' '}
            {formatTimeRange(event.time, event.endTime)}
          </div>
        )}
        {event.location && (
          <div>
            <span className="font-medium">Location:</span>{' '}
            <MapLink address={event.location} />
          </div>
        )}
        {event.venueName && (
          <div>
            <span className="font-medium">Venue:</span>{' '}
            {canManage && event.venueId ? (
              <Link
                href={`/bands/${event.bandId}/venues/${event.venueId}/edit`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {event.venueName}
              </Link>
            ) : (
              event.venueName
            )}
          </div>
        )}
      </section>

      {event.details && (
        <section className="rounded-lg text-sm mb-4">
          <CollapsibleSection title="Details" persistKey="eventDetailsOpen">
            <p className="mt-2 ml-3 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
              {event.details}
            </p>
          </CollapsibleSection>
        </section>
      )}

      {canManage && event.notes && (
        <section className="rounded-lg text-sm mb-4">
          <CollapsibleSection title="Notes" persistKey="eventNotesOpen">
            <p className="mt-2 ml-3 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
              {event.notes}
            </p>
          </CollapsibleSection>
        </section>
      )}

      {setlist && (
        <section className="flex flex-col gap-2 border-t border-b border-neutral-200 py-2 dark:border-neutral-800 mt-2 mb-4">
          <span className="flex justify-between items-center">
              <Link
                href={`/bands/${event.bandId}/setlists/${setlist.id}`}
                className="hover:underline flex gap-1"
              >
                <h2 className="text-default font-normal text-neutral-200">
                  Setlist:
                </h2>
                <h2 className="text-default font-medium">{setlist.name}</h2>
              </Link>
            {canManage && (
              <EventSetlistActions
                bandId={event.bandId}
                eventId={eventId}
                setlistId={setlist.id}
                setlistName={setlist.name}
                songs={setlist.songs.map((s) => ({
                  conversationId: s.conversationId,
                  name: s.name,
                }))}
                fields={{
                  title: event.title,
                  date: event.date,
                  time: event.time,
                  endTime: event.endTime,
                  location: event.location,
                  details: event.details,
                  venueId: event.venueId,
                }}
              />
            )}
          </span>
          <div className="flex items-baseline justify-between gap-2">
            {setlist.songs.length > 0 && (
              <span className="shrink-0 text-xs text-neutral-500">
                Total length: &nbsp; {setlistAllKnown ? '' : '~'}
                {formatDuration(setlistTotal)}
              </span>
            )}
          </div>
          <EventSetlistSongs
            bandId={event.bandId}
            setlistId={setlist.id}
            canManage={canManage}
            songs={setlist.songs}
          />
        </section>
      )}

      <EventMembersClient
        eventId={eventId}
        initialMembers={members}
        canManage={canManage}
      />
    </main>
  );
}
