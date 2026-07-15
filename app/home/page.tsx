import Link from 'next/link';
import { auth, signIn } from '@/auth';
import { REQUIRED_DRIVE_SCOPES, hasAllDriveScopes } from '@/lib/google';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/lib/db/notifications';
import { NotificationList } from './NotificationList';

/**
 * The Library page.
 *
 * Three states:
 *
 * 1. Session expired (refresh token failed) → show a "Sign in again"
 *    CTA.
 * 2. Drive scopes NOT yet granted → show a "Connect Drive" CTA that
 *    triggers an incremental OAuth consent for both `drive.file`
 *    (write access for our own notes files in Phase 4) and
 *    `drive.readonly` (read access for listing folders and streaming
 *    audio). `include_granted_scopes=true` so the user's existing
 *    identity scopes aren't clobbered.
 * 3. Drive scopes granted → a short landing that points to Bands
 *    (where audio is registered via the Picker) and Open Conversations.
 *    Audio/notes are organized by band now, not by Drive folder.
 */
export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) return null;

  const driveConnected = hasAllDriveScopes(session.scopes);
  const refreshError = session.error === 'RefreshAccessTokenError';

  if (refreshError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="title-text">
          Session expired
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Your Google session needs to be refreshed. Please sign in again.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/home' });
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500"
          >
            Sign in again
          </button>
        </form>
      </main>
    );
  }

  // The notification feed is independent of Drive, so show it to everyone
  // — including users who haven't connected Drive (or don't use Google).
  const userId = session.user.sub ?? '';
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(userId),
    getUnreadNotificationCount(userId),
  ]);

  if (!driveConnected) {
    return (
      <main className="mx-auto flex max-w-xl flex-col justify-start gap-4 px-6 pt-6 sm:pt-20 h-max">
        <NotificationList initial={notifications} initialUnread={unreadCount} />
        <h1 className="title-text">
          Connect Google Drive
        </h1>
        <p className="text-base text-neutral-600 dark:text-neutral-300">
          <b>Sidestage</b> needs read access to your Drive (to list and play
          audio in folders you pick) and write access for the per-user
          notes files it creates. Google will ask you to consent on the
          next screen.
        </p>
        <p>
          What this effectively means is Sidestage needs two permissions to function correctly.
        </p>
        <p>
          The first is <b><i>See and download all your Google Drive files</i></b>. This lets the files picker work so you can navigate through your files, select what you want, and view them
          in the browser so you can add notes.
        </p>
        <p> 
          The second is <b><i>See, edit, create, and delete only the specific Google Drive files you use with this app</i></b>. Since all notes you read and create will be
          stored within Google Drive, Sidestage needs permission to read and write to Google Drive.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn(
              'google',
              { redirectTo: '/home' },
              {
                scope: ['openid', 'email', 'profile', ...REQUIRED_DRIVE_SCOPES].join(
                  ' ',
                ),
                include_granted_scopes: 'true',
              },
            );
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500"
          >
            Connect Drive
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-4">
      <header>
        <h1 className="title-text">Library</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Google Drive is connected.
        </p>
      </header>

      <NotificationList initial={notifications} initialUnread={unreadCount} />

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
