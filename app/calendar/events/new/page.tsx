import { PageHeader } from '../../../PageHeader';
import { redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { listMyBands } from '@/lib/db/bands';
import { NewEventClient } from './NewEventClient';

/**
 * New-event screen. Server shell — the event is owned by a band, so it
 * hands the user's bands to the client for the owner selector.
 */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; bandId?: string; setlistId?: string }>;
}) {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const { date, bandId, setlistId } = await searchParams;
  const bands = (await listMyBands(user.id)).map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return (
    <main className="main-container">
      <PageHeader defaultHref="/calendar" />

      <NewEventClient
        bands={bands}
        defaultDate={typeof date === 'string' ? date : ''}
        defaultBandId={typeof bandId === 'string' ? bandId : ''}
        defaultSetlistId={typeof setlistId === 'string' ? setlistId : ''}
      />
    </main>
  );
}
