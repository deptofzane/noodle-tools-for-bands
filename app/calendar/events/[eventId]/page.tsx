import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser, listEventMembers } from '@/lib/db/events';
import { formatDateLong, formatTime12h } from '@/lib/format';
import { EventMembersClient } from './EventMembersClient';

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

  const [members, bandMembership] = await Promise.all([
    listEventMembers(eventId),
    getMembership(user.id, event.bandId),
  ]);
  const canManage = bandMembership !== null;

  return (
    <main className="mx-auto flex h-max max-w-2xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center justify-between gap-2 text-xs text-neutral-500">
        <Link
          href="/calendar"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Back to calendar
        </Link>
        {canManage && (
          <Link
            href={`/calendar/events/${eventId}/edit`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Edit event
          </Link>
        )}
      </header>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{event.bandName}</p>
      </div>

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <div>
          <span className="font-medium">Date:</span> {formatDateLong(event.date)}
        </div>
        {event.time && (
          <div>
            <span className="font-medium">Time:</span>{' '}
            {formatTime12h(event.time)}
          </div>
        )}
        {event.location && (
          <div>
            <span className="font-medium">Location:</span> {event.location}
          </div>
        )}
        {event.setlistId && (
          <div>
            <span className="font-medium">Setlist:</span>{' '}
            <Link
              href={`/bands/${event.bandId}/setlists/${event.setlistId}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {event.setlistName ?? 'View setlist'}
            </Link>
          </div>
        )}
        {event.details && (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Details:</span>
            <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
              {event.details}
            </p>
          </div>
        )}
      </section>

      <EventMembersClient
        eventId={eventId}
        initialMembers={members}
        canManage={canManage}
      />
    </main>
  );
}
