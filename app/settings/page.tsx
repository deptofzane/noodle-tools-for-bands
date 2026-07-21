import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getUserAccount } from '@/lib/db/accounts';
import { hasAllDriveScopes } from '@/lib/google';
import { getMutedKinds } from '@/lib/db/notifications';
import { getOrCreateFeedToken } from '@/lib/db/calendarFeeds';
import { startGoogleConnect, disconnectGoogle } from '../account-actions';
import { ThemeToggle } from '../ThemeToggle';
import { CalendarSubscription } from './CalendarSubscription';
import { NotificationPreferences } from './NotificationPreferences';
import { SettingsTabs, type SettingsTab } from './SettingsTabs';

const LINK_MESSAGES: Record<string, { text: string; tone: 'ok' | 'error' }> = {
  conflict: {
    text: 'That Google account is already linked to a different account.',
    tone: 'error',
  },
  exists: {
    text: 'You already have a different Google account linked — disconnect it first.',
    tone: 'error',
  },
  needs_password: {
    text: 'Set a password first so you can still sign in, then disconnect Google.',
    tone: 'error',
  },
  disconnected: { text: 'Google account disconnected.', tone: 'ok' },
};

/**
 * Settings page — tabbed. "Account" holds identity, the linked Google
 * account (connect/disconnect, Drive status), and session details;
 * "Notifications" and "Appearance" hold their preferences. Deep-linkable
 * via `?tab=`; account-link outcomes arrive via `?link=`.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; link?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { tab, link } = await searchParams;

  const dbUser = await getCurrentDbUser();
  const [mutedKinds, googleAccount, feedToken] = await Promise.all([
    getMutedKinds(session.user.sub ?? ''),
    dbUser ? getUserAccount(dbUser.id, 'google') : Promise.resolve(null),
    dbUser ? getOrCreateFeedToken(dbUser.id) : Promise.resolve(null),
  ]);
  const hasPassword = Boolean(dbUser?.passwordHash);
  const driveConnected = hasAllDriveScopes(session.scopes);
  const refreshError = session.error === 'RefreshAccessTokenError';
  const banner = link ? LINK_MESSAGES[link] : undefined;

  const account = (
    <div className="flex flex-col gap-6">
      {banner && (
        <p
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (banner.tone === 'ok'
              ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200')
          }
        >
          {banner.text}
        </p>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        {session.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="h-12 w-12 rounded-full"
          />
        )}
        <div className="flex-1">
          <p className="font-medium">
            {session.user.name ?? session.user.email}
          </p>
          <p className="text-xs text-neutral-500">{session.user.email}</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <button
            type="submit"
            className="min-w-max rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Google account (may differ from the login email) */}
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">Google account</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {googleAccount
                ? `Connected as ${googleAccount.email ?? 'your Google account'}. Used to import audio and sheet music from Drive.`
                : 'Connect a Google account to import audio and sheet music from Drive. It doesn’t need to match your login email.'}
            </p>
          </div>
          {googleAccount && driveConnected && !refreshError && (
            <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
              Drive connected
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!googleAccount ? (
            <form action={startGoogleConnect}>
              <input type="hidden" name="next" value="/settings?tab=account" />
              <button
                type="submit"
                className="btn-primary"
              >
                Connect Google
              </button>
            </form>
          ) : (
            <>
              {(refreshError || !driveConnected) && (
                <form action={startGoogleConnect}>
                  <input
                    type="hidden"
                    name="next"
                    value="/settings?tab=account"
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    {refreshError ? 'Reconnect Google' : 'Enable Drive access'}
                  </button>
                </form>
              )}
              <form action={disconnectGoogle}>
                <button
                  type="submit"
                  disabled={!hasPassword}
                  title={
                    hasPassword
                      ? undefined
                      : 'Set a password first so you can still sign in.'
                  }
                  className="btn-outline"
                >
                  Disconnect
                </button>
              </form>
            </>
          )}
        </div>
        {googleAccount && !hasPassword && (
          <p className="mt-2 text-[11px] text-neutral-500">
            Set a password (via “Forgot password”) before disconnecting, so you
            don’t lose access.
          </p>
        )}
      </div>

      <details className="rounded-lg border border-neutral-200 p-4 text-xs dark:border-neutral-800">
        <summary className="cursor-pointer font-medium text-neutral-700 dark:text-neutral-300">
          Session details
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
          {JSON.stringify(
            {
              sub: session.user.sub,
              email: session.user.email,
              scopes: session.scopes,
              error: session.error ?? null,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );

  const appearance = (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <p className="font-medium">Theme</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Choose a light or dark color scheme. Defaults to your system
          preference until you change it.
        </p>
      </div>
      <ThemeToggle />
    </div>
  );

  const tabs: SettingsTab[] = [
    { id: 'account', label: 'Account', content: account },
    {
      id: 'notifications',
      label: 'Notifications',
      content: <NotificationPreferences initialMuted={mutedKinds} />,
    },
    ...(feedToken
      ? [
          {
            id: 'calendar',
            label: 'Calendar',
            content: <CalendarSubscription token={feedToken} />,
          } satisfies SettingsTab,
        ]
      : []),
    { id: 'appearance', label: 'Appearance', content: appearance },
  ];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="title-text">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Manage your account and preferences.
        </p>
      </div>

      <SettingsTabs tabs={tabs} initialTabId={tab} />
    </main>
  );
}
