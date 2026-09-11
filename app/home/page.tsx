import { auth } from '@/auth';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/lib/db/notifications';
import { getNextEventForUser, listEventsForUserInRange } from '@/lib/db/events';
import { listOpenPollsForUser } from '@/lib/db/polls';
import { listMyBands } from '@/lib/db/bands';
import { listMyTodos } from '@/lib/db/todos';
import { NotificationList } from './NotificationList';
import { HomePushNudge } from './HomePushNudge';
import { HomeTabs } from './HomeTabs';
import { ActivityTab } from './ActivityTab';

/**
 * Home — the signed-in landing, as two tabs: the notification feed, and
 * Activity (your todos, the week ahead, open polls and the week behind).
 *
 * Both tabs' data is fetched here in one round, including the tab you're not
 * looking at: it's a handful of cheap queries, and it means switching tabs —
 * or bands inside Activity — never waits on the network. What must not happen
 * eagerly is *mounting* the feed, which marks everything read; that's
 * `HomeTabs`' job, not this page's.
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.sub ?? '';

  // Activity's week and "recent" are windowed in the *viewer's* timezone,
  // client-side, because the server can't know it. So the server fetches a
  // buffered range around its own date: seven days back plus a day of slack
  // for Recent events, and six ahead plus the same slack (and a little more)
  // for the rolling week.
  const serverToday = new Date().toLocaleDateString('en-CA');
  const bufferFrom = new Date();
  bufferFrom.setDate(bufferFrom.getDate() - 8);
  const bufferTo = new Date();
  bufferTo.setDate(bufferTo.getDate() + 9);

  const [notifPage, unreadCount, events, nextEvent, openPolls, myBands, todos] =
    await Promise.all([
      listNotifications(userId),
      getUnreadNotificationCount(userId),
      listEventsForUserInRange(
        userId,
        bufferFrom.toLocaleDateString('en-CA'),
        bufferTo.toLocaleDateString('en-CA'),
      ),
      // For an empty week: the next event, however far out.
      getNextEventForUser(userId, serverToday),
      listOpenPollsForUser(userId),
      listMyBands(userId),
      listMyTodos(userId, 'active'),
    ]);

  return (
    <main className="main-container pt-2">
      <HomePushNudge />
      <HomeTabs
        unread={unreadCount}
        notifications={
          <NotificationList
            initial={notifPage.notifications}
            initialUnread={unreadCount}
            initialCursor={notifPage.nextCursor}
          />
        }
        activity={
          <ActivityTab
            currentUserId={userId}
            bands={myBands.map((b) => ({ id: b.id, name: b.name }))}
            todos={todos}
            events={events}
            nextEvent={nextEvent}
            polls={openPolls}
            serverToday={serverToday}
          />
        }
      />
    </main>
  );
}
