import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser } from '@/lib/db/events';
import { listBandSetlistNames } from '@/lib/db/setlists';
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

  const setlists = await listBandSetlistNames(event.bandId);

  return (
    <main className="mx-auto flex h-max max-w-2xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href={`/calendar/events/${eventId}`}
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Back to event
        </Link>
      </header>

      <EditEventClient
        eventId={eventId}
        bandName={event.bandName}
        setlists={setlists}
        initial={{
          title: event.title,
          date: event.date,
          time: event.time ?? '',
          location: event.location ?? '',
          details: event.details ?? '',
          setlistId: event.setlistId ?? '',
        }}
      />
    </main>
  );
}
