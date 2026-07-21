import Link from 'next/link';
import { auth } from '@/auth';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/lib/db/notifications';
import {
  getNextEventForUser,
  listEventsForUserInRange,
} from '@/lib/db/events';
import { listOpenPollsForUser } from '@/lib/db/polls';
import { NotificationList } from './NotificationList';
import { OpenPolls } from './OpenPolls';
import { UpcomingShows } from './UpcomingShows';

/**
 * Home — the signed-in landing. Shows upcoming shows and the notification
 * feed, plus quick links into the app. Google Drive connection status now
 * lives on the Settings › Account tab, so this page no longer gates on it.
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.sub ?? '';

  // Upcoming shows are windowed to "the next 7 days" in the *viewer's*
  // timezone (done client-side in UpcomingShows). The server can't know the
  // viewer's TZ, so it fetches a buffered range around its own date — wide
  // enough (±1 day covers any TZ offset) that the client always has the
  // rows it needs to filter down to the exact local window.
  const serverToday = new Date().toLocaleDateString('en-CA');
  const bufferFrom = new Date();
  bufferFrom.setDate(bufferFrom.getDate() - 2);
  const bufferTo = new Date();
  bufferTo.setDate(bufferTo.getDate() + 9);

  const [notifPage, unreadCount, showsBuffer, nextEvent, openPolls] =
    await Promise.all([
      listNotifications(userId),
      getUnreadNotificationCount(userId),
      listEventsForUserInRange(
        userId,
        bufferFrom.toLocaleDateString('en-CA'),
        bufferTo.toLocaleDateString('en-CA'),
      ),
      // Fallback for when nothing lands in the next 7 days: the next event,
      // however far out. Windowed client-side to the viewer's "today".
      getNextEventForUser(userId, serverToday),
      listOpenPollsForUser(userId),
    ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-4">
      <UpcomingShows
        shows={showsBuffer}
        nextEvent={nextEvent}
        serverToday={serverToday}
      />
      <OpenPolls polls={openPolls} />
      <NotificationList
        initial={notifPage.notifications}
        initialUnread={unreadCount}
        initialCursor={notifPage.nextCursor}
      />

      <div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        Audio and conversations are organized by band now. Open a{' '}
        <Link href="/bands" className="text-blue-600 underline dark:text-blue-400">
          band
        </Link>{' '}
        to register audio (via the Drive picker) and open its conversations,
        or jump to your{' '}
        <Link
          href="/open-conversations"
          className="text-blue-600 underline dark:text-blue-400"
        >
          open conversations
        </Link>
        .
      </div>
    </main>
  );
}
