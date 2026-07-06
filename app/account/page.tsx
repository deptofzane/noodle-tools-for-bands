import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '../ThemeToggle';

/**
 * Account page.
 *
 * For now, only a signed-in identity card and a Sign-out button.
 * Future home for: revoke Drive access, switch accounts, manage
 * notification preferences, etc.
 */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Manage the Google account this app is connected to.
        </p>
      </div>

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

      <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p className="font-medium">Appearance</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Choose a light or dark color scheme. Defaults to your system
            preference until you change it.
          </p>
        </div>
        <ThemeToggle />
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
    </main>
  );
}
