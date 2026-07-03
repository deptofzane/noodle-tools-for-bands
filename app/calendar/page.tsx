import Link from 'next/link';
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
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/library"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Library
        </Link>
      </header>

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
