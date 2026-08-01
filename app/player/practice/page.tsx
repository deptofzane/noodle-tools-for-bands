import { redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { PageHeader } from '../../PageHeader';
import { QueuePracticeClient } from './QueuePracticeClient';

/**
 * Practice the player's current queue. Server shell only — the queue lives in
 * the browser (the playlist player's state), so there's nothing to load here;
 * this just guards the session and hands over the Picker key.
 */
export default async function QueuePracticePage() {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  return (
    <main>
      <div className="px-4 py-0">
        <PageHeader defaultHref="/home" defaultHrefName="Home" />
      </div>

      <QueuePracticeClient
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''}
      />
    </main>
  );
}
