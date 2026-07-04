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
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <PageHeader backHref="/library" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Mark upcoming events for your bands.
        </p>
      </div>

      <CalendarClient />
    </main>
  );
}
