import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser, listEventMembers } from '@/lib/db/events';
import { getSetlist } from '@/lib/db/setlists';
import { formatDateRange, formatTimeRange } from '@/lib/format';
import { PageHeader } from '../../../PageHeader';
import { setlistQueue } from '../../../bands/[bandId]/bandDetailShared';
import { MapLink } from '../../../MapLink';
import { CollapsibleSection } from '../../../CollapsibleSection';
import { EventActions } from './EventActions';
import { EventMembersClient } from './EventMembersClient';
import { EventSetlistActions } from './EventSetlistActions';
import { EventSetlistSongs } from './EventSetlistSongs';
import { eventColorKey } from '../../eventColors';
import { eventLabel } from '../../eventLabel';

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

  return (
    <main className="main-container">
      <PageHeader defaultHref="/calendar" defaultHrefName="Calendar" />

      <div className="pb-4">
        <h1 className="title-text">{eventLabel(event)}</h1>
        <p className="mt-1 text-sm minor-text-theme-colors">
          <Link
            href={`/bands/${event.bandId}`}
            className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            {event.bandName}
          </Link>
        </p>
      </div>

      {/* The event's actions sit opposite its facts rather than in the
          back-nav header, where they read as part of the navigation. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <section className="flex flex-col gap-2 rounded-lg text-sm">
          {event.eventType && (
            <div>
              <span className="font-medium">Type:</span>{' '}
              {/* Same colour the calendar gives it, so the two read as one
                thing. A custom type still shows its own words — only the
                colour falls back. */}
              <span
                data-event-type={eventColorKey(event.eventType)}
                className="inline-flex items-center rounded border-l-2 border-[color:var(--event-accent)] bg-[color:var(--event-fill)] px-1.5 py-0.5 text-[color:var(--event-accent)]"
              >
                {event.eventType}
              </span>
            </div>
          )}
          <div>
            <span className="font-medium">Date:</span>{' '}
            {formatDateRange(event.date, event.endDate)}
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
              {/* Where the name takes you depends on what's most useful: to the
                venue in maps when we know where it is, otherwise to the venue
                itself, where someone can fill the address in. */}
              {event.venueAddress ? (
                <MapLink address={event.venueAddress} label={event.venueName} />
              ) : canManage && event.venueId ? (
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
        <div className="shrink-0">
          <EventActions eventId={eventId} canManage={canManage} />
        </div>
      </div>

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
                  // Cached audio is keyed by version — without this the
                  // download would save nothing playable.
                  audioVersionId: s.audioVersionId,
                }))}
                queue={setlistQueue({
                  name: setlist.name,
                  songs: setlist.songs,
                })}
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
          <EventSetlistSongs
            bandId={event.bandId}
            setlistId={setlist.id}
            setlistName={setlist.name}
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
