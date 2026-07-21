import { PageHeader } from '../PageHeader';
import { auth } from '@/auth';
import { CalendarClient } from './CalendarClient';

/**
 * Calendar index. Server shell — verifies the session, then defers to the
 * client month view. Events (added next) will render into the day cells.
 */
export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

      <CalendarClient />
    </main>
  );
}
