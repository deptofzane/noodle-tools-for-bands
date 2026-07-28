import { PageHeader } from '../PageHeader';
import { auth } from '@/auth';
import { BandsClient } from './BandsClient';

/**
 * Bands index. Server shell — verifies the session, then defers to the
 * client component for data fetching (mirrors the Open Conversations
 * page). Bands are app-internal, so no Drive scopes are required here.
 */
export default async function BandsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const currentUserId = session.user.sub ?? '';

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

      <div>
        <h1 className="title-text">Bands</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 mb-2">
          Bands group people and own conversations. Anyone in a band can see
          its audio and notes.
        </p>
      </div>

      <BandsClient currentUserId={currentUserId} />
    </main>
  );
}
