import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser, listEventMembers } from '@/lib/db/events';
import { getSetlist } from '@/lib/db/setlists';
import { formatDateLong, formatDuration, formatTime12h } from '@/lib/format';
import { PageHeader } from '../../../PageHeader';
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

  const [members, bandMembership, setlist] = await Promise.all([
    listEventMembers(eventId),
    getMembership(user.id, event.bandId),
    event.setlistId ? getSetlist(event.setlistId) : Promise.resolve(null),
  ]);
  const canManage = bandMembership !== null;

  const setlistTotal = setlist
    ? setlist.songs.reduce((sum, s) => sum + (s.songLength ?? 0), 0)
    : 0;
  const setlistAllKnown = setlist
    ? setlist.songs.every((s) => s.songLength != null)
    : true;

  return (
    <main className="mx-auto flex h-max max-w-2xl flex-col gap-4 px-6 py-4">
      <PageHeader backHref="/calendar" backLabel="Back to calendar">
        {canManage && (
          <Link
            href={`/calendar/events/${eventId}/edit`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Edit event
          </Link>
        )}
      </PageHeader>

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
        {event.details && (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Details:</span>
            <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
              {event.details}
            </p>
          </div>
        )}
      </section>

      {setlist && (
        <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          {canManage && (
            <Link
              href={`/bands/${event.bandId}/setlists/${setlist.id}/edit`}
              className="self-end text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Edit setlist
            </Link>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">
              <Link
                href={`/bands/${event.bandId}/setlists/${setlist.id}`}
                className="hover:underline"
              >
                {setlist.name}
              </Link>
            </h2>
            {setlist.songs.length > 0 && (
              <span className="shrink-0 text-xs text-neutral-500">
                {setlistAllKnown ? '' : '~'}
                {formatDuration(setlistTotal)}
              </span>
            )}
          </div>
          {setlist.songs.length === 0 ? (
            <p className="text-sm text-neutral-500">This setlist has no songs.</p>
          ) : (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
              {setlist.songs.map((s) => (
                <li key={s.conversationId}>
                  {s.audioFileName ?? 'Untitled audio'}
                  {s.songLength != null && (
                    <span className="text-neutral-400">
                      {` - ${formatDuration(s.songLength)}`}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
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
