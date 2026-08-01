import { redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
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
      {/* The header is the client's — Practice puts "Edit song" in it, and it
          has to follow whichever song you've stepped to. */}
      <QueuePracticeClient
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''}
      />
    </main>
  );
}
