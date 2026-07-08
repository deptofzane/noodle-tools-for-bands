import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';

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
      <h3 className="font-serif mb-2 text-4xl">side<span className="text-cyan-600">stage</span></h3>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="title-text">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Use your Google account to access your audio files and notes.
        </p>

        <form
          action={async () => {
            'use server';
            await signIn('google', {
              redirectTo: callbackUrl ?? '/open-conversations',
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

        <p className="mt-4 text-xs text-neutral-500">
          You&apos;ll be asked to share your name and email. Drive access is
          requested separately, only when you open a folder.
        </p>
      </div>
    </main>
  );
}
