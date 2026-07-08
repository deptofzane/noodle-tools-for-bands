import { PageHeader } from '../PageHeader';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { CalendarClient } from './CalendarClient';

/**
 * Calendar index. Server shell — verifies the session, then defers to the
 * client month view. Events (added next) will render into the day cells.
 */
export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');

  return (
    <main className="main-container">
      <PageHeader backHref="/library" />

      <div className="pb-4">
        <h1 className="title-text">Calendar</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Mark upcoming events for your bands.
        </p>
      </div>

      <CalendarClient />
    </main>
  );
}
