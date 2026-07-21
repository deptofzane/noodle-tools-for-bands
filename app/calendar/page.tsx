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
  if (session.error === 'RefreshAccessTokenError') redirect('/home');

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

      <CalendarClient />
    </main>
  );
}
