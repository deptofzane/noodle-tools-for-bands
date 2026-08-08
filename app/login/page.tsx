import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';
import { CredentialsForm } from './CredentialsForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Already signed in? Skip the login screen.
  const session = await auth();
  if (session) redirect('/');

  const { callbackUrl } = await searchParams;

  return (
    <main className="flex flex-col min-h-screen items-center justify-center px-6">
      <h3 className="font-serif text-4xl">
        noo<span className="text-cyan-600">dle</span>
      </h3>
      <span className="m-0 pb-3 minor-text-theme-colors text-sm">tools for<span className="text-cyan-600"> bands</span></span>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="title-text">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Use your Google account to access your audio files and notes.
        </p>

        <form
          action={async () => {
            'use server';
            await signIn('google', {
              redirectTo: callbackUrl ?? '/home',
            });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-4 text-xs minor-text-theme-colors">
          You&apos;ll be asked to share your name and email. Drive access is
          requested separately, only when you open a folder.
        </p>

        <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-900" />
          or
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-900" />
        </div>

        <CredentialsForm callbackUrl={callbackUrl ?? '/home'} />
      </div>
    </main>
  );
}
